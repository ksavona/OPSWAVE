// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntakePanel } from "./intake-panel";

const reviewId = "11111111-1111-4111-8111-111111111111";
const trashId = "22222222-2222-4222-8222-222222222222";
const approvedId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";

const proposal = {
  participants: ["Alexandra Simões", "Brian Vassallo"],
  projects: [
    {
      clientRef: "runbook-project",
      description: "Synthetic continuity preparation.",
      name: "Continuity project",
      priorityLevel: 5,
    },
  ],
  questions: ["Which project owns this task?"],
  summary: "Prepare a synthetic runbook.",
  tasks: [
    {
      allocatedHours: 4,
      businessValueRationale: "Reduces operational recovery risk.",
      businessValueScore: 84,
      checklist: ["Draft the steps", "Review the steps"],
      confidence: 0.82,
      definitionOfDone: "The runbook is approved.",
      dueDate: "2026-08-20",
      projectId: null,
      proposedProjectRef: "runbook-project",
      size: "medium",
      sourceSpan: "prepare a runbook",
      startDate: "2026-08-15",
      title: "Prepare runbook",
      valueAdd: "Faster recovery.",
      workDescription: "Write and review the operational runbook.",
    },
    {
      businessValueRationale: null,
      businessValueScore: null,
      confidence: 0.5,
      dueDate: null,
      sourceSpan: null,
      title: "Clarify the recovery owner",
    },
    {
      assigneeName: "Brian Vassallo",
      businessValueRationale: "Tracks an external commitment.",
      businessValueScore: 55,
      confidence: 0.9,
      dueDate: null,
      ownerTask: false,
      sourceSpan: "Brian will confirm the recovery window",
      title: "Confirm the recovery window",
    },
  ],
};

const listing = {
  drafts: [
    {
      duplicateOfSourceId: "55555555-5555-4555-8555-555555555555",
      id: reviewId,
      proposal,
      purgeAfter: null,
      sourceType: "meeting_note",
      status: "review_required",
    },
    {
      duplicateOfSourceId: null,
      id: trashId,
      proposal: { ...proposal, questions: [], summary: "Trashed synthetic draft." },
      purgeAfter: "2026-09-10T12:00:00.000Z",
      sourceType: "instruction",
      status: "trashed",
    },
    {
      duplicateOfSourceId: null,
      id: approvedId,
      proposal: { ...proposal, questions: [], summary: "Approved synthetic draft." },
      purgeAfter: null,
      sourceType: "transcript",
      status: "approved",
    },
  ],
  failedRuns: [
    {
      duplicateOfSourceId: "66666666-6666-4666-8666-666666666666",
      id: runId,
      safeError: "Extraction could not be completed.",
      sourceType: "other_text",
    },
  ],
  projects: [
    {
      archivedAt: null,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Existing continuity",
      stageId: "88888888-8888-4888-8888-888888888888",
      stageName: "Active",
    },
  ],
  stages: [
    {
      archivedAt: null,
      id: "88888888-8888-4888-8888-888888888888",
      name: "Active",
    },
  ],
  tasks: [],
};

describe("IntakePanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports source selection, duplicate warnings, review, retry, Trash, and restore", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url === "/api/intake" && (init?.method ?? "GET") === "GET")
        return new Response(JSON.stringify(listing), { status: 200 });
      if (url === "/api/intake" && init?.method === "POST")
        return new Response(JSON.stringify({ duplicateOfSourceId: "earlier-source" }), {
          status: 202,
        });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const user = userEvent.setup();
    render(<IntakePanel />);

    expect(await screen.findByText("Prepare a synthetic runbook.")).toBeInTheDocument();
    expect(
      screen.getByText(/possible duplicate of an earlier intake source/iu),
    ).toBeInTheDocument();
    expect(screen.getByText("Which project owns this task?")).toBeInTheDocument();
    expect(screen.getByText(/confidence 82%/iu)).toBeInTheDocument();
    expect(screen.getByText("Value 84/100")).toBeInTheDocument();
    expect(screen.getByText("Reduces operational recovery risk.")).toBeInTheDocument();
    expect(screen.getByText("Continuity project")).toBeInTheDocument();
    expect(screen.getByText(/4h · medium/iu)).toBeInTheDocument();
    expect(screen.getByText("Write and review the operational runbook.")).toBeInTheDocument();
    expect(screen.getByText("Proposed subtasks (2)")).toBeInTheDocument();
    expect(screen.getByText("Value not scored")).toBeInTheDocument();
    expect(screen.getByText("People identified:")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Third-party tasks" })).toBeInTheDocument();
    expect(screen.getByText("Assigned to Brian Vassallo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move to my tasks" }));
    expect(screen.queryByRole("button", { name: "Move to my tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failed extraction" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByText("Approved intake history (1)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search projects")).not.toBeInTheDocument();

    const projectSearch = screen.getAllByLabelText("Select project")[0];
    const addProject = screen.getAllByRole("button", { name: "Add project" })[0];
    if (projectSearch === undefined || addProject === undefined)
      throw new Error("Expected the intake project picker.");
    await user.type(projectSearch, "Existing continuity · Active");
    await user.click(addProject);
    expect(screen.getByRole("button", { name: "Existing continuity ×" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Source type"), "transcript");
    await user.type(screen.getByLabelText("Paste the source text"), "Synthetic transcript");
    await user.click(screen.getByRole("button", { name: "Queue extraction" }));
    expect(
      await screen.findByText(/matching earlier intake source was found/iu),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/intake",
      expect.objectContaining({
        body: JSON.stringify({
          content: "Synthetic transcript",
          selectedProjectIds: ["77777777-7777-4777-8777-777777777777"],
          sourceType: "transcript",
        }),
        method: "POST",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Approve to Inbox" }));
    expect(await screen.findByText("Approved tasks were added to Inbox.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry extraction" }));
    expect(await screen.findByText("Extraction queued for retry.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore for review" }));
    expect(await screen.findByText("Draft restored for review.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decline to Trash" }));
    expect(await screen.findByText("Draft moved to Trash for 30 days.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText("Intake status refreshed.")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/intake/${reviewId}/approve`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/intake/runs/${runId}/retry`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/intake/${trashId}/restore`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the proposed-task popup scroll isolated from the Intake page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(listing), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<IntakePanel />);

    expect(await screen.findByText("Prepare a synthetic runbook.")).toBeInTheDocument();
    const edit = screen.getAllByRole("button", { name: "Edit" })[0];
    if (edit === undefined) throw new Error("Expected a proposed task edit action.");
    await user.click(edit);
    const dialog = await screen.findByRole("dialog", {
      name: "Edit proposed task: Prepare runbook",
    });
    expect(dialog).toHaveClass("standalone-entity-modal");
    expect(dialog.querySelector(".entity-modal-content")).toHaveClass("intake-draft-editor");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("reports load, submission, and refresh failures safely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "Synthetic safe intake error." }), {
          status: 503,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<IntakePanel />);
    expect(await screen.findByText("Synthetic safe intake error.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Paste the source text"), "Synthetic input");
    await user.click(screen.getByRole("button", { name: "Queue extraction" }));
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText("Synthetic safe intake error.")).toBeInTheDocument();
  });

  it("labels recovery placeholders and retries their retained source", async () => {
    const fallbackListing = {
      ...listing,
      drafts: [
        {
          duplicateOfSourceId: null,
          id: reviewId,
          proposal: {
            participants: [],
            projects: [],
            questions: ["Automatic extraction was unavailable."],
            summary: "The source was retained.",
            tasks: [
              {
                businessValueRationale: "Prevents commitments from being lost.",
                businessValueScore: 40,
                clientRef: "fallback-review-1",
                confidence: 0.1,
                dueDate: null,
                sourceSpan: "Synthetic retained source",
                title: "Review transcript and confirm action items",
              },
            ],
          },
          purgeAfter: null,
          sourceType: "transcript",
          status: "review_required",
        },
      ],
      failedRuns: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url === "/api/intake" && (init?.method ?? "GET") === "GET")
        return new Response(JSON.stringify(fallbackListing), { status: 200 });
      return new Response(JSON.stringify({ queued: true }), { status: 202 });
    });
    const user = userEvent.setup();
    render(<IntakePanel />);

    expect(await screen.findByText("No action items were extracted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve to Inbox" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry full extraction" }));
    expect(
      await screen.findByText("The retained source was queued for a full extraction retry."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/intake/${reviewId}/retry`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses bounded fallback messages for non-Error transport failures", async () => {
    let initialLoad = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (initialLoad) {
        initialLoad = false;
        return new Response(JSON.stringify(listing), { status: 200 });
      }
      const rejection: unknown = "synthetic non-error rejection";
      throw rejection;
    });
    const user = userEvent.setup();
    render(<IntakePanel />);
    expect(await screen.findByText("Prepare a synthetic runbook.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Paste the source text"), "Synthetic input");
    await user.click(screen.getByRole("button", { name: "Queue extraction" }));
    expect(await screen.findByText("Unable to queue intake.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve to Inbox" }));
    expect(await screen.findByText("Unable to update draft.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry extraction" }));
    expect(await screen.findByText("Unable to retry extraction.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore for review" }));
    expect(await screen.findByText("Unable to restore draft.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText("Unable to refresh intake.")).toBeInTheDocument();
  });
});
