import { P, fromThrowable, type Result } from "unthrown";

/**
 * Stand-in for a third-party SDK: two error classes, no shared discriminant
 * field, no tag, and no intention of ever growing one. You cannot edit them —
 * which is the point of this file.
 */
export class VendorSyntaxError extends Error {
  constructor(readonly at: number) {
    super(`unexpected token at ${at}`);
  }
}

export class VendorTimeoutError extends Error {
  constructor(readonly afterMs: number) {
    super(`vendor gave up after ${afterMs}ms`);
  }
}

export type VendorRenderError = VendorSyntaxError | VendorTimeoutError;

export type Template = { readonly rendered: string };
export type RenderFailure = { readonly detail: string };

/**
 * The boundary. `qualify` is where the modelled/unexpected split is actually
 * made — and it is made by *decision*, not by the error's shape: the two
 * classes above are returned (so they become `E`), and everything else is
 * handed to the injected `defect` helper, leaving the modelled type entirely.
 *
 * `E` is inferred as `Exclude<R, Defect>` — `VendorSyntaxError |
 * VendorTimeoutError`, with the defect arm subtracted rather than unioned in.
 */
export const render = fromThrowable(
  (source: string): Template => ({ rendered: vendorRender(source) }),
  (cause, defect) =>
    cause instanceof VendorSyntaxError || cause instanceof VendorTimeoutError
      ? cause
      : defect(cause),
);

/**
 * `P.instanceOf` is the pattern for a union with nothing to dispatch on but
 * identity — the branch is narrowed to the class, so `at` and `afterMs` are
 * each reachable without a cast. (`P.when(guard)` covers whatever neither an
 * object pattern nor `instanceof` can express.)
 *
 * Exhaustiveness holds here for the same reason it does everywhere else: the
 * two classes are structurally distinct, so `Exclude` can tell them apart.
 */
export function readableRenderFailure(
  result: Result<Template, VendorRenderError>,
): Result<Template, RenderFailure> {
  return result.mapErrCases((matcher) =>
    matcher
      .with(P.instanceOf(VendorSyntaxError), (e) => ({
        detail: `bad template syntax at offset ${e.at}`,
      }))
      .with(P.instanceOf(VendorTimeoutError), (e) => ({
        detail: `renderer timed out after ${e.afterMs}ms`,
      })),
  );
}

/** The SDK's synchronous entry point, faked just enough to throw on cue. */
function vendorRender(source: string): string {
  if (source.includes("{{?")) throw new VendorSyntaxError(source.indexOf("{{?"));
  if (source.includes("{{slow}}")) throw new VendorTimeoutError(5_000);
  // An unmodelled failure: nobody branches on "the SDK has a bug", so `qualify`
  // sends it to the defect channel instead of into `E`.
  if (source.includes("{{boom}}")) throw new RangeError("vendor internal error");
  return source.toUpperCase();
}
