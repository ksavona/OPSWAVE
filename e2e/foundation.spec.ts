import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("foundation page is truthful and has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Operational clarity, with humans in control." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Project management, AI intake, and planning workflows are not implemented yet.",
    ),
  ).toBeVisible();

  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScan.violations).toEqual([]);
});

test("health endpoint exposes only bounded service metadata", async ({ request }) => {
  const response = await request.get("/health");
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(JSON.parse(body)).toEqual({
    service: "opsweave-web",
    status: "ok",
    version: "0.0.0",
  });
  expect(body).not.toContain("OPENAI_API_KEY");
  expect(body).not.toContain("AI_CREDENTIAL_MASTER_KEY");
  expect(body).not.toContain("opsweave-local-only");
});
