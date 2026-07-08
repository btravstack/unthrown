// The TaggedError convention (à la Effect's `Data.TaggedError`) and an
// exhaustive, zero-dependency fold over a tagged error union.

import type { AsyncResult, Result } from "./types.js";

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
  Readonly<Omit<A, "name" | "message">> & { readonly _tag: Tag };

/**
 * The class constructor returned by {@link TaggedError}. Generic in its payload:
 * apply it with an instantiation expression at the `extends` site.
 *
 * @remarks
 * When the payload is empty, the constructor takes **no** arguments (the
 * `keyof A extends never ? void : A` trick); otherwise it takes the payload. The
 * `name` and `message` keys are both **rejected** (`name?: never` /
 * `message?: never`) because both are reserved: `name` is the display label, and
 * `message` is the human string owned by `Error`. Set the message the standard
 * way — `override message = "…"` (or a constructor override) on the subclass —
 * never as a free-form per-call payload field. The reservations are enforced at
 * the call site, mirroring how {@link TaggedErrorInstance} excludes both.
 *
 * @typeParam Tag - the string literal discriminant.
 *
 * @category Types
 */
export type TaggedErrorConstructor<Tag extends string> = {
  new <A extends Props = {}>(
    args: keyof A extends never ? void : A & { readonly name?: never; readonly message?: never },
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
 * shadow `Error.name`.
 *
 * `_tag` is the discriminant used by {@link matchTags}; `Error.name` is the
 * human-facing label in stack traces and logs. By default they coincide, but
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
      if (props) Object.assign(this, props);
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

/**
 * The handler object {@link matchTags} requires: a branch per error tag, plus
 * `Ok` and `Defect`. Miss a tag and it will not compile — the exhaustiveness is
 * enforced by the type, with no `.exhaustive()` to forget.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the tagged error union.
 * @typeParam R - the folded result type.
 *
 * @category Types
 */
export type TagHandlers<T, E extends { _tag: string }, R> = {
  Ok: (value: T) => R;
  Defect: (cause: unknown) => R;
} & { [K in E["_tag"]]: (error: Extract<E, { _tag: K }>) => R };

/**
 * The channel-handler names are reserved: an error tag named `"Ok"` or
 * `"Defect"` would collide with them inside {@link TagHandlers}, so
 * {@link matchTags} rejects such unions at the call site.
 *
 * @internal
 */
type ReservedTagError =
  'unthrown: error tags "Ok" and "Defect" are reserved by matchTags — rename the colliding tag (TaggedError\'s options.name can keep the display name)';

/**
 * Exhaustively fold a {@link Result} (or {@link AsyncResult}) whose error type is
 * a tagged union, dispatching each error to the handler matching its `_tag`.
 *
 * @remarks
 * The `handlers` object must provide `Ok`, `Defect`, and exactly one function
 * per error tag; each tag's handler receives the narrowed error variant. A
 * missing tag is a compile error. For an `AsyncResult`, the fold resolves to a
 * `Promise<R>`. At runtime, an error whose `_tag` has no handler (possible only
 * outside the typed contract) is routed to the `Defect` handler — an unmodeled
 * tag is an unmodeled failure. Tags named `"Ok"` or `"Defect"` are rejected at
 * compile time.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the tagged error union (`E extends { _tag: string }`).
 * @typeParam R - the folded result type.
 * @param result - the result to fold.
 * @param handlers - one branch per channel/tag.
 *
 * @category Tagged errors
 *
 * @example
 * ```ts
 * import { Ok, Err, matchTags, TaggedError, type Result } from "unthrown";
 *
 * class NotFound extends TaggedError("NotFound") {}
 * class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
 *
 * const fold = (r: Result<number, NotFound | Forbidden>) =>
 *   matchTags(r, {
 *     Ok: (n) => `got ${n}`,
 *     Defect: (cause) => `bug: ${String(cause)}`,
 *     NotFound: () => "404",
 *     Forbidden: (e) => `403 for ${e.user}`,
 *   });
 *
 * fold(Ok(1)); // => "got 1"
 * fold(Err(new Forbidden({ user: "ada" }))); // => "403 for ada"
 * ```
 */
export function matchTags<T, E extends { _tag: string }, R>(
  result: Result<T, E>,
  handlers: TagHandlers<T, E, R> &
    ([Extract<E["_tag"], "Ok" | "Defect">] extends [never] ? unknown : ReservedTagError),
): R;
export function matchTags<T, E extends { _tag: string }, R>(
  result: AsyncResult<T, E>,
  handlers: TagHandlers<T, E, R> &
    ([Extract<E["_tag"], "Ok" | "Defect">] extends [never] ? unknown : ReservedTagError),
): Promise<R>;
export function matchTags<T, E extends { _tag: string }, R>(
  result: Result<T, E> | AsyncResult<T, E>,
  handlers: TagHandlers<T, E, R>,
): R | Promise<R> {
  const onErr = (error: E): R => {
    const tag = error._tag as E["_tag"];
    // `Object.hasOwn` guards against a rogue tag (e.g. "constructor") resolving
    // through the prototype chain to an unrelated `Object.prototype` member —
    // only an own property of `handlers` counts as a real handler.
    const handler =
      tag === "Ok" || tag === "Defect" || !Object.hasOwn(handlers, tag)
        ? undefined
        : (handlers[tag] as unknown as ((e: E) => R) | undefined);
    // An unhandled or reserved tag can only arise outside the typed contract (a
    // widened cast, a JS caller). That is an unmodeled failure — route it to the
    // Defect handler rather than crashing on `undefined(error)`.
    return handler ? handler(error) : handlers.Defect(error);
  };
  // Both Result and AsyncResult share `match`; the cast picks one signature for
  // the call while the public overloads keep the return type correct.
  return (result as Result<T, E>).match({ ok: handlers.Ok, err: onErr, defect: handlers.Defect });
}
