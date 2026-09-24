// A consumer compiling with `declaration: true` must be able to NAME every type
// an inferred public value carries. The bundled `dist/*.d.{m,c}ts` once renamed
// the `AsyncResult` / `Result` declarations to `AsyncResult$1` / `Result$1`
// (because `facade.ts` re-aliased them under the same name) without exporting
// the renamed symbols, so `export const x = OkAsync(1)` failed downstream with
// TS4023 "… has or is using name 'AsyncResult$1' … but cannot be named".
//
// Nothing in the workspace compiled against the BUILT declarations with
// declaration emit on, so this bundles the package into a throwaway
// `node_modules/unthrown` (the real `package.json` exports map, both ESM and CJS
// types) and compiles an `export const` of every public factory against it.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, expect, it } from "vitest";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Same compiler resolution as `doc-examples.spec.ts` (TS 7's exports map).
const TSC = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
const TSDOWN = join(dirname(require.resolve("tsdown/package.json")), "dist", "run.mjs");

const workdir = mkdtempSync(join(tmpdir(), "unthrown-dts-emit-"));
afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

// Every public factory, exported with an INFERRED type (no annotation), so the
// emitter has to name whatever the declaration files hand it.
const FIXTURE = `
import {
  all, allAsync, allFromDict, allFromDictAsync, AsyncResult, Do, DoAsync, Err, ErrAsync,
  fromExecutor, fromNullable, fromPromise, fromSafePromise, fromSafeThrowable, fromThrowable,
  match, Ok, OkAsync, P, Result, TaggedError, validateAll, validateAllAsync,
  validateAllFromDict, validateAllFromDictAsync,
} from "unthrown";

export class NotFound extends TaggedError("NotFound")<{ id: string }> {}
export const ok = Ok(1);
export const unit = Ok();
export const err = Err("e" as const);
export const okAsync = OkAsync(1);
export const errAsync = ErrAsync("e" as const);
export const scope = Do().let("a", () => 1).bind("b", () => Ok("x"));
export const scopeAsync = DoAsync().bind("b", () => OkAsync("x"));
export const nullable = fromNullable(1 as number | undefined, () => "absent" as const);
export const parse = fromThrowable((s: string) => JSON.parse(s) as unknown, (c, d) =>
  c instanceof SyntaxError ? ("invalid" as const) : d(c));
export const safe = fromSafeThrowable((s: string) => s.length);
export const load = (id: string) => fromPromise(Promise.resolve(id), (c, d) => d(c));
export const loaded = fromSafePromise(Promise.resolve(1));
export const executed = fromExecutor<number, "e">((settle) => settle(Ok(1)));
export const tuple = all([Ok(1), Err("e" as const)]);
export const tupleAsync = allAsync([OkAsync(1), ErrAsync("e" as const)]);
export const dict = allFromDict({ a: Ok(1), b: Err("e" as const) });
export const dictAsync = allFromDictAsync({ a: OkAsync(1) });
export const validated = validateAll([Ok(1), Err("e" as const)], (es) => es.length);
export const validatedAsync = validateAllAsync([OkAsync(1)], (es) => es.length);
export const validatedDict = validateAllFromDict({ a: Err("e" as const) }, (es) => es.length);
export const validatedDictAsync = validateAllFromDictAsync({ a: OkAsync(1) }, (es) => es.length);
export const mapped = Err(new NotFound({ id: "1" }))
  .mapErrCases((m) => m.with(P.tag("NotFound"), (e) => e.id))
  .toAsync()
  .flatMap((id) => OkAsync(id));
export const matcher = match(1 as 1 | 2).with(1, () => "one");
export const tagPattern = P.tag("NotFound");
export const classPattern = P.instanceOf(NotFound);
export const guardPattern = P.when((v): v is string => typeof v === "string");
export const facade = Result.Ok(1);
export const facadeAsync = AsyncResult.Ok(1);
`;

it("inferred public values are nameable under declaration emit (ESM and CJS types)", () => {
  const pkgDir = join(workdir, "node_modules", "unthrown");
  mkdirSync(pkgDir, { recursive: true });
  copyFileSync(join(PKG, "package.json"), join(pkgDir, "package.json"));
  // The package's own build, into the throwaway install (so the gate needs no
  // prior `pnpm build`, and never tests a stale dist).
  execFileSync(
    process.execPath,
    [TSDOWN, "src/index.ts", "--format", "cjs,esm", "--dts", "-d", join(pkgDir, "dist")],
    { cwd: PKG, stdio: "ignore" },
  );

  writeFileSync(join(workdir, "esm.mts"), FIXTURE);
  writeFileSync(join(workdir, "cjs.cts"), FIXTURE);
  writeFileSync(
    join(workdir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "out",
        skipLibCheck: true,
        types: [],
      },
      files: ["esm.mts", "cjs.cts"],
    }),
  );

  let output = "";
  try {
    execFileSync(process.execPath, [TSC, "-p", "tsconfig.json"], {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? "");
  }
  const errors = output.split("\n").filter((line) => /error TS\d+:/.test(line));
  expect(errors, `\n${errors.join("\n")}\n`).toEqual([]);
}, 60_000);
