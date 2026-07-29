import { ruleTester } from "../tester.js";
import { preferEnsure } from "./prefer-ensure.js";

ruleTester.run("prefer-ensure", preferEnsure, {
  valid: [
    // A real bind — the success branch builds a NEW value, so it is not a gate.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.ok ? Ok(x.inner) : Err("bad")));`,
    },
    // No failure branch: nothing is being gated.
    {
      code: `import { Ok } from "unthrown";\nr.flatMap((x) => Ok(x));`,
    },
    // No success branch either — a plain short-circuit, not a gate.
    {
      code: `import { Err } from "unthrown";\nr.flatMap((x) => Err(x.reason));`,
    },
    // `Ok` / `Err` from somewhere else are not unthrown's constructors.
    {
      code: `import { Err, Ok } from "other-lib";\nr.flatMap((x) => (x.ok ? Ok(x) : Err("bad")));`,
    },
    // Locally-bound `Ok` / `Err` (no import) resolve to nothing — stay quiet.
    {
      code: `const Ok = (v) => v;\nconst Err = (e) => e;\nr.flatMap((x) => (x.ok ? Ok(x) : Err("bad")));`,
    },
    // THE false positive the shape admits: the parameter is REASSIGNED, so the
    // value reaching `Ok` is not the one `ensure` would pass through.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => {\n  x = normalize(x);\n  return x.ok ? Ok(x) : Err("bad");\n});`,
    },
    // A shadowing binding of the same name is not the parameter.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => {\n  if (x.missing) return Err("bad");\n  const y = refresh(x);\n  return Ok(y);\n});`,
    },
    // A destructured parameter cannot be handed back untouched.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap(({ id, ok }) => (ok ? Ok({ id }) : Err("bad")));`,
    },
    // `Ok()` — the void success — is not "the parameter, untouched".
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.ok ? Ok() : Err("bad")));`,
    },
    // A constructor inside a NESTED callback belongs to another control flow.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => load(x).flatMap((y) => (y.ok ? Ok(x) : Err("bad"))));`,
    },
    // The branches are WRAPPED, so the callback does not return them — the
    // rewrite would drop the wrapper.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => wrap(x.ok ? Ok(x) : Err("bad")));`,
    },
    // A constructor passed as an argument is a mention, not a return position.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.ok ? recover(Ok(x)) : Err("bad")));`,
    },
    // A gate PLUS a fall-through: the last return is work `ensure` can't express.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => {\n  if (!x.ok) return Err("bad");\n  if (x.cached) return Ok(x);\n  return refresh(x);\n});`,
    },
    // Other combinators are left alone — only `flatMap` can hide a gate.
    {
      code: `import { Err, Ok } from "unthrown";\nr.map((x) => (x.ok ? Ok(x) : Err("bad")));`,
    },
    // The gate already written as a gate. (`onFail` returns the error VALUE —
    // `ensure` puts it in the channel itself.)
    {
      code: `import { Inactive } from "./errors";\nr.ensure((x) => x.ok, (x) => new Inactive({ id: x.id }));`,
    },
    // A computed member access can't be resolved statically.
    {
      code: `import { Err, Ok } from "unthrown";\nconst k = "flatMap";\nr[k]((x) => (x.ok ? Ok(x) : Err("bad")));`,
    },
  ],
  invalid: [
    // The canonical gate.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.ok ? Ok(x) : Err("bad")));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // Reversed ternary — the same gate, and exactly why there is no autofix.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.broken ? Err("bad") : Ok(x)));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // Block body with an early return.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((information) => {\n  if (information.status === "DISCHARGED") return Err(new BadStatus({ status: information.status }));\n  return Ok(information);\n});`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // A `function` expression callback is the same shape.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap(function (x) {\n  return x.ok ? Ok(x) : Err("bad");\n});`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // Renamed imports still resolve — the binding is keyed by the imported name.
    {
      code: `import { Err as fail, Ok as succeed } from "unthrown";\nr.flatMap((x) => (x.ok ? succeed(x) : fail("bad")));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // The pre-lifted async constructors, on an AsyncResult chain.
    {
      code: `import { ErrAsync, OkAsync } from "unthrown";\nr.flatMap((x) => (x.ok ? OkAsync(x) : ErrAsync("bad")));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // The facade companions carry the same constructors.
    {
      code: `import { Result } from "unthrown";\nr.flatMap((x) => (x.ok ? Result.Ok(x) : Result.Err("bad")));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    {
      code: `import { AsyncResult } from "unthrown";\nr.flatMap((x) => (x.ok ? AsyncResult.Ok(x) : AsyncResult.Err("bad")));`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // A nested conditional is still a chain of return positions.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => (x.ok ? Ok(x) : x.missing ? Err("gone") : Err("bad")));`,
      errors: [{ messageId: "preferEnsureChained" }],
    },
    // A transparent wrapper (`as`) does not hide the return position.
    {
      code: `import { Err, Ok, type Result } from "unthrown";\nr.flatMap((x) => (x.ok ? Ok(x) : Err("bad")) as Result<Thing, string>);`,
      errors: [{ messageId: "preferEnsure" }],
    },
    // Several guards in one body: several `ensure`s, chained.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => {\n  if (!x.name) return Err("anonymous");\n  if (!x.age) return Err("ageless");\n  return Ok(x);\n});`,
      errors: [{ messageId: "preferEnsureChained" }],
    },
    // Two success branches, both handing the parameter back untouched.
    {
      code: `import { Err, Ok } from "unthrown";\nr.flatMap((x) => {\n  if (x.trusted) return Ok(x);\n  if (!x.ok) return Err("bad");\n  return Ok(x);\n});`,
      errors: [{ messageId: "preferEnsure" }],
    },
  ],
});
