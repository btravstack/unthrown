---
"@unthrown/oxlint": minor
---

`no-catch-all-pattern` now exempts the two sanctioned `P._` uses itself when
the file proves them (#230): the matcher is traced to its receiver, and when an
in-file `Result` / `AsyncResult` annotation (variable, parameter, or in-file
function return annotation) shows `E` to be a single non-union type — or an
unresolved type parameter — the catch-all is the legitimate single arm and
nothing is reported. In-file type aliases are seen through; an imported named
type counts as the single abstraction it names. Where no annotation is in reach
(a receiver imported from another module), the rule reports as before and the
targeted `oxlint-disable` remains the escape hatch.
