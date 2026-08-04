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

  try {
    await server.start();
  } catch (error) {
    // Startup failed after the WASM instance was created but before we
    // handed anything back to the caller — close it ourselves, since the
    // caller never receives a `stop()` to do it for them.
    await db.close();
    throw error;
  }

  const address = parseServerConn(server.getServerConn());
  if (address === undefined) {
    await server.stop();
    await db.close();
    throw new Error(
      `pglite-socket did not report a TCP host:port (got "${server.getServerConn()}")`,
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
    const errors: unknown[] = [];
    // Attempt every release step even if an earlier one throws, so a
    // failure in e.g. `pool.end()` can never leak the socket server or the
    // WASM instance behind it.
    for (const step of [() => pool.end(), () => server.stop(), () => db.close()]) {
      try {
        // Sequential by design: pool, then server, then db — see the `stop`
        // doc comment above for why the order matters.
        await step();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "test-harness stop() failed to release all resources");
    }
  };

  return { pool, stop };
};
