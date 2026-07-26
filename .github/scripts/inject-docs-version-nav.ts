// Inject the docs version dropdown into a LEGACY VitePress site — one built
// from a stable tag that predates the native `DOCS_VERSIONS` support in
// docs/.vitepress/config.ts. The deploy workflow builds the stable site from
// that tag's own tree (so its docs stay faithful to the released version:
// pages, sidebar, API reference), and this script patches ONLY the version UI:
//
// 1. the nav — the dropdown is inserted right AFTER the `btravstack` hub item,
//    the same position the native config appends it, so the picker sits in the
//    same place on every version of the site;
// 2. the theme — the same-page/same-tab switch enhancement (the runtime click
//    interceptor `docs/.vitepress/theme/version-switch.ts` ships natively) is
//    appended to the tag's theme entry, so switching versions from a legacy
//    site also preserves the visitor's place.
//
// Usage: tsx inject-docs-version-nav.ts <path-to-docs/.vitepress>
//   with DOCS_VERSIONS set to the same JSON the native config consumes:
//   { "current": "v4.3.0", "items": [{ "text", "link", "target" }, ...] }
//
// No-op (exit 0) when the config already supports DOCS_VERSIONS natively —
// once the latest stable tag is >= the version that shipped native support,
// this script stops doing anything and can be deleted.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type VersionMenu = {
  current: string;
  items: { text: string; link: string; target?: string }[];
};

const [, , vitepressDir] = process.argv;
const raw = process.env["DOCS_VERSIONS"];
if (!vitepressDir || !raw) {
  console.error("usage: DOCS_VERSIONS='{...}' tsx inject-docs-version-nav.ts <docs/.vitepress>");
  process.exit(1);
}

const configPath = join(vitepressDir, "config.ts");
const source = readFileSync(configPath, "utf8");

if (source.includes("DOCS_VERSIONS")) {
  console.log("config supports DOCS_VERSIONS natively — no injection needed");
  process.exit(0);
}

// --- 1. Nav dropdown, positioned as the native config positions it. ---
const versions = JSON.parse(raw) as VersionMenu;
const anchor = `      { text: "btravstack", link: "https://btravstack.github.io/" },\n`;
if (!source.includes(anchor)) {
  console.error(
    `no btravstack nav anchor found in ${configPath} — layout changed, refusing to guess`,
  );
  process.exit(1);
}
const entry = `      // Version dropdown — injected at deploy time (this tag predates native
      // DOCS_VERSIONS support in the config; see inject-docs-version-nav.ts).
      ${JSON.stringify({ text: versions.current, items: versions.items })},\n`;
writeFileSync(configPath, source.replace(anchor, anchor + entry));
console.log(`injected version dropdown into ${configPath}`);

// --- 2. Same-page/same-tab switch enhancement, appended to the theme entry. ---
// Inlined (not imported from the main tree) so the patched tag tree stays
// self-contained; keep in sync with docs/.vitepress/theme/version-switch.ts.
const themePath = join(vitepressDir, "theme", "index.ts");
const theme = readFileSync(themePath, "utf8");
const enhancement = `
// Same-page/same-tab version switching — appended at deploy time (this tag
// predates the native docs/.vitepress/theme/version-switch.ts).
if (typeof window !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      const match = anchor
        ?.getAttribute("href")
        ?.match(/^https:\\/\\/btravstack\\.github\\.io(\\/unthrown\\/(?:beta\\/)?)$/);
      if (!anchor || !match?.[1]) {
        return;
      }
      const targetBase = match[1];
      const ownBase = import.meta.env.BASE_URL;
      if (targetBase === ownBase) {
        return;
      }
      const path = window.location.pathname.startsWith(ownBase)
        ? window.location.pathname.slice(ownBase.length)
        : "";
      event.preventDefault();
      window.location.href =
        "https://btravstack.github.io" +
        targetBase +
        path +
        window.location.search +
        window.location.hash;
    },
    true,
  );
}
`;
writeFileSync(themePath, theme + enhancement);
console.log(`appended version-switch enhancement to ${themePath}`);
