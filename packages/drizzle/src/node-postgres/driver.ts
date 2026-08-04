import { entityKind } from "drizzle-orm/entity";
import { DefaultLogger, type Logger } from "drizzle-orm/logger";
import { nodePgCodecs } from "drizzle-orm/node-postgres/codecs";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres/session";
import type { PgCodecs } from "drizzle-orm/pg-core/codecs";
import { PgDialect } from "drizzle-orm/pg-core/dialect";
import type { PgTransactionConfig } from "drizzle-orm/pg-core/session";
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import pg from "pg";
import type { AsyncResult } from "unthrown";

import type { PgQueryError } from "../errors.js";
import { UnthrownPgDatabase } from "../pg-core/db.js";
import type { NodePgClient } from "./session.js";
import { NodePgUnthrownSession, type NodePgUnthrownTransaction } from "./session.js";

/**
 * The options {@link drizzle} accepts.
 *
 * @remarks
 * Drizzle's `DrizzlePgConfig` minus the members this package does not carry:
 *
 * - `schema` — drizzle removed it from the Postgres config in v1; `relations`
 *   is the successor.
 * - `cache` — the query cache hangs off `db.$cache` and invalidates on mutation,
 *   neither of which this database facade models yet.
 * - `jit` — drizzle's JIT row mappers are gated behind an `@internal`
 *   compatibility probe that is stripped from its published `.d.ts`, so it
 *   cannot be forwarded without reimplementing the probe. Leaving it out gives
 *   drizzle's own default (the premade mappers), so nothing silently changes.
 *
 * @typeParam TRelations - the relational schema backing `db.query`.
 *
 * @category Database
 */
export type UnthrownDrizzleConfig<TRelations extends AnyRelations = EmptyRelations> = {
  /** The relational schema, as built by drizzle's `defineRelations`. */
  readonly relations?: TRelations | undefined;
  /**
   * `true` for drizzle's `DefaultLogger` (every statement to the console), a
   * `Logger` of your own, or `false`/absent for none.
   */
  readonly logger?: boolean | Logger | undefined;
  /** Column codecs, overriding node-postgres' own. */
  readonly codecs?: PgCodecs | undefined;
};

/** The configuration object form, before its client is separated from the rest. */
type ClientConfig<TRelations extends AnyRelations> = UnthrownDrizzleConfig<TRelations> & {
  readonly client?: NodePgClient | undefined;
  readonly connection?: string | pg.PoolConfig | undefined;
};

/**
 * A node-postgres database whose every query resolves to an `AsyncResult`.
 *
 * @remarks
 * The unthrown sibling of drizzle's `NodePgDatabase`. Build one with
 * {@link drizzle} rather than by hand — the factory is what pairs a dialect, a
 * session and a client.
 *
 * @typeParam TRelations - the relational schema backing `db.query`.
 *
 * @category Database
 */
export class NodePgUnthrownDatabase<
  TRelations extends AnyRelations = EmptyRelations,
> extends UnthrownPgDatabase<NodePgQueryResultHKT, TRelations> {
  static override readonly [entityKind]: string = "NodePgUnthrownDatabase";

  /**
   * The node-postgres session this database runs on.
   *
   * @remarks
   * Narrows the base's `UnthrownPgSession<unknown>` — whose transaction handle
   * is deliberately unresolved, because the base facade is built *underneath*
   * the transaction class that extends it — to the one this driver actually
   * holds. `declare` because the base already assigns it; this only restates
   * its type, which is what gives {@link transaction} a typed handle.
   */
  declare readonly session: NodePgUnthrownSession<TRelations>;

  constructor(
    dialect: PgDialect,
    session: NodePgUnthrownSession<TRelations>,
    relations: TRelations,
  ) {
    super(dialect, session, relations);
  }

  /**
   * Run `fn` inside a database transaction.
   *
   * @remarks
   * **`Ok` commits; `Err` and `Defect` both roll back.** An `Err` re-surfaces
   * typed in the error channel, so rolling back costs no information — and
   * because rollback *is* returning an `Err`, there is no `tx.rollback()`.
   *
   * {@link PgQueryError} joins the callback's own error channel because the
   * transaction's control statements can fail on their own account: a
   * `DEFERRABLE` constraint is checked at `COMMIT`, so a unique violation can be
   * raised by the commit rather than by any statement the callback ran.
   *
   * The callback owes an `AsyncResult`, so each step ends in `.execute()` — a
   * builder is a thenable that resolves to a `Result`, not an `AsyncResult`
   * itself — and the steps compose with `flatMap` or `DoAsync().bind(…)`.
   *
   * A one-line delegate to {@link NodePgUnthrownSession.transaction}, exactly as
   * drizzle's own database delegates to its session: the session owns the
   * connection, and a transaction is a property of one connection.
   *
   * @param fn - the work to run inside the transaction.
   * @param config - isolation level, access mode and deferrability, rendered
   * into the `BEGIN`.
   *
   * @example
   * ```ts
   * const moved = await db.transaction((tx) =>
   *   tx
   *     .update(accounts)
   *     .set({ balance: sql`${accounts.balance} - 100` })
   *     .where(eq(accounts.id, from))
   *     .execute()
   *     .flatMap(() =>
   *       tx
   *         .update(accounts)
   *         .set({ balance: sql`${accounts.balance} + 100` })
   *         .where(eq(accounts.id, to))
   *         .execute(),
   *     ),
   * );
   * ```
   */
  transaction<A, E>(
    fn: (tx: NodePgUnthrownTransaction<TRelations>) => AsyncResult<A, E>,
    config?: PgTransactionConfig,
  ): AsyncResult<A, E | PgQueryError> {
    return this.session.transaction(fn, config);
  }
}

/** Assemble the dialect, session and database around an already-resolved client. */
const construct = <TRelations extends AnyRelations>(
  client: NodePgClient,
  config: UnthrownDrizzleConfig<TRelations>,
): NodePgUnthrownDatabase<TRelations> & { $client: NodePgClient } => {
  const dialect = new PgDialect({ codecs: config.codecs ?? nodePgCodecs });

  const logger =
    config.logger === true
      ? new DefaultLogger()
      : config.logger === false
        ? undefined
        : config.logger;

  // `EmptyRelations` *is* `{}`, and it is the declared default for
  // `TRelations` — so the empty object is the exact value the unparameterised
  // case describes. It cannot be proven against an unresolved type parameter,
  // which is the whole of the assertion; drizzle writes the same fallback
  // untyped.
  const relations = config.relations ?? ({} as TRelations);

  const session = new NodePgUnthrownSession(client, dialect, relations, logger);
  return Object.assign(new NodePgUnthrownDatabase(dialect, session, relations), {
    $client: client,
  });
};

/**
 * Build a Postgres database whose every query resolves to an `AsyncResult`.
 *
 * @remarks
 * This **replaces** `drizzle-orm/node-postgres`'s own `drizzle()` rather than
 * wrapping its result: migrating a call site is an import change. Every method
 * on the database already speaks `AsyncResult`, so there is no `try*` naming
 * scheme to learn — a query's modeled failures are the {@link PgQueryError}
 * union, and every infrastructure failure (a dropped connection, a deadlock, a
 * statement that will not compile) is a defect rather than a value you branch
 * on.
 *
 * The escape hatch is `db.$client`: it is the very client you passed (or the
 * pool the factory built), so a stock `drizzle-orm/node-postgres` database over
 * the same pool — for a migration runner, or a batch API this package does not
 * model — is one line away.
 *
 * The call forms are **exactly** drizzle's own — a connection string (with an
 * optional {@link UnthrownDrizzleConfig} second argument), or a configuration
 * object carrying a client under `client` or connection details under
 * `connection`. There is deliberately no positional-client form: drizzle has
 * none, and a second spelling of `{ client: pool }` would mean a call site no
 * longer ports back by changing the import. (`@param` is left unspelled
 * deliberately: one doc comment fronts three overloads whose parameters are
 * named differently.)
 *
 * @example
 * ```ts
 * const db = drizzle({ client: pool, relations });
 *
 * const created = await db
 *   .insert(users)
 *   .values({ id: 1, email: "ada@example.com" })
 *   .returning()
 *   .execute()
 *   .mapErrCases((m) =>
 *     m.with(P.tag("UniqueConstraintViolation"), () => "email already taken" as const)
 *      .with(
 *        P.tag("ForeignKeyViolation"),
 *        P.tag("CheckViolation"),
 *        P.tag("ExclusionViolation"),
 *        P.tag("NotNullViolation"),
 *        (e) => e._tag,
 *      ),
 *   );
 * ```
 *
 * @category Database
 */
export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
  connectionString: string,
  config?: UnthrownDrizzleConfig<TRelations>,
): NodePgUnthrownDatabase<TRelations> & { $client: pg.Pool };
export function drizzle<
  TClient extends NodePgClient,
  TRelations extends AnyRelations = EmptyRelations,
>(
  config: UnthrownDrizzleConfig<TRelations> & { client: TClient },
): NodePgUnthrownDatabase<TRelations> & { $client: TClient };
export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
  config: UnthrownDrizzleConfig<TRelations> & { connection: string | pg.PoolConfig },
): NodePgUnthrownDatabase<TRelations> & { $client: pg.Pool };
export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
  connectionStringOrConfig: string | ClientConfig<TRelations>,
  config: UnthrownDrizzleConfig<TRelations> = {},
): NodePgUnthrownDatabase<TRelations> & { $client: NodePgClient } {
  if (typeof connectionStringOrConfig === "string") {
    return construct(new pg.Pool({ connectionString: connectionStringOrConfig }), config);
  }

  const { client, connection, ...rest } = connectionStringOrConfig;
  if (client !== undefined) return construct(client, rest);

  return construct(
    typeof connection === "string"
      ? new pg.Pool({ connectionString: connection })
      : new pg.Pool(connection),
    rest,
  );
}
