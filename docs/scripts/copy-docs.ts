// Copy each package's TypeDoc-generated Markdown (its `docs/` output) into the
// VitePress site under `api/<name>/`, so the API reference ships with the guide.
//
// The bare imports below establish the workspace dependencies for knip and for
// turbo build ordering (`^build:docs` runs before this script). Keep them in
// sync with the `packages` list.
import "unthrown";
import "@unthrown/pattern";
import "@unthrown/vitest";

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, "..", "api");
const nodeModulesDir = join(here, "..", "node_modules");

const packages: ReadonlyArray<{ readonly pkg: string; readonly out: string }> = [
  { pkg: "unthrown", out: "core" },
  { pkg: "@unthrown/vitest", out: "vitest" },
  { pkg: "@unthrown/pattern", out: "pattern" },
];

await mkdir(apiDir, { recursive: true });

for (const { pkg, out } of packages) {
  const source = join(nodeModulesDir, pkg, "docs");
  const target = join(apiDir, out);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  console.log(`✓ copied API docs for ${pkg} → api/${out}`);
}

console.log("✅ API documentation copied.");
