// Inject the docs version dropdown into a LEGACY VitePress config — one from a
// stable tag that predates the native `DOCS_VERSIONS` support in
// docs/.vitepress/config.ts. The deploy workflow builds the stable site from
// that tag's own tree (so its docs stay faithful to the released version:
// pages, sidebar, API reference), and this script patches ONLY the nav so the
// stable site still offers the version picker.
//
// Usage: pnpm --filter ./docs exec tsx inject-docs-version-nav.ts <config.ts>
//   with DOCS_VERSIONS set to the same JSON the native config consumes:
//   { "current": "v4.3.0", "items": [{ "text", "link" }, ...] }
//
// No-op (exit 0) when the config already supports DOCS_VERSIONS natively —
// once the latest stable tag is >= the version that shipped native support,
// this script stops doing anything and can be deleted.

import { readFileSync, writeFileSync } from "node:fs";

type VersionMenu = {
  current: string;
  items: { text: string; link: string }[];
};

const [, , configPath] = process.argv;
const raw = process.env["DOCS_VERSIONS"];
if (!configPath || !raw) {
  console.error("usage: DOCS_VERSIONS='{...}' tsx inject-docs-version-nav.ts <config.ts>");
  process.exit(1);
}

const source = readFileSync(configPath, "utf8");

if (source.includes("DOCS_VERSIONS")) {
  console.log("config supports DOCS_VERSIONS natively — no injection needed");
  process.exit(0);
}

const versions = JSON.parse(raw) as VersionMenu;
const entry = `      // Version dropdown — injected at deploy time (this tag predates native
      // DOCS_VERSIONS support in the config; see inject-docs-version-nav.ts).
      ${JSON.stringify({ text: versions.current, items: versions.items })},\n`;

const anchor = "    nav: [\n";
if (!source.includes(anchor)) {
  console.error(`no \`nav: [\` anchor found in ${configPath} — layout changed, refusing to guess`);
  process.exit(1);
}

writeFileSync(configPath, source.replace(anchor, anchor + entry));
console.log(`injected version dropdown into ${configPath}`);
