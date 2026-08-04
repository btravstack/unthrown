import { randomUUID } from "node:crypto";

import pg from "pg";
import { inject } from "vitest";

import type { PgServerAddress } from "./test-container.js";

/** A database of its own on the shared PostgreSQL, reachable through a `pg.Pool`. */
export type PgFixture = {
  readonly pool: pg.Pool;
  /**
   * Release every resource the fixture holds, in the order that matters: end
   * the pool (so no client is mid-query against a connection about to be
   * terminated), then drop the fixture's database. Safe to call even if a step
   * above already failed — each step is attempted independently and any
   * failures are reported together rather than short-circuiting cleanup.
   *
   * Not safe to call twice: `pg.Pool#end` throws on a second call. The one
   * spec that stops a fixture mid-test guards it with a flag of its own.
   */
  readonly stop: () => Promise<void>;
};

/**
 * Run every step in order, continuing past a failing one instead of
 * aborting, and return whatever errors were thrown (empty if none). This is
 * the one piece of cleanup discipline `stop()` and `startPg`'s
 * partial-startup failure path share: a broken release step must never
 * mask — or skip — the release step after it.
 *
 * Exported (this file ships to no consumer — it's test-only infrastructure,
 * excluded from coverage and never re-exported from the package) so the
 * collect-and-continue behaviour itself can be exercised directly with
 * deliberately failing steps, without needing to force a real pool/server
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
 * Run one statement on the maintenance database, on a connection opened and
 * closed for it.
 *
 * Throws **if and only if the statement itself failed.** That biconditional is
 * load-bearing, not incidental: `startPg` reads a rejection as "no database was
 * created" and returns without giving the caller a `stop()`. Were a merely
 * unclosable connection allowed to reject a `CREATE DATABASE` that had in fact
 * succeeded, the database would be orphaned with nothing left holding a handle
 * to drop it.
 *
 * @remarks
 * Short-lived rather than a module-level admin pool on purpose: a pool kept
 * open would hold the worker's event loop past the last test, and nothing in a
 * vitest worker gets a teardown hook to close it. `CREATE`/`DROP DATABASE`
 * cannot run inside a transaction block, which is also why this is a bare
 * `pg.Client` and not something borrowed from a fixture's pool.
 */
const runOnAdminDatabase = async (server: PgServerAddress, statement: string): Promise<void> => {
  const client = new pg.Client({ ...server });
  // A failure here leaves nothing to release — `connect()` cleans up its own
  // half-open socket — so it is outside the collect-and-continue block below.
  await client.connect();

  // Collected separately, not as one list: which step failed decides the
  // outcome, and a single list cannot say. The close is still attempted
  // regardless of how the statement went — the same collect-and-continue rule
  // as everywhere else here, so a failed statement can never skip it.
  const [statementError] = await collectErrors([() => client.query(statement)]);
  const [closeError] = await collectErrors([() => client.end()]);

  if (statementError === undefined) {
    // Deliberately swallowed. `pg` destroys the socket on its way out of a
    // failing `end()`, so there is no resource left for a caller to act on —
    // and reporting it here would break the biconditional above, which is the
    // only thing keeping a freshly created database from being orphaned.
    return;
  }
  // Re-thrown unchanged, so a caller (and a spec) still sees the real `pg`
  // error with its SQLSTATE on it; only a genuine pair — the statement failed
  // AND the connection would not close — needs wrapping.
  if (closeError === undefined) throw statementError;
  throw new AggregateError(
    [statementError, closeError],
    `test-harness admin statement failed: ${statement}`,
  );
};

/**
 * Create a fresh, isolated database on the suite's shared PostgreSQL and hand
 * back a `pg.Pool` pointed at it.
 *
 * @remarks
 * The server itself is one real PostgreSQL container, started once for the
 * whole run by the `globalSetup` in `test-container.ts` — so a fixture costs a
 * `CREATE DATABASE` (milliseconds), not a container boot. Isolation is per
 * database, not per schema: concurrent fixtures (vitest workers, or two
 * fixtures in one test) cannot see each other's tables, and a `search_path`
 * left over from a statement under test cannot leak one into the other.
 *
 * The predecessor of this harness served PGlite (PostgreSQL compiled to WASM)
 * over the wire protocol with `pglite-socket`, to keep the suite Docker-free.
 * It was abandoned for electric-sql/pglite#958: after an errored extended-query
 * batch PGlite answers the client's `Sync` with a SECOND `ReadyForQuery`, which
 * real PostgreSQL never sends — measured on 2000/2000 errored batches, and it
 * desynced `pg`'s response framing badly enough to fail this suite 7 runs in 8.
 */
export const startPg = async (): Promise<PgFixture> => {
  const server = inject("pgServer");
  // Hyphens are legal in a quoted identifier but make every hand-written query
  // in a debugging session need quoting too; 32 hex characters is still a UUID.
  const database = `unthrown_${randomUUID().replaceAll("-", "")}`;

  // Nothing to release if this rejects: `runOnAdminDatabase` throws if and only
  // if the STATEMENT failed, so a rejection here means no database exists — and
  // it closed its own connection either way.
  await runOnAdminDatabase(server, `CREATE DATABASE "${database}"`);

  const dropDatabase = (): Promise<void> =>
    // `WITH (FORCE)` terminates whatever is still connected. Required, not
    // defensive: a spec may deliberately hold a second pool on the fixture (the
    // lost-connection case does exactly that), and a plain DROP would fail with
    // 55006 rather than release the database. `IF EXISTS` keeps a re-drop from
    // turning a failed earlier step into a second, misleading error.
    runOnAdminDatabase(server, `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);

  const pool = new pg.Pool({ ...server, database, max: 4 });

  /**
   * Startup failed after the database was already created — release what
   * exists, since the caller never gets a `stop()` to do it for them, then
   * surface the ORIGINAL triggering error unchanged. A cleanup failure is
   * appended alongside it in an `AggregateError` rather than replacing it: the
   * real cause of the failed startup must never be masked by a secondary
   * teardown problem.
   */
  const failStartup = async (primary: unknown): Promise<never> => {
    const cleanupErrors = await collectErrors([() => pool.end(), dropDatabase]);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primary, ...cleanupErrors],
        "startPg failed, and cleanup after the failure also failed to release all resources",
      );
    }
    throw primary;
  };

  try {
    // `new pg.Pool` opens nothing, so this is what actually proves the fresh
    // database is reachable before a spec's first query hits it — and it gives
    // the partial-startup path above a real trigger.
    const probe = await pool.connect();
    probe.release();
  } catch (error) {
    // `return`, not `await` + fall-through: failStartup always throws, and
    // returning it lets TS's control flow analysis see the rest is only ever
    // reached once startup actually succeeded.
    return failStartup(error);
  }

  const stop = async (): Promise<void> => {
    // Sequential by design: pool, then database — see the `stop` doc comment
    // above for why the order matters. `collectErrors` is what makes each step
    // run regardless of whether an earlier one threw, so a failure in
    // `pool.end()` can never leak the database behind it — the same discipline
    // `failStartup` above uses for the partial-startup path.
    const errors = await collectErrors([() => pool.end(), dropDatabase]);
    if (errors.length > 0) {
      throw new AggregateError(errors, "test-harness stop() failed to release all resources");
    }
  };

  return { pool, stop };
};
