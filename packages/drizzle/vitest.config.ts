import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // One PostgreSQL container for the whole run, started before the first
    // worker and stopped after the last; every fixture gets a fresh database
    // inside it. See src/test-container.ts.
    globalSetup: ["./src/test-container.ts"],
    coverage: {
      // Always on, so a bare `vitest run` enforces the thresholds below.
      // CI appends `--coverage`; a second CLI flag would crash vitest, so this
      // lives in the config rather than in the `test` script — and local runs
      // can no longer pass while the gate fails.
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      // src/test-harness.ts and src/test-container.ts are test infrastructure,
      // not library code; src/types.test-d.ts (a later task) has no runtime.
      // No thresholds yet — this task ships only a smoke test. A later task
      // raises coverage to the family's usual 100%.
      exclude: [
        "src/test-harness.ts",
        "src/test-container.ts",
        "src/**/*.test-d.ts",
        "src/**/*.spec.ts",
      ],
    },
  },
});
