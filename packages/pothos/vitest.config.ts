import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // Pothos and graphql are evaluated by the same loader as the specs: left
    // external, Pothos would build its schema with Node's copy of graphql while
    // a spec's `import { graphql } from "graphql"` gets Vite's, and graphql's
    // realm check refuses a schema from the other copy.
    server: { deps: { inline: [/@pothos\//u] } },
    coverage: {
      // Always on, so a bare `vitest run` enforces the thresholds below.
      // CI appends `--coverage`; a second CLI flag would crash vitest, so this
      // lives in the config rather than in the `test` script — and local runs
      // can no longer pass while the gate fails.
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test-d.ts", "src/**/*.spec.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
