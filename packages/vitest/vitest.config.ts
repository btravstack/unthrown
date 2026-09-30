import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      // Always on, so a bare `vitest run` enforces the thresholds below.
      // CI appends `--coverage`; a second CLI flag would crash vitest, so this
      // lives in the config rather than in the `test` script — and local runs
      // can no longer pass while the gate fails.
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      // Lock in the matcher suite at full statement/line/function coverage. Two
      // defensive branches stay uncovered — `callSiteFrame`'s `stack ?? ""`
      // (V8 always populates `stack`) and the no-qualifying-frame arm of the
      // forgotten-await message — so `branches` sits just below 100.
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
});
