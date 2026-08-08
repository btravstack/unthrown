// Generate the per-package API reference into `api/<name>/`, one TypeDoc run
// per `typedoc.<name>.json`, concurrently. TypeDoc lives here rather than in
// each package because it needs its own TypeScript — see CLAUDE.md.
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
