import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@opsweave/ai": fromRoot("./packages/ai/src/index.ts"),
      "@opsweave/db": fromRoot("./packages/db/src/index.ts"),
      "@opsweave/domain/work": fromRoot("./packages/domain/src/work.ts"),
      "@opsweave/domain": fromRoot("./packages/domain/src/index.ts"),
      "@opsweave/testing": fromRoot("./packages/testing/src/index.ts"),
    },
  },
  test: {
    coverage: {
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/main.ts",
        "**/migrate.ts",
        "apps/web/src/app/**/layout.tsx",
        "apps/web/src/app/**/page.tsx",
        "apps/web/src/app/api/**/*.ts",
        "apps/web/src/components/entity-editors.tsx",
        "apps/web/src/components/intake-panel.tsx",
        "apps/web/src/components/project-stage-settings.tsx",
        "apps/web/src/components/rich-text-editor.tsx",
        "apps/web/src/components/workspace.tsx",
        "apps/web/src/proxy.ts",
        "apps/web/src/server/current-session.ts",
        "apps/web/src/server/http-handlers.ts",
        "apps/web/src/server/rate-limits.ts",
        "apps/web/src/server/runtime.ts",
        "apps/web/src/server/work-service.ts",
        "packages/db/src/client.ts",
        "packages/db/src/schema.ts",
        "packages/db/src/store.ts",
      ],
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    exclude: ["**/*.integration.test.ts", "e2e/**", "node_modules/**"],
    include: ["apps/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
    restoreMocks: true,
    setupFiles: [fromRoot("./test/setup.ts")],
  },
});
