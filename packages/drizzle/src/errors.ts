import { TaggedError } from "unthrown";

/**
 * Fields every constraint violation carries, read straight off the driver
 * error. `constraint`, `table` and `column` are locale-independent; `detail` is
 * passed through verbatim and deliberately never parsed for a column list,
 * because PostgreSQL localizes message text.
 */
type ConstraintFields = {
  constraint: string | undefined;
  table: string | undefined;
  detail: string | undefined;
  cause: unknown;
};

/** A unique constraint was violated (SQLSTATE `23505`). */
export class UniqueConstraintViolation extends TaggedError(
  "UniqueConstraintViolation",
)<ConstraintFields> {
  override message = "unique constraint violated";
}

/** A foreign key constraint was violated (SQLSTATE `23503`). */
export class ForeignKeyViolation extends TaggedError("ForeignKeyViolation")<ConstraintFields> {
  override message = "foreign key constraint violated";
}

/** A check constraint was violated (SQLSTATE `23514`). */
export class CheckViolation extends TaggedError("CheckViolation")<ConstraintFields> {
  override message = "check constraint violated";
}

/** An exclusion constraint was violated (SQLSTATE `23P01`). */
export class ExclusionViolation extends TaggedError("ExclusionViolation")<ConstraintFields> {
  override message = "exclusion constraint violated";
}

/**
 * A `NOT NULL` constraint was violated (SQLSTATE `23502`).
 *
 * @remarks
 * Carries `column` rather than `constraint`: `23502` names the offending column
 * and has no constraint name of its own.
 */
export class NotNullViolation extends TaggedError("NotNullViolation")<{
  column: string | undefined;
  table: string | undefined;
  detail: string | undefined;
  cause: unknown;
}> {
  override message = "not-null constraint violated";
}

/**
 * The full union of domain errors a Postgres query can surface.
 *
 * @remarks
 * Infrastructure failures are deliberately absent — they are defects, not
 * values. See {@link qualifyPgError}.
 */
export type PgQueryError =
  | UniqueConstraintViolation
  | ForeignKeyViolation
  | NotNullViolation
  | CheckViolation
  | ExclusionViolation;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

// Recognized structurally rather than with `instanceof DatabaseError`: a second
// copy of `pg` in the tree would defeat an identity check, the same dual-copy
// hazard `isResult` guards against. It also makes the qualifier driver-agnostic.
const driverError = (cause: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(cause)) return undefined;
  if (typeof cause["code"] === "string") return cause;
  // Drizzle wraps driver failures in a DrizzleQueryError; the original is `cause`.
  const inner: unknown = cause["cause"];
  if (isRecord(inner) && typeof inner["code"] === "string") return inner;
  return undefined;
};

/**
 * Triage a Postgres driver failure into the modeled error channel or the defect
 * channel — a `qualify` in the Thesis-#3 sense, so it drops straight into a
 * `fromPromise` at a boundary of your own.
 *
 * @remarks
 * Only the five `23xxx` integrity-constraint codes are modeled: they are what a
 * request handler branches on. Everything else — serialization failure
 * (`40001`), deadlock (`40P01`), statement timeout (`57014`), connection loss,
 * syntax errors — is a defect. Retry belongs in one `recoverDefect` wrapper
 * that inspects the cause, not an arm at every write call site.
 *
 * @param cause - the rejected value from a Postgres query (a node-postgres
 * `DatabaseError`, a `DrizzleQueryError` wrapping one, or anything else).
 * @param defect - the defect helper the boundary injects (never import it).
 *
 * @example
 * ```ts
 * const rows = fromPromise(pool.query("select 1"), qualifyPgError);
 * ```
 */
export const qualifyPgError = <D>(
  cause: unknown,
  defect: (cause: unknown) => D,
): PgQueryError | D => {
  const err = driverError(cause);
  if (err === undefined) return defect(cause);

  const table = str(err["table"]);
  const detail = str(err["detail"]);
  const constraint = str(err["constraint"]);
  const shared = { constraint, table, detail, cause };

  switch (err["code"]) {
    case "23505":
      return new UniqueConstraintViolation(shared);
    case "23503":
      return new ForeignKeyViolation(shared);
    case "23514":
      return new CheckViolation(shared);
    case "23P01":
      return new ExclusionViolation(shared);
    case "23502":
      return new NotNullViolation({ column: str(err["column"]), table, detail, cause });
    default:
      return defect(cause);
  }
};
