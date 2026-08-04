import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const testBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
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
