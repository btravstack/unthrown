// Prisma 7 config for the TEST schema only. The package itself is schema-agnostic
// (it ships a client extension); this schema exists so the test suite has a concrete
// generated client (with a unique constraint and a relation) to exercise the bridge
// against an in-memory SQLite database.

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
});
