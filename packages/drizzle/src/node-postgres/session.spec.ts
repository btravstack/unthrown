import { DrizzleQueryError } from "drizzle-orm/errors";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core/dialect";
import { defineRelations } from "drizzle-orm/relations";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import pg from "pg";
import {
  allAsync,
  type AsyncResult,
  ErrAsync,
  fromSafePromise,
  isDefect,
  OkAsync,
  P,
} from "unthrown";
import { describe, expect, it } from "vitest";
// Registers the Result matchers used throughout this file (`toBeOkWith`, …).
import "@unthrown/vitest";

import { UniqueConstraintViolation } from "../errors.js";
import type { NodePgClient } from "./session.js";
import { NodePgUnthrownSession, NodePgUnthrownTransaction } from "./session.js";

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

const relations = defineRelations({ users });

/** One statement a fake client was asked to run. */
type Ran = {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly rowMode: string | undefined;
  readonly name: string | undefined;
  readonly types: pg.CustomTypesConfig | undefined;
};

/** Canned answers, keyed by the exact SQL text; anything else returns no rows. */
type Answers = Readonly<Record<string, () => Promise<{ rows: unknown[] }>>>;

const pgError = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`pg ${code}`), { code, ...extra });

/**
 * A recording stand-in for a node-postgres client.
 *
 * @remarks
 * The session drives a client through exactly one method — `query` — so a
 * recorder is the whole driver a sequencing test needs. What it proves is the
 * *order* of the statements (`begin` … `commit` / `rollback`) and which of them
 * were even issued; that the server honours them is Task 9's integration suite,
 * against a real database.
 */
class FakeClient {
  readonly ran: Ran[] = [];
  released = 0;

  constructor(private readonly answers: Answers = {}) {}

  query(
    config: {
      text: string;
      params?: unknown[];
      rowMode?: string;
      name?: string;
      types?: pg.CustomTypesConfig;
    },
    params: unknown[],
  ): Promise<{ rows: unknown[] }> {
    this.ran.push({
      sql: config.text,
      params,
      rowMode: config.rowMode,
      name: config.name,
      types: config.types,
    });
    const answer = this.answers[config.text];
    return answer === undefined ? Promise.resolve({ rows: [] }) : answer();
  }

  release(): void {
    this.released += 1;
  }
}

/**
 * A recording stand-in for a pool. Named so that the session's own pool
 * detection — `instanceof pg.Pool`, then a constructor-name check for the
 * cross-copy case — recognises it exactly as it recognises pg's `BoundPool`.
 *
 * @remarks
 * It records into its **own** `ran`, and deliberately does not delegate to the
 * checked-out client. A pool's `query` takes an arbitrary connection out of the
 * pool for each statement, so a transaction that ran through it would fan
 * `begin` / the work / `commit` across different connections — committing on a
 * connection with no transaction open, leaving the work uncommitted, and handing
 * a stale open transaction back to the pool. Two separate recorders are what
 * makes that visible: the checked-out client must hold the whole sequence and
 * the pool must hold nothing.
 */
class FakePool {
  readonly client: FakeClient;
  readonly ran: Ran[] = [];
  connects = 0;

  constructor(
    answers: Answers = {},
    private readonly connectFailure?: Error,
  ) {
    this.client = new FakeClient(answers);
  }

  async connect(): Promise<FakeClient> {
    this.connects += 1;
    if (this.connectFailure !== undefined) throw this.connectFailure;
    return this.client;
  }

  query(
    config: {
      text: string;
      rowMode?: string;
      name?: string;
      types?: pg.CustomTypesConfig;
    },
    params: unknown[],
  ): Promise<{ rows: unknown[] }> {
    this.ran.push({
      sql: config.text,
      params,
      rowMode: config.rowMode,
      name: config.name,
      types: config.types,
    });
    return Promise.resolve({ rows: [] });
  }
}

// `NodePgClient` is pg's union of three concrete classes, so a stand-in that
// implements only the `query` / `connect` / `release` surface the session uses
// has to be introduced through it.
const asClient = (fake: FakeClient | FakePool): NodePgClient => fake as unknown as NodePgClient;

const sessionOn = (client: FakeClient | FakePool) =>
  new NodePgUnthrownSession(asClient(client), new PgDialect(), relations);

/**
 * A transaction callback that hands back something which is not a `Result`.
 *
 * @remarks
 * Introduced through a cast because the types forbid it — which is exactly the
 * caller this guards: a JS consumer, or an `as`-cast one, writing
 * `async (tx) => { await tx.insert(…) }` and forgetting the `return`.
 * `isOk`/`isErr` read `.tag`, which *throws* on `null`/`undefined`, and that
 * TypeError used to be raised before any `rollback` was issued.
 */
const returning = (value: unknown) => (() => value) as unknown as () => AsyncResult<never, never>;

/** The non-`Result` returns a callback can plausibly leak. */
const nonResults: readonly (readonly [string, unknown])[] = [
  ["undefined", undefined],
  ["null", null],
  ["a plain object", {}],
  ["a number", 0],
];

/** The SQL text of everything a recorder was asked to run, in order. */
const statements = (recorder: FakeClient | FakePool) => recorder.ran.map((r) => r.sql);

describe("NodePgUnthrownSession — prepareQuery", () => {
  it("runs a query through the client and hands back its rows", async () => {
    const client = new FakeClient({
      'select "id", "name" from "users"': async () => ({ rows: [{ id: 1, name: "ada" }] }),
    });

    const result = await sessionOn(client)
      .prepareQuery({ sql: 'select "id", "name" from "users"', params: [] }, "objects", false)
      .execute();

    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("returns the driver's own result object in raw mode", async () => {
    const client = new FakeClient({ "select 1": async () => ({ rows: [{ n: 1 }] }) });

    const result = await sessionOn(client)
      .prepareQuery({ sql: "select 1", params: [] }, "raw", false)
      .execute();

    expect(result).toBeOkWith({ rows: [{ n: 1 }] });
  });

  it("asks the driver for array rows in arrays mode", async () => {
    const client = new FakeClient();

    await sessionOn(client)
      .prepareQuery({ sql: "select 1", params: [] }, "arrays", false)
      .execute();

    expect(client.ran[0]?.rowMode).toBe("array");
  });

  it("leaves the statement unnamed unless a name is asked for", async () => {
    const client = new FakeClient();

    await sessionOn(client).prepareQuery({ sql: "select 1", params: [] }, "raw", false).execute();

    expect(client.ran[0]?.name).toBeUndefined();
  });

  it("uses the given name, and generates one when asked for `true`", async () => {
    const client = new FakeClient();
    const session = sessionOn(client);

    await session.prepareQuery({ sql: "select 1", params: [] }, "raw", "by_id").execute();
    await session.prepareQuery({ sql: "select 2", params: [] }, "raw", true).execute();

    expect(client.ran[0]?.name).toBe("by_id");
    expect(client.ran[1]?.name).toEqual(expect.any(String));
  });

  it("asks the driver to leave temporal and numeric values unparsed", async () => {
    // Drizzle's column codecs do that parsing. A driver that had already turned
    // a `timestamptz` into a `Date` would have thrown the offset away — so the
    // session overrides those OIDs, and only those.
    const client = new FakeClient();

    await sessionOn(client).prepareQuery({ sql: "select 1", params: [] }, "raw", false).execute();

    const parser = client.ran[0]?.types?.getTypeParser;
    expect(parser?.(pg.types.builtins.TIMESTAMPTZ, "text")("2020-01-01 00:00:00+02")).toBe(
      "2020-01-01 00:00:00+02",
    );
    // Everything else keeps pg's own parser: this one yields a number.
    expect(parser?.(pg.types.builtins.INT4, "text")("42")).toBe(42);
  });

  it("qualifies a constraint violation into the error channel", async () => {
    const client = new FakeClient({
      insert: () => Promise.reject(pgError("23505", { constraint: "users_pkey" })),
    });

    const result = await sessionOn(client)
      .prepareQuery({ sql: "insert", params: [] }, "raw", false)
      .execute();

    expect(result).toBeErrTagged(
      "UniqueConstraintViolation",
      expect.objectContaining({ constraint: "users_pkey" }),
    );
  });
});

describe("NodePgUnthrownSession — transaction", () => {
  it("commits an Ok, and yields its value", async () => {
    const client = new FakeClient();

    const result = await sessionOn(client).transaction(() => OkAsync(42));

    expect(statements(client)).toEqual(["begin", "commit"]);
    expect(result).toBeOkWith(42);
  });

  it("runs the callback's own queries between begin and commit", async () => {
    const client = new FakeClient();

    // `.execute()` because the callback owes an `AsyncResult`: a builder is a
    // thenable that resolves to a `Result`, not an `AsyncResult` itself.
    const result = await sessionOn(client).transaction((tx) =>
      tx.select().from(users).where(eq(users.id, 1)).execute(),
    );

    expect(statements(client)).toHaveLength(3);
    expect(statements(client)[0]).toBe("begin");
    expect(statements(client)[1]).toContain('from "users"');
    expect(statements(client)[2]).toBe("commit");
    expect(result).toBeOk();
  });

  it("rolls back an Err, which still surfaces typed", async () => {
    const client = new FakeClient();
    const error = new UniqueConstraintViolation({
      constraint: "users_pkey",
      table: "users",
      detail: undefined,
      cause: undefined,
    });

    const result = await sessionOn(client).transaction(() => ErrAsync(error));

    expect(statements(client)).toEqual(["begin", "rollback"]);
    expect(result).toBeErrTagged("UniqueConstraintViolation");
  });

  it("rolls back a Defect, which stays a Defect", async () => {
    const client = new FakeClient();
    const boom = new Error("boom");

    const result = await sessionOn(client).transaction(() =>
      fromSafePromise(() => Promise.reject(boom)),
    );

    expect(statements(client)).toEqual(["begin", "rollback"]);
    expect(isDefect(result) && result.cause).toBe(boom);
  });

  it("rolls back a throwing callback, and defects with what it threw", async () => {
    const client = new FakeClient();
    const boom = new Error("thrown");

    const result = await sessionOn(client).transaction(() => {
      throw boom;
    });

    expect(statements(client)).toEqual(["begin", "rollback"]);
    expect(isDefect(result) && result.cause).toBe(boom);
  });

  it("never rejects, whatever the callback does", async () => {
    await expect(
      sessionOn(new FakeClient()).transaction(() => {
        throw new Error("x");
      }),
    ).resolves.toBeDefined();
  });

  it("applies a transaction config to begin", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction(() => OkAsync(1), {
      isolationLevel: "serializable",
      accessMode: "read write",
      deferrable: true,
    });

    expect(statements(client)[0]).toBe("begin isolation level serializable read write deferrable");
  });

  it("spells `not deferrable` when the config says so", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction(() => OkAsync(1), { deferrable: false });

    expect(statements(client)[0]).toBe("begin not deferrable");
  });

  it("defects on a failed begin, without issuing a commit or rollback", async () => {
    const client = new FakeClient({ begin: () => Promise.reject(pgError("57P01")) });
    let ran = false;

    const result = await sessionOn(client).transaction(() => {
      ran = true;
      return OkAsync(1);
    });

    expect(statements(client)).toEqual(["begin"]);
    expect(ran).toBe(false);
    expect(result).toBeDefect();
  });

  it("surfaces a deferred constraint violation raised by the commit itself", async () => {
    // A DEFERRABLE constraint is checked at COMMIT, so this is the one path
    // where a control statement produces a *modeled* error — which is why the
    // transaction's error channel carries PgQueryError whatever the callback's is.
    const client = new FakeClient({
      commit: () => Promise.reject(pgError("23505", { constraint: "users_pkey" })),
    });

    const result = await sessionOn(client).transaction(() => OkAsync(1));

    expect(statements(client)).toEqual(["begin", "commit"]);
    expect(result).toBeErrTagged("UniqueConstraintViolation");
  });

  it("defects on a commit that fails for an infrastructure reason", async () => {
    const client = new FakeClient({ commit: () => Promise.reject(pgError("08006")) });

    const result = await sessionOn(client).transaction(() => OkAsync(1));

    expect(result).toBeDefect();
  });

  it("keeps the error it was rolling back when the rollback itself fails", async () => {
    const rollbackFailure = pgError("08006");
    const client = new FakeClient({ rollback: () => Promise.reject(rollbackFailure) });
    const error = new UniqueConstraintViolation({
      constraint: "users_pkey",
      table: "users",
      detail: undefined,
      cause: undefined,
    });

    const result = await sessionOn(client).transaction(() => ErrAsync(error));

    // The transaction's state is now unknown, which is a bigger fact than the
    // domain error it was discarding — so the outcome is a defect. It must not
    // *destroy* that domain error, though: both are carried, ordered
    // `[thrown, original]` as core's failure-observer convention has it — the
    // rollback's own failure first, then the error it was rolling back.
    expect(result).toBeDefect();
    if (isDefect(result)) {
      expect(result.cause).toBeInstanceOf(AggregateError);
      const errors = (result.cause as AggregateError).errors as unknown[];
      expect(errors).toHaveLength(2);
      expect(errors[0]).toBeInstanceOf(DrizzleQueryError);
      expect((errors[0] as DrizzleQueryError).query).toBe("rollback");
      expect((errors[0] as DrizzleQueryError).cause).toBe(rollbackFailure);
      expect(errors[1]).toBe(error);
    }
  });

  it("keeps the thrown cause when the rollback after a throw also fails", async () => {
    const rollbackFailure = pgError("08006");
    const client = new FakeClient({ rollback: () => Promise.reject(rollbackFailure) });
    const boom = new Error("thrown");

    const result = await sessionOn(client).transaction(() => {
      throw boom;
    });

    expect(isDefect(result)).toBe(true);
    if (isDefect(result)) {
      expect(result.cause).toBeInstanceOf(AggregateError);
      // `[thrown, original]`: the rollback's failure, then what was thrown.
      const errors = (result.cause as AggregateError).errors as unknown[];
      expect(errors).toHaveLength(2);
      expect(errors[0]).toBeInstanceOf(DrizzleQueryError);
      expect((errors[0] as DrizzleQueryError).cause).toBe(rollbackFailure);
      expect(errors[1]).toBe(boom);
    }
  });

  it.each(nonResults)(
    "rolls back a callback that returned %s, and surfaces a Defect",
    async (_label, value) => {
      const client = new FakeClient();

      const result = await sessionOn(client).transaction(returning(value));

      // The rollback is the assertion: `null`/`undefined` used to throw a
      // TypeError out of `isOk` *before* this line was reached.
      expect(statements(client)).toEqual(["begin", "rollback"]);
      expect(result).toBeDefect();
      // Core's out-of-contract rule: a non-`Result` becomes a TypeError-caused
      // Defect at the `flatMap` guard, never a raw throw.
      expect(isDefect(result) && result.cause).toBeInstanceOf(TypeError);
    },
  );

  it("issues a bare begin when the config asks for nothing", async () => {
    // `{}` renders no clauses, and `begin ` (with the trailing space) is a
    // syntax error on a real server — so the clause has to be omitted entirely.
    const client = new FakeClient();

    const result = await sessionOn(client).transaction(() => OkAsync(1), {});

    expect(statements(client)).toEqual(["begin", "commit"]);
    expect(result).toBeOkWith(1);
  });

  it("hands the callback a transaction, not the database", async () => {
    let handle: unknown;

    await sessionOn(new FakeClient()).transaction((tx) => {
      handle = tx;
      return OkAsync(1);
    });

    expect(handle).toBeInstanceOf(NodePgUnthrownTransaction);
  });
});

describe("NodePgUnthrownSession — pooling", () => {
  it("connects a client, runs the transaction on it, and releases it", async () => {
    const pool = new FakePool();

    const result = await sessionOn(pool).transaction(() => OkAsync(1));

    expect(pool.connects).toBe(1);
    expect(statements(pool.client)).toEqual(["begin", "commit"]);
    // Nothing went through the pool itself: every statement of a transaction
    // must run on the one checked-out connection, or `commit` lands on a
    // connection with no transaction open and the work is never committed.
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
    expect(result).toBeOk();
  });

  it("runs the callback's own queries on the checked-out connection too", async () => {
    const pool = new FakePool();

    const result = await sessionOn(pool).transaction((tx) =>
      tx.select().from(users).where(eq(users.id, 1)).execute(),
    );

    // The realistic shape: a builder query inside a pooled transaction. It is
    // the transaction's session — the one built on the checked-out client —
    // that the builder must have been handed.
    expect(statements(pool.client)).toHaveLength(3);
    expect(statements(pool.client)[0]).toBe("begin");
    expect(statements(pool.client)[1]).toContain('from "users"');
    expect(statements(pool.client)[2]).toBe("commit");
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
    expect(result).toBeOk();
  });

  it("releases the client after a rollback", async () => {
    const pool = new FakePool();

    await sessionOn(pool).transaction(() =>
      ErrAsync(
        new UniqueConstraintViolation({
          constraint: undefined,
          table: undefined,
          detail: undefined,
          cause: undefined,
        }),
      ),
    );

    expect(statements(pool.client)).toEqual(["begin", "rollback"]);
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
  });

  it("releases the client when the callback throws", async () => {
    const pool = new FakePool();

    await sessionOn(pool).transaction(() => {
      throw new Error("boom");
    });

    expect(statements(pool.client)).toEqual(["begin", "rollback"]);
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
  });

  it("runs a nested transaction's savepoints on the checked-out connection", async () => {
    const pool = new FakePool();

    await sessionOn(pool).transaction((tx) => tx.transaction(() => OkAsync(1)));

    expect(statements(pool.client)).toEqual([
      "begin",
      "savepoint sp1",
      "release savepoint sp1",
      "commit",
    ]);
    expect(statements(pool)).toEqual([]);
  });

  it("releases the client when the begin fails", async () => {
    const pool = new FakePool({ begin: () => Promise.reject(pgError("08006")) });

    const result = await sessionOn(pool).transaction(() => OkAsync(1));

    expect(statements(pool.client)).toEqual(["begin"]);
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
    expect(result).toBeDefect();
  });

  it("releases the client when the commit fails", async () => {
    const pool = new FakePool({ commit: () => Promise.reject(pgError("08006")) });

    await sessionOn(pool).transaction(() => OkAsync(1));

    expect(statements(pool.client)).toEqual(["begin", "commit"]);
    expect(statements(pool)).toEqual([]);
    expect(pool.client.released).toBe(1);
  });

  it("defects when the pool cannot hand out a client, with nothing to release", async () => {
    const failure = new Error("pool exhausted");
    const pool = new FakePool({}, failure);

    const result = await sessionOn(pool).transaction(() => OkAsync(1));

    expect(isDefect(result) && result.cause).toBe(failure);
    expect(pool.client.released).toBe(0);
    expect(statements(pool.client)).toEqual([]);
    // In particular it does not fall back to running the transaction on the pool.
    expect(statements(pool)).toEqual([]);
  });

  it.each(nonResults)(
    "releases a CLEAN client when the callback returned %s",
    async (_label, value) => {
      const pool = new FakePool();

      const first = await sessionOn(pool).transaction(returning(value));

      expect(statements(pool.client)).toEqual(["begin", "rollback"]);
      expect(pool.client.released).toBe(1);
      expect(first).toBeDefect();

      // The part that actually bites: without the guard the TypeError escaped
      // before any `rollback` was issued, so `#runTransaction`'s `finally`
      // handed the connection back to the pool with BEGIN still open — and the
      // next borrower ran inside a stale transaction. Proving the client is
      // clean means running another transaction on it.
      const second = await sessionOn(pool).transaction(() => OkAsync(1));

      expect(statements(pool.client)).toEqual(["begin", "rollback", "begin", "commit"]);
      expect(pool.client.released).toBe(2);
      expect(second).toBeOkWith(1);
    },
  );

  it("recognises a real pg.Pool by identity, not only by name", async () => {
    // The name check is the fallback for a second copy of `pg` in the tree; a
    // pool from *this* copy must be caught by the `instanceof` arm. Constructing
    // a pool opens no connection, and `connect` is stubbed so none is opened
    // here either.
    const client = new FakeClient();
    const pool = new pg.Pool();
    pool.connect = async () => asClient(client) as pg.PoolClient;

    const result = await new NodePgUnthrownSession(pool, new PgDialect(), relations).transaction(
      () => OkAsync(1),
    );

    expect(statements(client)).toEqual(["begin", "commit"]);
    expect(client.released).toBe(1);
    expect(result).toBeOkWith(1);
  });

  it("never connects or releases a plain client", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction(() => OkAsync(1));

    expect(client.released).toBe(0);
  });
});

describe("NodePgUnthrownTransaction — nested transactions", () => {
  it("wraps a nested transaction in a savepoint, released on Ok", async () => {
    const client = new FakeClient();

    const result = await sessionOn(client).transaction((tx) =>
      tx.transaction(() => OkAsync("inner")),
    );

    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "release savepoint sp1",
      "commit",
    ]);
    expect(result).toBeOkWith("inner");
  });

  it("rolls back to the savepoint on an Err, and still commits the outer scope", async () => {
    const client = new FakeClient();
    const error = new UniqueConstraintViolation({
      constraint: undefined,
      table: undefined,
      detail: undefined,
      cause: undefined,
    });

    const result = await sessionOn(client).transaction((tx) =>
      tx
        .transaction(() => ErrAsync(error))
        // The inner scope is undone; the outer one decides for itself. Every
        // case is named — the nested `transaction` widens `E` to the whole
        // PgQueryError union, since its own control statements can fail.
        .recoverErrCases((m) =>
          m.with(
            P.tag("UniqueConstraintViolation"),
            P.tag("ForeignKeyViolation"),
            P.tag("CheckViolation"),
            P.tag("ExclusionViolation"),
            P.tag("NotNullViolation"),
            () => "recovered",
          ),
        ),
    );

    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "rollback to savepoint sp1",
      "commit",
    ]);
    expect(result).toBeOkWith("recovered");
  });

  it("rolls back to the savepoint when the nested callback throws", async () => {
    const client = new FakeClient();

    const result = await sessionOn(client).transaction((tx) =>
      tx.transaction(() => {
        throw new Error("boom");
      }),
    );

    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "rollback to savepoint sp1",
      "rollback",
    ]);
    expect(result).toBeDefect();
  });

  it("gives each savepoint in a nested chain its own name", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction((tx) =>
      tx.transaction((inner) => inner.transaction(() => OkAsync(1))),
    );

    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "savepoint sp2",
      "release savepoint sp2",
      "release savepoint sp1",
      "commit",
    ]);
  });

  it("hands a nested transaction the enclosing one's parseRqbJson", async () => {
    // Dead until the driver factory sets it, and silently wrong from then on:
    // a nested handle built with the 4-argument form would default it to false
    // and decode relational JSON differently from its parent. Read off the
    // handle because that is the only place it is observable — the database
    // base class forwards it to its query builders without keeping it.
    const readParseRqbJson = (tx: NodePgUnthrownTransaction<typeof relations>): unknown =>
      (tx as unknown as { parseRqbJson: unknown }).parseRqbJson;

    const outer = new NodePgUnthrownTransaction(
      new PgDialect(),
      sessionOn(new FakeClient()),
      relations,
      undefined,
      true,
    );
    let nested: NodePgUnthrownTransaction<typeof relations> | undefined;

    await outer.transaction((tx) => {
      nested = tx;
      return OkAsync(1);
    });

    expect(readParseRqbJson(outer)).toBe(true);
    expect(nested).toBeDefined();
    expect(nested === undefined ? undefined : readParseRqbJson(nested)).toBe(true);
  });

  it("gives sequential sibling savepoints distinct names", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction((tx) =>
      tx.transaction(() => OkAsync(1)).flatMap(() => tx.transaction(() => OkAsync(2))),
    );

    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "release savepoint sp1",
      "savepoint sp2",
      "release savepoint sp2",
      "commit",
    ]);
  });

  it("gives concurrent sibling savepoints distinct names", async () => {
    // Two nested transactions in flight at once on the one connection. Named by
    // nesting depth they would both be `sp1`, and the first `rollback to
    // savepoint sp1` would unwind the other's work — `allAsync` makes that an
    // easy thing to write, so the counter has to be shared, not per-depth.
    const client = new FakeClient();

    const result = await sessionOn(client).transaction((tx) =>
      allAsync([tx.transaction(() => OkAsync(1)), tx.transaction(() => OkAsync(2))]),
    );

    const savepoints = statements(client).filter((s) => s.startsWith("savepoint "));
    expect(savepoints).toHaveLength(2);
    expect(new Set(savepoints).size).toBe(2);
    // Each one is released under its own name, and both are live at once.
    expect(statements(client)).toEqual([
      "begin",
      "savepoint sp1",
      "savepoint sp2",
      "release savepoint sp1",
      "release savepoint sp2",
      "commit",
    ]);
    expect(result).toBeOkWith([1, 2]);
  });
});

describe("NodePgUnthrownTransaction — setTransaction", () => {
  it("issues a set transaction statement", async () => {
    const client = new FakeClient();

    await sessionOn(client).transaction((tx) =>
      tx.setTransaction({ isolationLevel: "repeatable read" }).flatMap(() => OkAsync(1)),
    );

    expect(statements(client)).toContain("set transaction isolation level repeatable read");
  });

  it("issues nothing at all when the config asks for nothing", async () => {
    // Postgres' grammar demands at least one mode after `set transaction`, so
    // `set transaction ` was a syntax error reported as a defect for a call that
    // requested no change.
    const client = new FakeClient();

    const result = await sessionOn(client).transaction((tx) =>
      tx.setTransaction({}).flatMap(() => OkAsync(1)),
    );

    expect(statements(client)).toEqual(["begin", "commit"]);
    expect(result).toBeOkWith(1);
  });
});
