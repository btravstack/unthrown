---
"@unthrown/vitest": minor
---

Point forgotten-`await` failures at the line that created the assertion.

The `afterEach` net named the pending matchers but not where they came from, so
a long spec with several `toBeOk` assertions — or a `test.concurrent` run, where
the mechanism already disambiguates by test name — left the missing `await` to a
manual scan.

`settle` now captures an `Error` when it creates the gate, so its stack runs
through the caller's `expect(...)`. The failure reports the first frame that is
neither this module nor `node_modules`:

```
@unthrown/vitest: 1 async assertion(s) (toBeOk) were still pending when the
test ended — a forgotten `await`. … Created at: loadUser (src/user.spec.ts:42:18).
```

The location goes in the **message**, since that is the part every reporter
shows; the full stack is on the error's `cause` for those that render it.

The capture happens only on the **async** path — the one that can be forgotten —
and V8 formats `.stack` lazily, so a correctly-awaited assertion pays for
constructing the `Error` and nothing else.
