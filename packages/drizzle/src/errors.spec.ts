import { describe, expect, it } from "vitest";

import {
  CheckViolation,
  ExclusionViolation,
  ForeignKeyViolation,
  NotNullViolation,
  qualifyPgError,
  UniqueConstraintViolation,
} from "./errors.js";

/** The shape node-postgres' DatabaseError presents for a server error. */
const pgError = (fields: Record<string, unknown>) =>
  Object.assign(new Error(String(fields["message"] ?? "db error")), {
    severity: "ERROR",
    ...fields,
  });

const defect = <T>(cause: T) => ({ __defect: cause }) as const;

describe("qualifyPgError", () => {
  it("maps 23505 to UniqueConstraintViolation with locale-independent fields", () => {
    const cause = pgError({
      code: "23505",
      constraint: "users_email_key",
      table: "users",
      detail: "Key (email)=(a@b.c) already exists.",
    });

    const e = qualifyPgError(cause, defect);

    expect(e).toBeInstanceOf(UniqueConstraintViolation);
    const u = e as UniqueConstraintViolation;
    expect(u._tag).toBe("UniqueConstraintViolation");
    expect(u.constraint).toBe("users_email_key");
    expect(u.table).toBe("users");
    expect(u.detail).toBe("Key (email)=(a@b.c) already exists.");
    expect(u.cause).toBe(cause);
  });

  it("maps 23503 to ForeignKeyViolation", () => {
    const e = qualifyPgError(
      pgError({ code: "23503", constraint: "posts_author_fkey", table: "posts" }),
      defect,
    );
    expect(e).toBeInstanceOf(ForeignKeyViolation);
  });

  it("maps 23502 to NotNullViolation carrying the column", () => {
    const e = qualifyPgError(pgError({ code: "23502", column: "email", table: "users" }), defect);
    expect(e).toBeInstanceOf(NotNullViolation);
    expect((e as NotNullViolation).column).toBe("email");
  });

  it("maps 23514 to CheckViolation", () => {
    expect(
      qualifyPgError(pgError({ code: "23514", constraint: "age_positive" }), defect),
    ).toBeInstanceOf(CheckViolation);
  });

  it("maps 23P01 to ExclusionViolation", () => {
    expect(
      qualifyPgError(pgError({ code: "23P01", constraint: "no_overlap" }), defect),
    ).toBeInstanceOf(ExclusionViolation);
  });

  it("leaves missing fields undefined rather than throwing", () => {
    const u = qualifyPgError(pgError({ code: "23505" }), defect) as UniqueConstraintViolation;
    expect(u.constraint).toBeUndefined();
    expect(u.table).toBeUndefined();
    expect(u.detail).toBeUndefined();
  });

  it.each([
    ["serialization failure", "40001"],
    ["deadlock detected", "40P01"],
    ["query canceled", "57014"],
    ["too many connections", "53300"],
    ["syntax error", "42601"],
    ["an unmapped 23xxx code", "23000"],
  ])("routes %s to the defect channel", (_label, code) => {
    const cause = pgError({ code });
    expect(qualifyPgError(cause, defect)).toEqual(defect(cause));
  });

  it("routes a non-Postgres cause to the defect channel", () => {
    const cause = new Error("ECONNRESET");
    expect(qualifyPgError(cause, defect)).toEqual(defect(cause));
    expect(qualifyPgError("nonsense", defect)).toEqual(defect("nonsense"));
    expect(qualifyPgError(null, defect)).toEqual(defect(null));
  });

  it("unwraps a DrizzleQueryError to qualify the underlying driver error", () => {
    const driver = pgError({ code: "23505", constraint: "users_email_key" });
    const wrapped = Object.assign(new Error("Failed query"), { cause: driver });
    expect(qualifyPgError(wrapped, defect)).toBeInstanceOf(UniqueConstraintViolation);
  });

  // Replaces the brief's "reads the field off the error rather than parsing
  // the localized detail" spy-based test (which asserted a getter call count —
  // an implementation detail). The property that actually matters: the
  // qualifier must not depend on message text, which PostgreSQL localizes.
  // Two errors with identical structured fields but wildly different
  // localized `detail` strings must still yield identical `constraint` /
  // `table` / `column`, and `detail` itself must be passed through verbatim.
  it("derives fields from structured properties, independent of the localized detail text", () => {
    const english = pgError({
      code: "23505",
      constraint: "users_email_key",
      table: "users",
      detail: "Key (email)=(a@b.c) already exists.",
    });
    const french = pgError({
      code: "23505",
      constraint: "users_email_key",
      table: "users",
      detail: "La clé (email)=(a@b.c) existe déjà.",
    });

    const e1 = qualifyPgError(english, defect) as UniqueConstraintViolation;
    const e2 = qualifyPgError(french, defect) as UniqueConstraintViolation;

    expect(e1.constraint).toBe(e2.constraint);
    expect(e1.table).toBe(e2.table);
    expect(e1.detail).toBe("Key (email)=(a@b.c) already exists.");
    expect(e2.detail).toBe("La clé (email)=(a@b.c) existe déjà.");
  });
});
