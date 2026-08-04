import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@opsweave/db": fromRoot("./packages/db/src/index.ts"),
    },
  },
  test: {
    fileParallelism: false,
    include: ["packages/*/src/**/*.integration.test.ts"],
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
