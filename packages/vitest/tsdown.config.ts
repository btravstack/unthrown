import { defineConfig } from "tsdown";

// Keep peer/workspace deps out of the bundle and out of the declaration files
// so their types are referenced, not inlined.
export default defineConfig({
  external: ["unthrown", "vitest"],
});
