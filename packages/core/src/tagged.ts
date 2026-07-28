// The TaggedError convention (à la Effect's `Data.TaggedError`). The matcher
// pattern that matches a tagged error union lives with the other pattern
// constructors, as `P.tag(t)` in `matcher.ts`.

type Props = Record<string, unknown>;

/**
 * The instance shape produced by a {@link TaggedError} class: an `Error` plus a
 * `_tag` discriminant and the (readonly) payload fields.
 *
 * @typeParam Tag - the string literal discriminant.
 * @typeParam A - the payload object type.
 *
 * @category Types
 */
export type TaggedErrorInstance<Tag extends string, A extends Props> = Error &
  Readonly<Omit<A, "name" | "message" | "stack">> & { readonly _tag: Tag };

/**
 * The class constructor returned by {@link TaggedError}. Generic in its payload:
 * apply it with an instantiation expression at the `extends` site.
 *
 * @remarks
 * When the payload is empty, the constructor takes **no** arguments (the
 * `keyof A extends never ? void : A` trick); otherwise it takes the payload. The
 * `name`, `message`, and `stack` keys are all **rejected** (`?: never`) because
 * all three are reserved: `name` is the display label, `message` is the human
 * string owned by `Error`, and `stack` is `Error`'s trace. Set the message the
 * standard way — `override message = "…"` (or a constructor override) on the
 * subclass — never as a free-form per-call payload field. The reservations are
 * enforced at the call site, mirroring how {@link TaggedErrorInstance} excludes
 * all three. (`cause` is deliberately **not** reserved: `Error.cause` is
 * `unknown`, so a typed payload `cause` is a legitimate structured field.)
 *
 * @typeParam Tag - the string literal discriminant.
 *
 * @category Types
 */
export type TaggedErrorConstructor<Tag extends string> = {
  new <A extends Props = {}>(
    args: keyof A extends never
      ? void
      : A & { readonly name?: never; readonly message?: never; readonly stack?: never },
  ): TaggedErrorInstance<Tag, A>;
};

/**
 * Build a base class for a tagged error — a class extending `Error` with a
 * `_tag` string discriminant, in the style of Effect's `Data.TaggedError`.
 *
 * @remarks
 * Extend the returned class to declare a concrete error. Supply the payload with
 * an instantiation expression; omit it for a payload-less error. The `message`
 * is **not** a payload field — it is the human string owned by `Error`, not
 * structured data, so it is reserved. Define it once per subclass the standard
 * way, `override message = "…"` (it may interpolate the payload via `this`,
 * which the base populates before the subclass field initialiser runs); a
 * payload `message` is rejected at compile time, so contextual detail lives in
 * typed fields, never baked into per-call prose. The `_tag` always reflects
 * `tag` and cannot be overridden by the payload. `name` is likewise reserved —
 * it is the display label (set it with `options.name`); a payload `name` is
 * rejected at compile time (and excluded from the instance type), so it can't
 * shadow `Error.name`. `stack` is reserved the same way — it is `Error`'s
 * trace, and even an untyped payload `stack` cannot clobber the real one.
 * `cause` is deliberately **not** reserved: `Error.cause` is typed `unknown`,
 * so a payload `cause` (e.g. a wrapped driver error) is a legitimate,
 * *narrowing* structured field.
 *
 * The matching half of the convention is `P.tag(t)` — the pattern constructor on
 * the `P` namespace, which builds the `{ _tag: t }` pattern this factory's `_tag`
 * is selected by (there is no standalone `tag` export).
 *
 * `_tag` is the discriminant matched by `P.tag` in the error combinators
 * (`result.mapErrCases((matcher) => matcher.with(P.tag("NotFound"), …))`) and in
 * `match`'s `errCases` handler; `Error.name` is the human-facing label in stack
 * traces and logs. By default they coincide, but
 * they can be **decoupled** with `options.name` — so a tag can be namespaced for
 * collision-safety (`"@my-lib/RetryableError"`) without that slash-prefixed
 * string leaking into `Error.name`:
 *
 * ```ts
 * class RetryableError extends TaggedError("@my-lib/RetryableError", {
 *   name: "RetryableError",
 * }) {
 *   override message = "operation failed; safe to retry";
 * }
 *
 * const e = new RetryableError();
 * e._tag;    // "@my-lib/RetryableError" — namespaced discriminant
 * e.name;    // "RetryableError"          — clean display name
 * e.message; // "operation failed; safe to retry" — the standard Error.message
 * ```
 *
 * @typeParam Tag - the string literal discriminant.
 * @param tag - the discriminant value; also the default error `name`.
 * @param options - optional overrides. `options.name` sets `Error.name`
 * independently of `tag` (defaults to `tag`).
 *
 * @category Tagged errors
 *
 * @example
 * ```ts
 * class NotFound extends TaggedError("NotFound") {}
 * class HttpError extends TaggedError("HttpError")<{ status: number }> {}
 *
 * new NotFound()._tag; // => "NotFound"
 * new HttpError({ status: 500 }).status; // => 500
 * ```
 */
export function TaggedError<Tag extends string>(
  tag: Tag,
  options?: { readonly name?: string },
): TaggedErrorConstructor<Tag> {
  const displayName = options?.name ?? tag;
  class TaggedErrorBase extends Error {
    readonly _tag!: Tag;

    constructor(props?: Props) {
      super();
      if (props) {
        // `stack` is reserved like `name`/`message`: it is `Error`'s trace, not
        // payload data. Capture the genuine trace as a string (V8 exposes
        // `stack` as a lazy accessor whose setter would happily store a payload
        // value), let the payload land, then re-assert the real trace as a
        // plain data property — an untyped caller cannot clobber it. (`cause`
        // is deliberately allowed through: `Error.cause` is `unknown`, so a
        // typed payload `cause` is a legitimate structured field.)
        const stack = this.stack;
        Object.assign(this, props);
        delete (this as { stack?: unknown }).stack;
        if (stack !== undefined) {
          Object.defineProperty(this, "stack", {
            value: stack,
            writable: true,
            enumerable: false,
            configurable: true,
          });
        }
      }
      // `_tag`, `name`, and `message` are authoritative — an untyped caller
      // can't set them via the payload. `_tag`/`name` are re-assigned to their
      // canonical values; `message` is `Error`'s channel (set per subclass via
      // `override message = …`, whose field initialiser runs after this
      // constructor returns), so any payload-supplied `message` is dropped here.
      (this as { _tag: Tag })._tag = tag;
      this.name = displayName;
      delete (this as { message?: unknown }).message;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  return TaggedErrorBase as unknown as TaggedErrorConstructor<Tag>;
}
