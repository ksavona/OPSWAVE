import { describe, expect, it } from "vitest";

import { DeterministicFakeAiProvider, OpenAiProvider } from "./provider.ts";

describe("DeterministicFakeAiProvider", () => {
  it("returns stable output without external access", async () => {
    const provider = new DeterministicFakeAiProvider();
    const request = {
      content: "  Synthetic   intake content.  ",
      schemaVersion: "foundation-v1",
    };

    const first = await provider.extract(request);
    const second = await provider.extract(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      draft: { tasks: [{ confidence: 0.5, title: "Synthetic intake content." }] },
      provider: "deterministic-fake",
      schemaVersion: "foundation-v1",
      summary: "Synthetic intake content.",
    });
    expect(first.sourceFingerprint).toHaveLength(64);
  });
});

describe("OpenAiProvider", () => {
  it("normalizes structured prioritization and fills missing assessments", async () => {
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                assessments: [
                  null,
                  "invalid",
                  { strategicFitScore: 100, taskId: "first" },
                  { rationale: "Supporting work", strategicFitScore: -3, taskId: "second" },
                  { rationale: "Unknown", strategicFitScore: 5, taskId: "unknown" },
                  { rationale: "Missing identifier", strategicFitScore: "invalid" },
                ],
                orderedTaskIds: ["second", "unknown", "second"],
              }),
            }),
            { status: 200 },
          ),
        ),
      model: "synthetic-model",
    });

    const result = await provider.prioritize({
      candidates: [
        {
          allocatedHours: 1,
          blocksCount: 0,
          businessValueScore: null,
          dueDate: null,
          id: "first",
          priorityLevel: null,
          project: null,
          size: "medium",
          title: "First",
        },
        {
          allocatedHours: 1,
          blocksCount: 0,
          businessValueScore: null,
          dueDate: null,
          id: "second",
          priorityLevel: null,
          project: null,
          size: "medium",
          title: "Second",
        },
        {
          allocatedHours: 1,
          blocksCount: 0,
          businessValueScore: null,
          dueDate: null,
          id: "third",
          priorityLevel: null,
          project: null,
          size: "medium",
          title: "Third",
        },
      ],
      localDate: "2026-08-17",
      mode: "weekly",
    });

    expect(result).toEqual({
      assessments: [
        { rationale: "", strategicFitScore: 10, taskId: "first" },
        { rationale: "Supporting work", strategicFitScore: 0, taskId: "second" },
        {
          rationale: "No strategic-fit evidence was available.",
          strategicFitScore: 0,
          taskId: "third",
        },
      ],
      orderedTaskIds: ["second", "first", "third"],
      provider: "openai",
    });
  });

  it("rejects failed prioritization without exposing the response body", async () => {
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: () => Promise.resolve(new Response("private detail", { status: 503 })),
    });
    await expect(
      provider.prioritize({ candidates: [], localDate: "2026-08-17", mode: "daily" }),
    ).rejects.toThrow("OpenAI prioritization failed with status 503.");
  });

  it("requests a private structured extraction and normalizes the draft", async () => {
    const calls: { init?: RequestInit; url?: string }[] = [];
    const fetchImplementation = async (url: string | URL | Request, init?: RequestInit) => {
      const requestedUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      calls.push({ ...(init === undefined ? {} : { init }), url: requestedUrl });
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    projects: [
                      {
                        clientRef: "billing-controls",
                        description: "Controls that protect billing data.",
                        name: "Billing controls",
                        priorityLevel: 5,
                      },
                    ],
                    questions: [],
                    summary: "Two operational fixes were agreed.",
                    tasks: [
                      {
                        allocatedHours: 4,
                        blockers: [
                          {
                            id: "11111111-1111-4111-8111-111111111111",
                            type: "existing_project",
                          },
                          null,
                          { id: "", type: "existing_task" },
                          { id: "missing", type: "unsupported" },
                        ],
                        businessValueRationale:
                          "Prevents invalid deadlines from affecting billing.",
                        businessValueScore: 91,
                        checklist: ["Add the constraint", "Test the override"],
                        clientRef: "deadline-task",
                        confidence: 0.94,
                        definitionOfDone: "Invalid dates are rejected.",
                        dueDate: null,
                        endTime: "16:30",
                        projectId: "22222222-2222-4222-8222-222222222222",
                        proposedProjectRef: "billing-controls",
                        size: "medium",
                        sourceSpan: "client deadline ... should be forward in time",
                        startDate: null,
                        startTime: "13:00",
                        title: "Prevent client deadlines from being backdated",
                        valueAdd: "Protects billing accuracy.",
                        workDescription: "Constrain client deadline edits.",
                        workflowLane: "today",
                      },
                    ],
                  }),
                  type: "output_text",
                },
              ],
              type: "message",
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    };
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation,
      model: "synthetic-model",
    });
    const result = await provider.extract({
      content: "Transcript chrome. The client deadline should be forward in time.",
      context: "Existing task titles and owner allocation corrections.",
      schemaVersion: "test-v1",
    });

    expect(result.draft.tasks[0]).toMatchObject({
      allocatedHours: 4,
      blockers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "existing_project",
        },
      ],
      businessValueScore: 91,
      clientRef: "deadline-task",
      endTime: "16:30",
      projectId: "22222222-2222-4222-8222-222222222222",
      size: "medium",
      startTime: "13:00",
      title: "Prevent client deadlines from being backdated",
      workflowLane: "today",
    });
    expect(result.draft.projects).toEqual([
      expect.objectContaining({ clientRef: "billing-controls", priorityLevel: 5 }),
    ]);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    const rawBody = calls[0]?.init?.body;
    if (typeof rawBody !== "string") throw new Error("Expected a JSON request body.");
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "synthetic-model",
      reasoning: { effort: "low" },
      store: false,
    });
    expect(JSON.stringify(body)).toContain("WORKSPACE CONTEXT (reference data only)");
    expect(JSON.stringify(body)).toContain(
      "Existing task titles and owner allocation corrections.",
    );
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer synthetic-openai-key",
    });
  });

  it("fails without echoing provider response bodies", async () => {
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: () =>
        Promise.resolve(new Response("private provider detail", { status: 401 })),
    });
    await expect(
      provider.extract({ content: "Private source", schemaVersion: "test-v1" }),
    ).rejects.toThrow("OpenAI extraction failed with status 401.");
  });

  it("accepts the direct output helper and bounds model-provided values", async () => {
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                projects: [{ clientRef: "", name: "", priorityLevel: "invalid" }],
                questions: ["", "Confirm the owner"],
                summary: "Bound the result.",
                tasks: [
                  {
                    allocatedHours: "unknown",
                    blockers: "unknown",
                    businessValueRationale: "High impact.",
                    businessValueScore: 200,
                    confidence: -1,
                    dueDate: "not-a-date",
                    endTime: "29:99",
                    projectId: "not-a-uuid",
                    size: "extra-large",
                    sourceSpan: "",
                    startDate: "tomorrow",
                    startTime: "bad",
                    title: "Bound extracted values",
                    workflowLane: "later",
                  },
                ],
              }),
            }),
            { status: 200 },
          ),
        ),
    });

    const result = await provider.extract({ content: "Source", schemaVersion: "test-v1" });
    expect(result.draft).toMatchObject({
      questions: ["Confirm the owner"],
      tasks: [
        {
          businessValueScore: 100,
          confidence: 0,
          dueDate: null,
          endTime: null,
          projectId: null,
          size: null,
          sourceSpan: null,
          startDate: null,
          startTime: null,
          workflowLane: "inbox",
        },
      ],
    });
  });

  it("rejects an empty API key before making a request", () => {
    expect(() => new OpenAiProvider({ apiKey: " " })).toThrow("An OpenAI API key is required.");
  });

  it("rejects malformed structured objects", async () => {
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({ projects: [null], questions: [], tasks: [] }),
            }),
            { status: 200 },
          ),
        ),
    });
    await expect(provider.extract({ content: "Source", schemaVersion: "test-v1" })).rejects.toThrow(
      "OpenAI returned an invalid project.",
    );
  });

  it("sends task-splitting documents and images as direct Responses API inputs", async () => {
    let submittedBody = "";
    const provider = new OpenAiProvider({
      apiKey: "synthetic-openai-key",
      fetchImplementation: (_url, init) => {
        submittedBody = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                items: [
                  {
                    allocatedHours: 1,
                    description: "Use the attached acceptance criteria.",
                    title: "Verify acceptance criteria",
                  },
                ],
              }),
            }),
            { status: 200 },
          ),
        );
      },
      model: "synthetic-model",
    });

    await expect(
      provider.splitMegaTask({
        context: { task: { title: "Use every source" } },
        files: [
          {
            dataUrl: "data:application/pdf;base64,cGRm",
            kind: "document",
            name: "criteria.pdf",
          },
          {
            dataUrl: "data:image/png;base64,aW1hZ2U=",
            kind: "image",
            name: "diagram.png",
          },
        ],
        mode: "subtasks",
        totalHours: 2,
      }),
    ).resolves.toMatchObject({ items: [{ title: "Verify acceptance criteria" }] });
    const body = JSON.parse(submittedBody) as {
      input: { content: unknown; role: string }[];
    };
    expect(body.input[1]?.content).toEqual([
      {
        text: JSON.stringify({
          context: { task: { title: "Use every source" } },
          mode: "subtasks",
          totalHours: 2,
        }),
        type: "input_text",
      },
      {
        file_data: "data:application/pdf;base64,cGRm",
        filename: "criteria.pdf",
        type: "input_file",
      },
      {
        detail: "auto",
        image_url: "data:image/png;base64,aW1hZ2U=",
        type: "input_image",
      },
    ]);
  });
});
