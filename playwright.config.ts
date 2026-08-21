import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const testBaseUrl = "http://127.0.0.1:3100";
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://opsweave:opsweave-test-only@127.0.0.1:55432/opsweave_test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: testBaseUrl,
    launchOptions: executablePath === undefined ? {} : { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @opsweave/web exec next start --hostname 127.0.0.1 --port 3100",
    env: {
      AI_CREDENTIAL_MASTER_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      AI_CREDENTIAL_MASTER_KEY_VERSION: "1",
      APP_BASE_URL: testBaseUrl,
      AUTH_RATE_LIMIT_PEPPER: "synthetic-browser-rate-limit-pepper-32-characters",
      DATABASE_URL: testDatabaseUrl,
      NEXT_TELEMETRY_DISABLED: "1",
      OPENAI_API_KEY: "",
      TRUST_PROXY: "false",
    },
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: `${testBaseUrl}/health`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
