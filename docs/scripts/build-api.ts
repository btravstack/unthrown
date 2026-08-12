// Generate the per-package API reference into `api/<name>/`, one TypeDoc run
// per package, concurrently. TypeDoc lives here rather than in each package
// because it needs its own TypeScript — see CLAUDE.md.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..");

// Run TypeDoc's JS entry under `process.execPath`, not the `.bin` shim (which is
// `typedoc.cmd` on Windows). Resolved via `package.json` — the only subpath its
// `exports` map allows.
const TYPEDOC = join(
  dirname(createRequire(import.meta.url).resolve("typedoc/package.json")),
  "bin",
  "typedoc",
);

// Every documented package. `core`, `drizzle` and `orpc` keep an options file of
// their own because they carry settings nothing else needs (a `categoryOrder`,
// `intentionallyNotExported`, or several entry points — `orpc` has no root
// export at all); the rest differ only in the four values derived below, so they
// share `typedoc.base.json` and get those four on the command line — CLI
// arguments take precedence over the options file.
//
// Keep in sync with the `/api/` sidebar in `.vitepress/config.ts` and with
// `@unthrown/docs#build`'s `dependsOn` in `turbo.json`.
const packages: readonly string[] = [
  "core",
  "vitest",
  "effect",
  "neverthrow",
  "boxed",
  "standard-schema",
  "prisma",
  "drizzle",
  "orpc",
];

// Packages whose settings do not fit the shared base.
const OWN_OPTIONS: ReadonlySet<string> = new Set(["core", "drizzle", "orpc"]);

// `unthrown` is published unscoped; every satellite is `@unthrown/<dir>`.
const displayName = (name: string): string => (name === "core" ? "unthrown" : `@unthrown/${name}`);

const argsFor = (name: string): string[] =>
  OWN_OPTIONS.has(name)
    ? ["--options", `typedoc.${name}.json`]
    : [
        "--options",
        "typedoc.base.json",
        "--name",
        displayName(name),
        "--entryPoints",
        `../packages/${name}/src/index.ts`,
        "--tsconfig",
        `../packages/${name}/tsconfig.json`,
        "--out",
        `api/${name}`,
      ];

const results = await Promise.allSettled(
  packages.map(async (name) => {
    await run(process.execPath, [TYPEDOC, ...argsFor(name)], { cwd: docsDir });
    return name;
  }),
);

let failed = false;

for (const [index, result] of results.entries()) {
  const name = packages[index];
  if (result.status === "fulfilled") {
    console.log(`✓ generated API docs for ${name} → api/${name}/`);
  } else {
    failed = true;
    const { stdout, stderr } = result.reason as { stdout?: string; stderr?: string };
    console.error(`✗ TypeDoc failed for ${name}`);
    if (stdout) console.error(stdout);
    if (stderr) console.error(stderr);
  }
}

if (failed) process.exit(1);

console.log("✅ API documentation generated.");
