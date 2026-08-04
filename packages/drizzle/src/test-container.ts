import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

/**
 * The PostgreSQL every test in this package runs against.
 *
 * Pinned to an exact patch, deliberately: a floating `latest` (or even a bare
 * `18-alpine`) makes the suite non-reproducible — a server upgrade could change
 * an error message, a constraint's generated name or a SQLSTATE under a run
 * that changed no code of ours. Bumping it is a commit.
 */
const POSTGRES_IMAGE = "postgres:18.4-alpine";

/** The superuser every fixture connects as. */
const PG_USER = "postgres";

/**
 * The maintenance database `startPg()` issues its `CREATE DATABASE` /
 * `DROP DATABASE` on — never the one a fixture's queries run against (a
 * database cannot be dropped from a session connected to it).
 */
const PG_ADMIN_DATABASE = "postgres";

/** Where the one shared server is listening, and who to connect to it as. */
export type PgServerAddress = {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly database: string;
};

declare module "vitest" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging into Vitest's own `interface ProvidedContext`, which a type alias cannot do
  interface ProvidedContext {
    readonly pgServer: PgServerAddress;
  }
}

/**
 * Start ONE PostgreSQL container for the whole run and hand its address to
 * every worker.
 *
 * @remarks
 * This is a vitest `globalSetup`, so it runs once in the main process, before
 * any worker is spawned, and its returned teardown runs once after the last
 * one exits. That placement is the performance decision: a container per
 * fixture — the suite creates a dozen — would cost seconds each, and a
 * module-level singleton inside the harness would still boot one container per
 * worker, since every test file gets its own module registry. The workers read
 * the address back with `inject("pgServer")`, and `startPg()` isolates fixtures
 * with a fresh `CREATE DATABASE` inside this one server instead.
 *
 * The container is left reachable without a password (`POSTGRES_HOST_AUTH_METHOD
 * = trust`): the specs build connection strings and `connection` objects by
 * hand to exercise `drizzle()`'s client forms, and a credential in each of them
 * would be noise in a server that listens only on an ephemeral loopback port.
 * Testcontainers' own Ryuk reaper stops the container even if this process is
 * killed before the teardown runs.
 */
const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withUsername(PG_USER)
    .withDatabase(PG_ADMIN_DATABASE)
    .withEnvironment({ POSTGRES_HOST_AUTH_METHOD: "trust" })
    .withCommand([
      "postgres",
      // Durability is worthless to a server that is deleted at the end of the
      // run, and paying for it on every COMMIT is the single biggest cost of
      // running the suite against a real server.
      "-c",
      "fsync=off",
      "-c",
      "full_page_writes=off",
      "-c",
      "synchronous_commit=off",
      // Every fixture holds a pool of its own and several run concurrently
      // across workers; the stock 100 is close enough to the peak to be worth
      // lifting out of the way.
      "-c",
      "max_connections=200",
    ])
    .start();

  project.provide("pgServer", {
    host: container.getHost(),
    port: container.getPort(),
    user: PG_USER,
    database: PG_ADMIN_DATABASE,
  });

  return async () => {
    await container.stop();
  };
};

export default setup;
