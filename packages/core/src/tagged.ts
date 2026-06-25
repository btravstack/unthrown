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
 */
export type TaggedErrorInstance<Tag extends string, A extends Props> = Error &
  Readonly<A> & { readonly _tag: Tag };

/**
 * The class constructor returned by {@link TaggedError}. Generic in its payload:
 * apply it with an instantiation expression at the `extends` site.
 *
 * @remarks
 * When the payload is empty, the constructor takes **no** arguments (the
 * `keyof A extends never ? void : A` trick); otherwise it takes the payload.
 *
 * @typeParam Tag - the string literal discriminant.
 */
export type TaggedErrorConstructor<Tag extends string> = {
  new <A extends Props = {}>(args: keyof A extends never ? void : A): TaggedErrorInstance<Tag, A>;
};

/**
 * Build a base class for a tagged error — a class extending `Error` with a
 * `_tag` string discriminant, in the style of Effect's `Data.TaggedError`.
 *
 * @remarks
 * Extend the returned class to declare a concrete error. Supply the payload with
 * an instantiation expression; omit it for a payload-less error. A `message`
 * field in the payload is forwarded to `Error`. The `_tag` always reflects
 * `tag` and cannot be overridden by the payload.
 *
 * @typeParam Tag - the string literal discriminant.
 * @param tag - the discriminant value, also used as the error `name`.
 *
 * @example
 * ```ts
 * class NotFound extends TaggedError("NotFound") {}
 * class HttpError extends TaggedError("HttpError")<{ status: number }> {}
 *
 * new NotFound()._tag; // "NotFound"
 * new HttpError({ status: 500 }).status; // 500
 * ```
 */
export function TaggedError<Tag extends string>(tag: Tag): TaggedErrorConstructor<Tag> {
  class TaggedErrorBase extends Error {
    readonly _tag!: Tag;

    constructor(props?: Props) {
      super(typeof props?.["message"] === "string" ? (props["message"] as string) : undefined);
      if (props) Object.assign(this, props);
      // The tag is authoritative — assign it after the payload so it can't be
      // clobbered, and set `name` for readable stack traces.
      (this as { _tag: Tag })._tag = tag;
      this.name = tag;
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
 */
export type TagHandlers<T, E extends { _tag: string }, R> = {
  Ok: (value: T) => R;
  Defect: (cause: unknown) => R;
} & { [K in E["_tag"]]: (error: Extract<E, { _tag: K }>) => R };

/**
 * Exhaustively fold a {@link Result} (or {@link AsyncResult}) whose error type is
 * a tagged union, dispatching each error to the handler matching its `_tag`.
 *
 * @remarks
 * The `handlers` object must provide `Ok`, `Defect`, and exactly one function
 * per error tag; each tag's handler receives the narrowed error variant. A
 * missing tag is a compile error. For an `AsyncResult`, the fold resolves to a
 * `Promise<R>`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the tagged error union (`E extends { _tag: string }`).
 * @typeParam R - the folded result type.
 * @param result - the result to fold.
 * @param handlers - one branch per channel/tag.
 *
 * @example
 * ```ts
 * class NotFound extends TaggedError("NotFound") {}
 * class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
 *
 * declare const r: Result<number, NotFound | Forbidden>;
 * matchTags(r, {
 *   Ok: (n) => `got ${n}`,
 *   Defect: (cause) => `bug: ${String(cause)}`,
 *   NotFound: () => "404",
 *   Forbidden: (e) => `403 for ${e.user}`,
 * });
 * ```
 */
export function matchTags<T, E extends { _tag: string }, R>(
  result: Result<T, E>,
  handlers: TagHandlers<T, E, R>,
): R;
export function matchTags<T, E extends { _tag: string }, R>(
  result: AsyncResult<T, E>,
  handlers: TagHandlers<T, E, R>,
): Promise<R>;
export function matchTags<T, E extends { _tag: string }, R>(
  result: Result<T, E> | AsyncResult<T, E>,
  handlers: TagHandlers<T, E, R>,
): R | Promise<R> {
  const onErr = (error: E): R => {
    const handler = handlers[error._tag as E["_tag"]] as unknown as (e: E) => R;
    return handler(error);
  };
  // Both Result and AsyncResult share `match`; the cast picks one signature for
  // the call while the public overloads keep the return type correct.
  return (result as Result<T, E>).match({ ok: handlers.Ok, err: onErr, defect: handlers.Defect });
}
