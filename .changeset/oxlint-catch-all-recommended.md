---
"@unthrown/oxlint": minor
---

**`unthrown/no-catch-all-pattern` ships in the `recommended` preset.**
Enumerating every error case by name is unthrown's default position, not a
stricter-than-the-library stance: `P._` (and its alias `P.any`) is an **escape
hatch**, and the exhaustive matcher exists precisely so a failure mode cannot be
absorbed unnamed. `no-throw` is the only rule left out of the preset.

**What newly fails.** Any code enabling `recommended` gets an error on every
`P._` / `P.any` written against a `P` imported from `unthrown` or `ts-pattern` —
including the previously idiomatic uniform forms:

```ts
result.mapErrCases((matcher) => matcher.with(P._, (e) => new ApiError(e)));
result.match({ ok, defect, errCases: (matcher) => matcher.with(P._, () => 500) });
```

Name the cases instead, grouping the ones that share a handler — the matcher is
exhaustive by construction, so the compiler tells you when the list is complete:

```ts
result.mapErrCases((matcher) =>
  matcher
    .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
    .with(P.tag("Conflict"), P.tag("DriverError"), (e) => new ApiError({ status: 500, error: e })),
);
```

**Two cases keep the catch-all.** A helper generic in `E`: no arm list can prove
exhaustiveness against an unresolved type parameter, and only `P._` can, because
it is a state transition to "nothing remains" rather than a subtraction from
`E`. And an `E` that is a single type rather than a union of cases — a
validator's issues array, say — where one arm _is_ the enumeration. Keep the
catch-all there and silence the rule with a reason:

```ts
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in `E`: no arm list can prove exhaustiveness
    matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

To keep the previous behaviour, extend `recommended` and turn the rule off:
`"unthrown/no-catch-all-pattern": "off"`.
