"use client";

import Image from "@tiptap/extension-image";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

import { emptyRichDocument } from "./workspace-types";

const isDocument = (value: unknown): value is JSONContent =>
  value !== null && typeof value === "object" && "type" in value && value.type === "doc";

const asDocument = (value: unknown): JSONContent =>
  isDocument(value)
    ? value
    : { content: [...emptyRichDocument.content], type: emptyRichDocument.type };

const pastedImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

interface HeadingItem {
  level: number;
  text: string;
}

const headingsFrom = (document: JSONContent): HeadingItem[] => {
  const headings: HeadingItem[] = [];
  const visit = (node: JSONContent): void => {
    const level = Number(node.attrs?.level ?? 1);
    if (node.type === "heading" && (level === 2 || level === 3)) {
      const text = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("")
        .trim();
      if (text.length > 0) headings.push({ level, text });
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(document);
  return headings;
};

export const RichTextEditor = ({
  entityId,
  entityType,
  label,
  onChange,
  value,
}: {
  entityId?: string;
  entityType?: "project" | "task";
  label: string;
  onChange: (value: JSONContent) => void;
  value: unknown;
}) => {
  const initialDocument = asDocument(value);
  const [headings, setHeadings] = useState(() => headingsFrom(initialDocument));
  const [indexOpen, setIndexOpen] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    content: initialDocument,
    editorProps: {
      attributes: { "aria-label": label, class: "rich-text-content" },
      handleKeyDown: (_view, event) => {
        if (event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey)
          setSlashOpen(true);
        if (event.key === "Escape") setSlashOpen(false);
        return false;
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (clipboard === null) return false;
        const file = [...clipboard.items]
          .find((item) => item.kind === "file" && item.type.startsWith("image/"))
          ?.getAsFile();
        if (file === null || file === undefined) return false;
        event.preventDefault();
        if (entityId === undefined || entityType === undefined) {
          setMediaMessage("Save this task before pasting images into its notes.");
          return true;
        }
        if (!pastedImageTypes.has(file.type)) {
          setMediaMessage("Paste a PNG, JPEG, WebP, or non-animated GIF image.");
          return true;
        }
        if (file.size <= 0 || file.size > 25 * 1024 * 1024) {
          setMediaMessage("Pasted images must be between 1 byte and 25 MB.");
          return true;
        }
        setMediaMessage("Uploading pasted image…");
        const submitted = new FormData();
        submitted.set("file", file, file.name || "pasted-image.png");
        void fetch(`/api/${entityType}s/${entityId}/attachments`, {
          body: submitted,
          method: "POST",
        })
          .then(async (response) => {
            const result = (await response.json()) as unknown;
            if (!response.ok)
              throw new Error(
                result !== null &&
                  typeof result === "object" &&
                  "message" in result &&
                  typeof result.message === "string"
                  ? result.message
                  : "Unable to upload the pasted image.",
              );
            if (
              result === null ||
              typeof result !== "object" ||
              !("id" in result) ||
              typeof result.id !== "string"
            )
              throw new Error("The pasted image upload returned an invalid response.");
            const imageNode = view.state.schema.nodes.image;
            if (imageNode === undefined) throw new Error("The notes editor cannot insert images.");
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                imageNode.create({
                  alt: file.name || "Pasted image",
                  src: `/api/attachments/${result.id}?inline=1`,
                  title: file.name || "Pasted image",
                }),
              ),
            );
            window.dispatchEvent(
              new CustomEvent("opsweave:attachment-created", {
                detail: { entityId, entityType },
              }),
            );
            setMediaMessage("Image added to notes and Documents.");
          })
          .catch((error: unknown) => {
            setMediaMessage(
              error instanceof Error ? error.message : "Unable to upload the pasted image.",
            );
          });
        return true;
      },
    },
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image.configure({ allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      const document = updatedEditor.getJSON();
      setHeadings(headingsFrom(document));
      onChange(document);
    },
  });

  if (editor === null) return <p className="muted">Loading notes editor…</p>;

  const removeSlash = () => {
    const from = editor.state.selection.from;
    if (from > 1)
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .run();
  };
  const slashCommand = (command: () => void) => {
    removeSlash();
    command();
    setSlashOpen(false);
  };
  const addLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (href.trim().length === 0) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };
  const addEntityLink = (kind: "client" | "project" | "task") => {
    const name = window.prompt(`${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)} name`);
    if (name === null || name.trim().length === 0) return;
    const target = window.prompt(`${kind} link or ID (optional)`, "")?.trim() ?? "";
    const href = target.startsWith("http") ? target : `#${kind}:${target || name.trim()}`;
    editor
      .chain()
      .focus()
      .insertContent({
        marks: [{ attrs: { href }, type: "link" }],
        text: `${kind === "client" ? "Client" : kind === "project" ? "Project" : "Task"}: ${name.trim()}`,
        type: "text",
      })
      .run();
  };
  const commands: { action: () => void; label: string }[] = [
    { action: () => editor.chain().focus().setParagraph().run(), label: "Text block" },
    { action: () => editor.chain().focus().toggleItalic().run(), label: "Italics" },
    { action: () => editor.chain().focus().toggleBlockquote().run(), label: "Important note" },
    { action: () => editor.chain().focus().toggleCodeBlock().run(), label: "Code block" },
    { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), label: "Heading 1" },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), label: "Heading 2" },
    { action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), label: "Heading 3" },
    { action: addLink, label: "Link" },
    {
      action: () => {
        addEntityLink("task");
      },
      label: "Link task",
    },
    {
      action: () => {
        addEntityLink("project");
      },
      label: "Link project",
    },
    {
      action: () => {
        addEntityLink("client");
      },
      label: "Link client",
    },
    {
      action: () =>
        editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
      label: "Table",
    },
    {
      action: () => {
        setIndexOpen((open) => !open);
      },
      label: "Index",
    },
  ];

  return (
    <div className="rich-text-editor" ref={root}>
      <span className="field-label">{label}</span>
      <div aria-label={`${label} formatting`} className="rich-text-toolbar" role="toolbar">
        <button
          aria-pressed={editor.isActive("bold")}
          className="secondary compact"
          onClick={() => editor.chain().focus().toggleBold().run()}
          type="button"
        >
          Bold
        </button>
        <button
          aria-pressed={editor.isActive("italic")}
          className="secondary compact"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          Italic
        </button>
        <button
          aria-pressed={editor.isActive("bulletList")}
          className="secondary compact"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          type="button"
        >
          Bullets
        </button>
        <button
          aria-pressed={editor.isActive("orderedList")}
          className="secondary compact"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          type="button"
        >
          Numbered
        </button>
        <button
          aria-pressed={editor.isActive("taskList")}
          className="secondary compact"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          type="button"
        >
          Checklist
        </button>
        <button className="secondary compact" onClick={addLink} type="button">
          Link
        </button>
        <button
          aria-pressed={indexOpen}
          className="secondary compact"
          onClick={() => {
            setIndexOpen((open) => !open);
          }}
          type="button"
        >
          Index
        </button>
        <button
          className="secondary compact"
          disabled={!editor.isActive("table")}
          onClick={() => editor.chain().focus().addRowAfter().run()}
          type="button"
        >
          + Row
        </button>
        <button
          className="secondary compact"
          disabled={!editor.isActive("table")}
          onClick={() => editor.chain().focus().deleteRow().run()}
          type="button"
        >
          − Row
        </button>
        <button
          className="secondary compact"
          disabled={!editor.isActive("table")}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          type="button"
        >
          + Column
        </button>
        <button
          className="secondary compact"
          disabled={!editor.isActive("table")}
          onClick={() => editor.chain().focus().deleteColumn().run()}
          type="button"
        >
          − Column
        </button>
        <button
          className="secondary compact"
          disabled={!editor.isActive("table")}
          onClick={() => editor.chain().focus().deleteTable().run()}
          type="button"
        >
          Remove table
        </button>
        <button
          className="secondary compact"
          onClick={() => {
            setSlashOpen((current) => !current);
            editor.chain().focus().run();
          }}
          type="button"
        >
          / commands
        </button>
      </div>
      {indexOpen ? (
        <nav aria-label="Notes index" className="notes-index">
          <strong>Index</strong>
          {headings.length === 0 ? (
            <span className="muted">Add Heading 2 or Heading 3 sections to build the index.</span>
          ) : null}
          {headings.map((heading, index) => (
            <button
              className="secondary compact"
              key={`${heading.text}-${String(index)}`}
              onClick={() => {
                root.current
                  ?.querySelectorAll(".rich-text-content h2,.rich-text-content h3")
                  .item(index)
                  .scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              style={{ marginInlineStart: `${String((heading.level - 2) * 16)}px` }}
              type="button"
            >
              {heading.text}
            </button>
          ))}
        </nav>
      ) : null}
      <EditorContent editor={editor} />
      <span aria-live="polite" className="muted notes-media-message">
        {mediaMessage}
      </span>
      {slashOpen ? (
        <div className="slash-menu" role="menu" aria-label="Formatting commands">
          {commands.map((command) => (
            <button
              className="secondary"
              key={command.label}
              onClick={() => {
                slashCommand(command.action);
              }}
              role="menuitem"
              type="button"
            >
              {command.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
