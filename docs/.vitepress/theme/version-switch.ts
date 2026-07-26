// Same-page version switching. The nav's version dropdown links each deployed
// version's ROOT (a static site can do no better, and with JS disabled that
// link still works) — this runtime enhancement intercepts those clicks and
// preserves the visitor's place: /unthrown/guide/boundaries switches to
// /unthrown/beta/guide/boundaries, same tab, search + hash included. A page
// missing from the target version lands on its 404 (which carries the nav to
// recover) — versions legitimately differ in page sets.
//
// The deploy workflow appends this same logic to a legacy stable tag's theme
// (see .github/scripts/inject-docs-version-nav.ts), so keep it dependency-free
// and self-contained.

const VERSION_ROOT = /^https:\/\/btravstack\.github\.io(\/unthrown\/(?:beta\/)?)$/;

export function setupVersionSwitch(): void {
  if (typeof window === "undefined") {
    return;
  }
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      const match = anchor?.getAttribute("href")?.match(VERSION_ROOT);
      if (!anchor || !match?.[1]) {
        return;
      }
      const targetBase = match[1];
      // Vite injects this build's own base (/unthrown/ or /unthrown/beta/).
      const ownBase = import.meta.env.BASE_URL;
      if (targetBase === ownBase) {
        return; // the current version — let the plain link do its thing
      }
      const path = window.location.pathname.startsWith(ownBase)
        ? window.location.pathname.slice(ownBase.length)
        : "";
      event.preventDefault();
      window.location.href = `https://btravstack.github.io${targetBase}${path}${window.location.search}${window.location.hash}`;
    },
    true,
  );
}
