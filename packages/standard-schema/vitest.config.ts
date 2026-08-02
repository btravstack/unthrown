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
      // Both entry points are exercised over valid input, issues, an async
      // schema, and a throwing validator (→ defect), covering every branch.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 100,
      },
    },
  },
});
