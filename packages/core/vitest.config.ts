import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Type-only tests carry no runtime; they're checked by `tsc`, not coverage.
      exclude: ["src/**/*.test-d.ts"],
      // Lock in the full-coverage suite. Branches sit below 100 only because of
      // the deliberately-unreachable defensive `then` rejection path.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 100,
      },
    },
  },
});
