# @unthrown/pothos

## 0.1.2

### Patch Changes

- 8a814c1: Wrap GraphQLError defects with their original cause before resolver or DataLoader elimination, so default Yoga masking hides their messages and extensions. Mapped Err refusals and defaultTypes behavior stay intact.

## 0.1.1

### Patch Changes

- aac0735: Fix the CommonJS entry: `require("@unthrown/pothos")` threw `registerPlugin is not a function`, because the bundler's Node interop made the default import of `@pothos/core` its whole module. The build now loads both CommonJS entries, so this fails `pnpm build` if it recurs.

## 0.1.0

### Minor Changes

- 1395d10: Add `@unthrown/pothos`, a Pothos plugin: `resultField` and `resultConnection` (`@unthrown/pothos/relay`) resolve a field from a `Result`, answering each failure as the GraphQL error its case maps to in a `refusals` record that is exhaustive at compile time — returned as a member of `@pothos/plugin-errors`' result union, without a throw. `outcomeOf` answers a DataLoader key the same way, a defect as an `Error` instead of a rejected batch.
