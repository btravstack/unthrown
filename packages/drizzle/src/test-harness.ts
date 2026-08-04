import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";

/** A running PGlite instance reachable through a real `pg.Pool`. */
export type PgFixture = {
  readonly pool: pg.Pool;
  /**
   * Release every resource the fixture holds, in the order that matters:
   * end the pool (so no client is mid-query against a socket about to
   * close), then stop the wire-protocol server, then close the underlying
   * WASM database. Safe to call even if a step above already failed or was
   * never fully started — each step is attempted independently and any
   * failures are reported together rather than short-circuiting cleanup.
   */
  readonly stop: () => Promise<void>;
};

/** host/port parsed out of `PGLiteSocketServer#getServerConn()`'s `"host:port"` string. */
const parseServerConn = (conn: string): { host: string; port: number } | undefined => {
  const separatorIndex = conn.lastIndexOf(":");
  if (separatorIndex === -1) return undefined;
  const host = conn.slice(0, separatorIndex);
  const port = Number(conn.slice(separatorIndex + 1));
  if (host === "" || !Number.isInteger(port)) return undefined;
  return { host, port };
};

/**
 * Run every step in order, continuing past a failing one instead of
 * aborting, and return whatever errors were thrown (empty if none). This is
 * the one piece of cleanup discipline `stop()` and both of `startPg`'s
 * partial-startup failure paths share: a broken release step must never
 * mask — or skip — the release step after it.
 *
 * Exported (this file ships to no consumer — it's test-only infrastructure,
 * excluded from coverage and never re-exported from the package) so the
 * collect-and-continue behaviour itself can be exercised directly with
 * deliberately failing steps, without needing to force a real PGlite/socket
 * failure to reach it.
 */
export const collectErrors = async (
  steps: readonly (() => Promise<unknown>)[],
): Promise<unknown[]> => {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      // Sequential and independent by design: every step runs regardless of
      // whether an earlier one threw, so one failure can never skip another
      // resource's release.
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
};

/**
 * Start a real PostgreSQL, in-process, reachable by the real `pg` client.
 *
 * PGlite is PostgreSQL compiled to WASM; `pglite-socket` serves it over the
 * Postgres wire protocol. That means the suite exercises the actual
 * node-postgres session we ship, with genuine SQLSTATE codes, and needs no
 * Docker — matching the repo convention of self-contained suites (see
 * `@unthrown/prisma`'s in-memory SQLite harness).
 *
 * Each call creates a brand-new, isolated `PGlite` instance and its own
 * socket server on an OS-assigned port, so concurrent fixtures (vitest
 * workers, or two fixtures in one test for a connection-loss scenario) never
 * share tables or data.
 */
export const startPg = async (): Promise<PgFixture> => {
  const db = await PGlite.create();

  const server = new PGLiteSocketServer({
    db,
    host: "127.0.0.1",
    // Port 0 lets the OS assign a free port — required so parallel vitest
    // workers (and, within one test, two concurrent fixtures) never collide
    // on a fixed port. The real assigned port is read back below via
    // `getServerConn()` once `start()` resolves.
    port: 0,
    // `PGLiteSocketServer` defaults `maxConnections` to 1. `pg-pool`
    // destroys and reopens its underlying connection on ANY query error —
    // not just a connection fault, but an ordinary SQL-level error like the
    // 23505 unique-violation these tests provoke deliberately on almost
    // every case (see errors.spec.ts / qualifyPgError). The replacement
    // connection races the dying one's asynchronous server-side teardown;
    // with the cap at 1 that race loses and surfaces as a raw `ECONNRESET`
    // out of `pool.connect()`, before any query even runs. Confirmed by the
    // Task 1 spike (task-1-report.md) across 3/3 repeat runs. Set generously
    // above what a single `pg.Pool` (below: max 4) needs even mid-teardown.
    maxConnections: 10,
  });

  /**
   * Startup failed after the WASM instance (and possibly the socket server)
   * was already created — release what exists, since the caller never gets
   * a `stop()` to do it for them, then surface the ORIGINAL triggering
   * error unchanged. A cleanup failure is appended alongside it in an
   * `AggregateError` rather than replacing it — the real cause of the
   * failed startup must never be masked by a secondary teardown problem.
   * `server.stop()` is safe to call even if `start()` never got as far as
   * opening a socket (it no-ops when nothing is listening), so it is always
   * included rather than assumed unnecessary.
   */
  const failStartup = async (primary: unknown): Promise<never> => {
    const cleanupErrors = await collectErrors([() => server.stop(), () => db.close()]);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primary, ...cleanupErrors],
        "startPg failed, and cleanup after the failure also failed to release all resources",
      );
    }
    throw primary;
  };

  try {
    await server.start();
  } catch (error) {
    // `return`, not `await` + fall-through: failStartup always throws, and
    // returning it (rather than awaiting then continuing) lets TS's control
    // flow analysis see that `address` below is only ever reached once
    // startup actually succeeded.
    return failStartup(error);
  }

  const address = parseServerConn(server.getServerConn());
  if (address === undefined) {
    return failStartup(
      new Error(`pglite-socket did not report a TCP host:port (got "${server.getServerConn()}")`),
    );
  }

  const pool = new pg.Pool({
    host: address.host,
    port: address.port,
    user: "postgres",
    database: "postgres",
    max: 4,
  });

  const stop = async (): Promise<void> => {
    // Sequential by design: pool, then server, then db — see the `stop` doc
    // comment above for why the order matters. `collectErrors` is what
    // makes each step run regardless of whether an earlier one threw, so a
    // failure in e.g. `pool.end()` can never leak the socket server or the
    // WASM instance behind it — the same discipline `failStartup` above
    // uses for the partial-startup paths.
    const errors = await collectErrors([() => pool.end(), () => server.stop(), () => db.close()]);
    if (errors.length > 0) {
      throw new AggregateError(errors, "test-harness stop() failed to release all resources");
    }
  };

  return { pool, stop };
};
