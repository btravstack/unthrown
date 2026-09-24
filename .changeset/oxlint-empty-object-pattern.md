---
"@unthrown/oxlint": minor
---

`no-catch-all-pattern` now also reports the empty object pattern `.with({}, …)` on a matcher chain: an object pattern with no keys matches every object at runtime and covers every object member of `E`, so it is the `P._` catch-all in disguise. It is never exempted — where a catch-all is genuinely needed, write `P._`.

The producer list behind `no-unhandled-result` and `no-async-result-race` now lives in one module, checked against core's real exports in the test suite. `no-unhandled-result`'s docs state its syntactic limits plainly (results returned by functions imported from your own modules, and dropped method chains, are missed), and the README and Linting guide now show how to load the plugin in an ESLint flat config.
