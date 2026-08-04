import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("anonymous users see an accessible login page and no setup route", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Sign in to OpsWeave" })).toBeVisible();
  await expect(page.getByText(/no default credentials or web registration route/iu)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/setup");
  await expect(page.getByText("404")).toBeVisible();
});

test("owner authentication and all five settings sections work end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("synthetic-owner");
  await page.getByLabel("Password", { exact: true }).fill("wrong synthetic password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The username or password is invalid.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("synthetic owner password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByText("Signed in as Synthetic-Owner")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("Phase 1 workspace");
  await page.getByRole("button", { name: "Save General settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Working Time" }).click();
  await page.getByLabel("monday available hours").fill("6");
  await expect(page.getByText("38.00h")).toBeVisible();
  await page.getByRole("button", { name: "Save Working Time" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "AI", exact: true }).click();
  const credential = "synthetic-valid-browser-provider-secret";
  await page.getByLabel("Synthetic fake-provider credential").fill(credential);
  const saveResponse = page.waitForResponse("**/api/settings/ai/credential");
  await page.getByRole("button", { name: "Add credential" }).click();
  expect(await (await saveResponse).text()).not.toContain(credential);
  await expect(page.getByLabel("Synthetic fake-provider credential")).toHaveValue("");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Not configured")).toBeVisible();

  await page.getByRole("button", { name: "Prioritisation" }).click();
  await page.getByLabel("Planning buffer (%)").fill("20");
  await page.getByLabel("Enable AI tie-breaking").check();
  await page.getByRole("button", { name: "Save Prioritisation" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Security" }).click();
  await expect(page.getByText("Synthetic-Owner")).toBeVisible();
  await page.getByLabel("Current password").fill("synthetic owner password");
  await page.getByLabel("New password", { exact: true }).fill("synthetic replacement password");
  await page.getByLabel("Confirm new password").fill("synthetic replacement password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel("Username").fill("synthetic-owner");
  await page.getByLabel("Password", { exact: true }).fill("synthetic replacement password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in as Synthetic-Owner")).toBeVisible();
});

test("health metadata is bounded and excludes secret configuration", async ({ request }) => {
  const response = await request.get("/health");
  const body = await response.text();
  expect(response.status()).toBe(200);
  expect(JSON.parse(body)).toEqual({ service: "opsweave-web", status: "ok", version: "0.0.0" });
  expect(body).not.toContain("OPENAI_API_KEY");
  expect(body).not.toContain("AI_CREDENTIAL_MASTER_KEY");
});
