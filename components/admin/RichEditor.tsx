"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";

/** tiptap-markdown doesn't augment TipTap's core Storage type, so this cast documents the shape rather than sprinkling `as any` at every call site. */
const getMarkdown = (editor: Editor) => (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();

/**
 * A genuine WYSIWYG editor — bold text looks bold, a heading looks like a
 * heading, while typing, not `**bold**`/`## Heading` sitting there as raw
 * characters. The earlier version was a plain <textarea> with buttons that
 * inserted Markdown syntax at the cursor; the raw syntax staying visible was
 * exactly the shortcoming this replaces.
 *
 * Blog content is still STORED and PUBLICLY RENDERED as Markdown — nothing
 * about the database column, the save API, or the public /blog page's
 * rendering pipeline changes. tiptap-markdown is the bridge: it parses
 * Markdown into TipTap's rich document on load (`setContent`) and serializes
 * the rich document back to Markdown on every change
 * (`storage.markdown.getMarkdown()`) — the editor's internal representation
 * is rich nodes/marks, but what leaves this component and reaches the
 * database is the same Markdown string as before.
 */

const TOOLBAR: { id: string; label: string; title: string; isActive: (e: Editor) => boolean; run: (e: Editor) => void }[] = [
  { id: "bold", label: "B", title: "Bold", isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { id: "italic", label: "I", title: "Italic", isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { id: "h2", label: "H2", title: "Heading", isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", label: "H3", title: "Subheading", isActive: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "quote", label: "❝", title: "Quote", isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "ul", label: "•", title: "Bullet list", isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ol", label: "1.", title: "Numbered list", isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "code", label: "</>", title: "Inline code", isActive: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
  { id: "hr", label: "―", title: "Divider", isActive: () => false, run: (e) => e.chain().focus().setHorizontalRule().run() },
];

export interface RichEditorHandle {
  getSelectionText: () => string;
  replaceSelection: (markdown: string) => void;
  replaceAll: (markdown: string) => void;
}

export default function RichEditor({
  value,
  onChange,
  onOpenAssist,
  handleRef,
}: {
  value: string;
  onChange: (markdown: string) => void;
  onOpenAssist: () => void;
  /** exposes imperative selection/replace actions to the parent, for the Assistant flow */
  handleRef: React.MutableRefObject<RichEditorHandle | null>;
}) {
  // guards the setContent-on-external-change effect below from firing on our
  // own onUpdate-triggered onChange, which would otherwise reset the cursor
  // to the start of the document on every keystroke
  const lastEmitted = useRef(value);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  async function insertImageAtCursor(editor: Editor, file: File) {
    setImageUploading(true);
    try {
      const form = new FormData();
      form.set("image", file);
      const res = await fetch("/api/admin/blog/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        window.alert(json.message ?? "Could not upload the image.");
        return;
      }
      editor.chain().focus().setImage({ src: json.url }).run();
    } catch {
      window.alert("Connection lost. Try again.");
    } finally {
      setImageUploading(false);
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: "-" }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const markdown = getMarkdown(editor);
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: "cfai-md min-h-[280px] px-4 py-3 outline-none",
      },
    },
  });

  // if the parent's value changes from something OTHER than our own last
  // emit (e.g. the Assistant replaced the whole post, or a different post
  // loaded), sync the editor to match
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value);
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    handleRef.current = {
      getSelectionText: () => {
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, " ");
      },
      replaceSelection: (markdown: string) => {
        const { from, to } = editor.state.selection;
        editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, markdown).run();
      },
      replaceAll: (markdown: string) => {
        editor.commands.setContent(markdown);
        lastEmitted.current = getMarkdown(editor);
        onChange(lastEmitted.current);
      },
    };
  }, [editor, handleRef, onChange]);

  if (!editor) {
    return <div className="min-h-[280px] rounded-b-lg border border-line bg-canvas px-4 py-3 text-ink-faint">Loading editor…</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-line bg-canvas px-2 py-1.5">
        {TOOLBAR.map((btn) => (
          <button
            key={btn.id}
            type="button"
            title={btn.title}
            onClick={() => btn.run(editor)}
            className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[12.5px] font-semibold ${
              btn.isActive(editor) ? "bg-brand-tint text-brand-deep" : "text-ink-mute hover:bg-surface hover:text-ink"
            }`}
          >
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          title="Link"
          onClick={() => {
            const url = window.prompt("Link URL", editor.getAttributes("link").href ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[13px] ${
            editor.isActive("link") ? "bg-brand-tint text-brand-deep" : "text-ink-mute hover:bg-surface hover:text-ink"
          }`}
        >
          🔗
        </button>
        <button
          type="button"
          title="Image"
          disabled={imageUploading}
          onClick={() => imageInputRef.current?.click()}
          className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[13px] text-ink-mute hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          {imageUploading ? "…" : "🖼️"}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImageAtCursor(editor, file);
            e.target.value = "";
          }}
        />
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={onOpenAssist}
          className="flex h-7 items-center gap-1 rounded px-2 text-[12.5px] font-semibold text-brand hover:bg-brand-tint"
        >
          ✨ Assistant
        </button>
      </div>
      <div className="rounded-b-lg border border-line bg-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
