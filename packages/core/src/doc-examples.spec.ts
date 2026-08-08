// The `@example` blocks in this package's TSDoc are the library's primary
// teaching surface — they land in the generated API reference and are the first
// thing most people copy. Nothing compiled them.
//
// That is the same gap that let the agent skill ship `fromSchema(schema, input)`
// for a curried API, and let its Prisma section describe a class that had been
// deleted. Prose rots silently; `tsc` does not.
//
// Every ```ts block under an `@example` tag is extracted, given an import
// preamble covering the whole public surface, and typechecked. A renamed export,
// a removed one, or a wrong signature fails here.
//
// Examples legitimately use undeclared placeholders (`findUser`, `id`, `Row`) —
// spelling every one out would make them worse documentation. Those surface as
// TS2304 / TS7006 / TS18046 and are ignored. Nothing else is: because the
// preamble imports the real surface, a renamed export fails on the *import*
// (TS2305/TS2724), not as an ignorable TS2304 in the body.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

// Resolve the compiler's own JS entry and run it under `process.execPath`,
// rather than the `node_modules/.bin/tsc` shim: that shim is `tsc.cmd` on
// Windows, so spawning the extensionless path only works on POSIX.
//
// Resolved via `package.json` — the one subpath TypeScript 7's `exports` map
// allows. Asking for `typescript/bin/tsc` directly is
// ERR_PACKAGE_PATH_NOT_EXPORTED there (7's package exports only `.`,
// `./package.json` and `./unstable/*`; 6.x had no `exports` map at all).
const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin",
  "tsc",
);

/**
 * Placeholder-name artifacts of extracting a snippet out of its prose.
 *
 * TS2552 is TS2304 with a spelling suggestion attached ("Cannot find name
 * 'result'. Did you mean 'Result'?") — TypeScript 7 offers one where 6.x
 * reported the bare TS2304. Both are an unresolved identifier in the snippet
 * BODY, which is exactly what a placeholder is. Neither weakens the guard this
 * spec exists for: a renamed export fails on the preamble `import` as
 * TS2305/TS2724, and those are not ignored.
 */
const PLACEHOLDER_CODES = ["TS2304", "TS2552", "TS7006", "TS18046"];

const publicExports = (): string[] => {
  const index = readFileSync(join(SRC, "index.ts"), "utf8");
  const names = new Set<string>();
  for (const block of index.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const raw of (block[1] ?? "").split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
};

const extract = (): { file: string; code: string }[] => {
  const found: { file: string; code: string }[] = [];
  for (const entry of readdirSync(SRC)) {
    if (!entry.endsWith(".ts") || entry.includes(".spec.") || entry.includes(".test-d.")) continue;
    const src = readFileSync(join(SRC, entry), "utf8");
    for (const example of src.matchAll(/@example\s*\n((?:\s*\*.*\n)+?)\s*\*\//g)) {
      const body = (example[1] ?? "")
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, ""))
        .join("\n");
      for (const fence of body.matchAll(/```ts\n([\s\S]*?)```/g)) {
        found.push({ file: entry, code: fence[1] ?? "" });
      }
    }
  }
  return found;
};

const workdir = mkdtempSync(join(tmpdir(), "unthrown-doc-examples-"));
afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

it("every TSDoc @example in this package typechecks", () => {
  const examples = extract();
  // A guard on the guard: if the extraction regex ever stops matching, this
  // test would pass vacuously.
  expect(examples.length).toBeGreaterThan(20);

  // Imports resolve to `src`, not `dist`, so the check needs no build step.
  const preamble = `import { ${publicExports().join(", ")} } from "${join(SRC, "index.js")}";\n`;
  examples.forEach(({ file, code }, i) => {
    // The example's own import line is dropped — the preamble supersedes it.
    const body = code.replace(/^\s*import .*from "unthrown";\s*$/gm, "");
    // `.mts` so a top-level `await` in an example is legal.
    writeFileSync(
      join(workdir, `ex${String(i).padStart(2, "0")}_${file.replace(".ts", "")}.mts`),
      preamble + body,
    );
  });
  writeFileSync(
    join(workdir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        noEmit: true,
        skipLibCheck: true,
        noUnusedLocals: false,
        lib: ["ES2022", "DOM"],
      },
      include: ["*.mts"],
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

  const real = output
    .split("\n")
    .filter((line) => /error TS\d+:/.test(line))
    .filter((line) => !PLACEHOLDER_CODES.some((code) => line.includes(`error ${code}:`)));

  expect(real, `\n${real.join("\n")}\n`).toEqual([]);
}, 60_000);
