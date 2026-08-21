import { AxeBuilder } from "@axe-core/playwright";
import { createDatabasePool, OpsWeaveStore } from "@opsweave/db";
import { expect, test } from "@playwright/test";

import { processOneIntakeJob } from "../apps/worker/src/intake-job.ts";

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

test("owner authentication and all six settings sections work end to end", async ({ page }) => {
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
  await page.getByLabel("Your full name").fill("Alexandra Simões");
  await page.getByLabel("People also call you").fill("Alex, Sandra");
  await page.getByRole("button", { name: "Save General settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Working Time" }).click();
  await page.getByLabel("monday end time").fill("15:00");
  await expect(page.getByLabel("monday available hours")).toHaveText("6h");
  await expect(page.getByText("38.00h")).toBeVisible();
  await page.getByRole("button", { name: "Save Working Time" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Project configuration" })).toBeVisible();
  await page.getByRole("button", { name: "Add stage" }).click();
  await page.getByLabel("Stage name").fill("Browser review");
  await page.getByRole("button", { name: "Create stage" }).click();
  await expect(page.getByText("Stage created.")).toBeVisible();

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
  const dailyPlanningResponse = page.waitForResponse("**/api/planning/run");
  await page.getByRole("button", { name: "Run daily planning now" }).click();
  expect((await dailyPlanningResponse).status()).toBe(200);
  await expect(page.getByText(/Daily planning completed/u)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  const weeklyPlanningResponse = page.waitForResponse("**/api/planning/run");
  await page.getByRole("button", { name: "Run weekly planning now" }).click();
  expect((await weeklyPlanningResponse).status()).toBe(200);
  await expect(page.getByText(/Weekly planning completed/u)).toBeVisible();

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

test("Phase 2 project and task boards persist controlled changes", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("synthetic-owner");
  await page.getByLabel("Password", { exact: true }).fill("synthetic replacement password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("region", { name: "Project stage: Planned" })
    .getByRole("button", { name: "Add project to this stage" })
    .click();
  await page.getByLabel("Project title").fill("Browser project");
  await page.getByLabel("Priority level (1–5)").selectOption("4");
  await page.locator('select[name="stageId"]').selectOption({ label: "Planned" });
  const projectResponse = page.waitForResponse("**/api/projects");
  await page.getByRole("button", { name: "Create project" }).click();
  expect((await projectResponse).status()).toBe(201);
  const projectCard = page.locator('[data-selectable-card][aria-label="Project: Browser project"]');
  await expect(projectCard).toBeVisible();
  await expect(projectCard.getByText("High priority", { exact: true })).toBeVisible();
  await projectCard.dispatchEvent("dblclick");
  const projectDialog = page.getByRole("dialog", { name: "Project details: Browser project" });
  await expect(projectDialog).toBeVisible();
  await expect(projectDialog.getByRole("button", { name: "Gantt" })).toBeVisible();
  await projectDialog.getByRole("button", { name: "Close details" }).click();

  await page
    .getByRole("region", { name: "Task lane: Inbox" })
    .getByRole("button", { name: "Add task to this stage" })
    .click();
  await page.getByLabel("Task title").fill("Browser task");
  await page.locator('select[name="projectId"]').selectOption({ label: "Browser project" });
  await page.getByLabel("Allocated hours").fill("4");
  await expect(page.getByLabel("Task size")).toHaveValue("mega");
  await page.getByLabel("End / due date").fill("2026-08-20");
  await page.getByLabel("Value score (1–100)").fill("75");
  await page.getByRole("button", { name: "Create task" }).click();
  const taskCard = page.locator('[data-selectable-card][aria-label="Task: Browser task"]');
  await expect(taskCard.getByText("75", { exact: true })).toBeVisible();
  await expect(taskCard.getByText("4h left", { exact: true })).toBeVisible();
  await expect(taskCard.getByText("mega", { exact: true })).toBeVisible();

  await page
    .getByRole("region", { name: "Task lane: Inbox" })
    .getByRole("button", { name: "Add task to this stage" })
    .click();
  await page.getByLabel("Task title").fill("Browser blocker");
  await page.locator('select[name="projectId"]').selectOption({ label: "Browser project" });
  await page.getByRole("button", { name: "Create task" }).click();
  await taskCard.dispatchEvent("dblclick");
  const taskDialog = page.getByRole("dialog", { name: "Task details: Browser task" });
  await expect(taskDialog).toBeVisible();
  await taskDialog.getByRole("button", { name: "Dependencies" }).click();
  await taskDialog.getByLabel("Add blocker").fill("Task · Browser blocker · Inbox");
  await taskDialog.getByRole("button", { name: "Add dependency" }).click();
  await expect(taskDialog.getByText("Task dependency added.")).toBeVisible();
  await expect(
    taskDialog.locator(".dependency-chip").filter({ hasText: "Browser blocker" }),
  ).toBeVisible();
  await taskDialog.getByRole("button", { name: "Close details" }).click();

  const blockerCard = page.locator('[data-selectable-card][aria-label="Task: Browser blocker"]');
  await blockerCard.dispatchEvent("dblclick");
  const blockerDialog = page.getByRole("dialog", { name: "Task details: Browser blocker" });
  await blockerDialog.getByRole("button", { name: "Dependencies" }).click();
  await blockerDialog.getByLabel("Add blocker").fill("Task · Browser task · Inbox");
  await blockerDialog.getByRole("button", { name: "Add dependency" }).click();
  await expect(blockerDialog.getByText("This dependency would create a cycle.")).toBeVisible();
  await blockerDialog.getByRole("button", { name: "Close details" }).click();

  await page.getByLabel("Board order").selectOption("greatest_value");
  const todayLane = page.getByRole("region", { name: "Task lane: Today" });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await taskCard.dispatchEvent("dragstart", { dataTransfer: transfer });
  await todayLane.dispatchEvent("dragover", { dataTransfer: transfer });
  await todayLane.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(todayLane.getByText("Browser task")).toBeVisible();
  await expect(page.getByLabel("Gantt items")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rendered Mermaid dependency diagram" }),
  ).toBeVisible();

  await blockerCard.dispatchEvent("dblclick");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog", { name: "Task details: Browser blocker" })
    .getByRole("button", { name: "Delete task" })
    .click();
  await expect(
    page.locator('[data-selectable-card][aria-label="Task: Browser blocker"]'),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Phase 4 intake remains reviewed, recoverable, and separate from live tasks", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("synthetic-owner");
  await page.getByLabel("Password", { exact: true }).fill("synthetic replacement password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Intake" }).click();
  await page.getByLabel("Source type").selectOption("meeting_note");
  await page
    .getByLabel("Paste the source text")
    .fill("Prepare a synthetic browser continuity checklist");
  await page.getByRole("button", { name: "Queue extraction" }).click();
  await expect(page.getByText(/queued for extraction/iu)).toBeVisible();

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (databaseUrl === undefined) throw new Error("TEST_DATABASE_URL is required.");
  const pool = createDatabasePool(databaseUrl);
  try {
    const processed = await processOneIntakeJob(new OpsWeaveStore(pool), {
      info: () => undefined,
      warn: () => undefined,
    } as never);
    expect(processed).toBe(true);
  } finally {
    await pool.end();
  }

  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(
    page.getByText("Prepare a synthetic browser continuity checklist").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Decline to Trash" }).click();
  await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible();
  await page.getByRole("button", { name: "Restore for review" }).click();
  await page.getByRole("button", { name: "Approve to Inbox" }).click();
  const protectedOutputs = await page.evaluate(async () => {
    const [planning, report, csv] = await Promise.all([
      fetch("/api/planning/preview", { method: "POST" }),
      fetch("/api/reports"),
      fetch("/api/reports/tasks.csv"),
    ]);
    const planningBody: unknown = await planning.json();
    const reportBody: unknown = await report.json();
    return {
      csv: await csv.text(),
      planning: { body: planningBody, status: planning.status },
      report: { body: reportBody, status: report.status },
    };
  });
  expect(protectedOutputs.planning).toMatchObject({
    body: { runId: expect.any(String), settingsVersion: expect.any(Number) },
    status: 200,
  });
  expect(protectedOutputs.report).toMatchObject({
    body: { metrics: { taskTotal: expect.any(Number) } },
    status: 200,
  });
  expect(protectedOutputs.csv).toContain('"Task","Lane","Value score","Value source"');
  expect(protectedOutputs.csv).not.toContain("Synthetic confidential source");
  await page.getByRole("link", { name: "Workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare a synthetic browser continuity checklist" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
