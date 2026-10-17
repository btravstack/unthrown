---
"@unthrown/effect": major
---

Require Effect `^4.0.1` and Node.js `^20.19.0 || >=22.12.0`, and migrate the interop bridge
to Effect 4. These Node releases enable the CommonJS entry to load Effect's ESM distribution.

Replace `toEither` / `fromEither` with `toResult` / `fromResult`, which use
Effect's two-channel `Result` (`Success` / `Failure`). `toResult` still requires
an `onDefect` callback. The Exit and Effect bridge names and three-channel
mapping are unchanged, including defect dominance in composite causes.

Applications staying on Effect 3 should keep `@unthrown/effect` 5.x.
