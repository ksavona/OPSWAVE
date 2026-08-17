// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RichTextEditor } from "./rich-text-editor";

describe("RichTextEditor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("builds an editor-local index from Heading 2 and Heading 3 sections", async () => {
    const user = userEvent.setup();
    render(
      <RichTextEditor
        label="Task notes"
        onChange={vi.fn()}
        value={{
          content: [
            {
              attrs: { level: 1 },
              content: [{ text: "Page title", type: "text" }],
              type: "heading",
            },
            { attrs: { level: 2 }, content: [{ text: "Scope", type: "text" }], type: "heading" },
            { attrs: { level: 3 }, content: [{ text: "Details", type: "text" }], type: "heading" },
          ],
          type: "doc",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Index" }));
    const index = screen.getByRole("navigation", { name: "Notes index" });
    expect(index).toHaveTextContent("Scope");
    expect(index).toHaveTextContent("Details");
    expect(index).not.toHaveTextContent("Page title");
  });

  it("uploads a pasted image and inserts its authenticated inline URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const rendered = render(
      <RichTextEditor
        entityId="22222222-2222-4222-8222-222222222222"
        entityType="task"
        label="Task notes"
        onChange={vi.fn()}
        value={{ content: [{ type: "paragraph" }], type: "doc" }}
      />,
    );
    const editable = rendered.container.querySelector(".rich-text-content");
    if (editable === null) throw new Error("Expected the notes editor.");
    const file = new File([new Uint8Array([1, 2, 3])], "clipboard.png", {
      type: "image/png",
    });
    fireEvent.paste(editable, {
      clipboardData: {
        getData: () => "",
        items: [{ getAsFile: () => file, kind: "file", type: "image/png" }],
      },
    });

    await waitFor(() => {
      expect(rendered.container.querySelector("img")).toHaveAttribute(
        "src",
        "/api/attachments/11111111-1111-4111-8111-111111111111?inline=1",
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks/22222222-2222-4222-8222-222222222222/attachments",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Image added to notes and Documents.")).toBeInTheDocument();
  });
});
