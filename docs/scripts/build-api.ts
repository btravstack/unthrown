// Generate the per-package API reference into `api/<name>/`, one TypeDoc run
// per config, concurrently.
//
// TypeDoc lives HERE rather than in each package because it needs its own
// TypeScript: the packages build and typecheck on the native TypeScript 7,
// whose npm package ships no `typescript.js` (a platform binary plus
// `./unstable/*` entry points), and TypeDoc is written against the classic JS
// compiler API. One `package.json` can name `typescript` once, so `docs`
// resolves `catalog:typedoc` (6.0.3, the last release carrying that API) while
// every `packages/*` is on the default catalog's 7.0.2. See the `catalogs:`
// block in pnpm-workspace.yaml.
//
// Each `typedoc.<name>.json` points its `entryPoints` and `tsconfig` back at
// the package's own sources, so the output is byte-for-byte what running
// TypeDoc inside the package produced — it just lands directly in the site
// instead of being copied in afterwards.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..");

// Resolve TypeDoc's own JS entry and run it under `process.execPath` rather
// than the `node_modules/.bin` shim: that shim is `typedoc.cmd` on Windows, so
// spawning the extensionless path only works on POSIX.
//
// Resolved via `package.json` — the one subpath TypeDoc's `exports` map allows.
// Asking for `typedoc/bin/typedoc` directly is ERR_PACKAGE_PATH_NOT_EXPORTED.
const TYPEDOC = join(
  dirname(createRequire(import.meta.url).resolve("typedoc/package.json")),
  "bin",
  "typedoc",
);

// Keep in sync with the `typedoc.<name>.json` files beside this script and with
// the `/api/` sidebar in `.vitepress/config.ts`.
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

const results = await Promise.allSettled(
  packages.map(async (name) => {
    await run(process.execPath, [TYPEDOC, "--options", `typedoc.${name}.json`], {
      cwd: docsDir,
    });
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
