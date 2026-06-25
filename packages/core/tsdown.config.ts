import { defineConfig } from "tsdown";

// Core has zero runtime dependencies, so nothing needs to be externalized.
// Entry and formats are passed via the build script's CLI flags.
export default defineConfig({});
