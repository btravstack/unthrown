import { defineConfig } from "vitest/config";

// No coverage thresholds: an example is judged by whether it compiles and its
// specs pass, not by line coverage of code written to be read.
export default defineConfig({
  test: { include: ["src/**/*.spec.ts"] },
});
