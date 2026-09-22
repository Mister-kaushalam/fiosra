import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Highlighter,
  Undo,
  Redo,
} from "lucide-react";
import { TiptapDocument, createDocumentFromPlainText } from "@/lib/richText";

export type EditorTextSelection = {
  text: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
};

interface RestrainedRichTextEditorProps {
  initialContent: string | TiptapDocument;
  onChange: (doc: any, plainText: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  placeholder?: string;
  showToolbar?: boolean;
  onEditorFocus?: () => void;
  onTextSelectionChange?: (selection: EditorTextSelection | null) => void;
  embedded?: boolean;
  /** Fits the editor into a parent flex pane and scrolls only its document body. */
  fillHeight?: boolean;
}

export function RestrainedRichTextEditor({
  initialContent,
  onChange,
  readOnly = false,
  minHeight = "240px",
  placeholder = "Write your analysis here...",
  showToolbar = true,
  onEditorFocus,
  onTextSelectionChange,
  embedded = false,
  fillHeight = false,
}: RestrainedRichTextEditorProps) {
  const contentToLoad = React.useMemo(() => {
    if (typeof initialContent === "string") {
      try {
        const parsed = JSON.parse(initialContent);
        if (parsed && typeof parsed === "object" && parsed.type === "doc") {
          return parsed;
        }
      } catch {
        // Plain text
      }
      return createDocumentFromPlainText(initialContent);
    }
    return initialContent;
  }, [initialContent]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        codeBlock: false,
        horizontalRule: false,
      }),
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content: contentToLoad,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const text = editor.getText();
      onChange(json, text);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none focus:ring-0 text-[var(--color-obsidian)] leading-relaxed min-h-full p-4 font-normal",
      },
    },
  });

  // Keep read-only sync
  useEffect(() => {
    if (editor && editor.isEditable === readOnly) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || !onTextSelectionChange || readOnly) return;

    const reportSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";

      if (!text || text.length < 3 || !selection?.rangeCount) {
        onTextSelectionChange(null);
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        onTextSelectionChange(null);
        return;
      }

      onTextSelectionChange({
        text,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right,
      });
    };

    editor.on("selectionUpdate", reportSelection);
    document.addEventListener("selectionchange", reportSelection);
    return () => {
      editor.off("selectionUpdate", reportSelection);
      document.removeEventListener("selectionchange", reportSelection);
    };
  }, [editor, onTextSelectionChange, readOnly]);

  if (!editor) {
    return (
      <div
        className="rounded-lg border border-[#DDDCD5] bg-[#FFFFFF] p-4 text-xs text-[var(--color-slate)] animate-pulse"
        style={{ minHeight }}
      >
        Loading editor...
      </div>
    );
  }

  return (
    <div
      className={embedded
        ? `bg-[#FFFFFF] overflow-hidden focus-within:border-[var(--color-horizon-blue)] transition-colors ${fillHeight ? "flex h-full min-h-0 flex-col" : ""}`
        : `rounded-lg border border-[#DDDCD5] bg-[#FFFFFF] overflow-hidden focus-within:border-[var(--color-horizon-blue)] transition-colors shadow-2xs ${fillHeight ? "flex h-full min-h-0 flex-col" : ""}`}
      onFocusCapture={onEditorFocus}
    >
      {/* Restrained Formatting Toolbar */}
      {!readOnly && showToolbar && (
        <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-[#FAF9F5] border-b border-[#DDDCD5] text-xs text-[var(--color-slate)]">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("heading", { level: 2 })
                ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold"
                : ""
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("heading", { level: 3 })
                ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold"
                : ""
            }`}
            title="Heading 3"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#DDDCD5] mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("bold") ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold" : ""
            }`}
            title="Bold (Cmd/Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("italic") ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold" : ""
            }`}
            title="Italic (Cmd/Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("highlight")
                ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold"
                : ""
            }`}
            title="Highlight"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#DDDCD5] mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("bulletList")
                ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold"
                : ""
            }`}
            title="Bullet list"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-[#EAE8E1] transition-colors ${
              editor.isActive("orderedList")
                ? "bg-[#E2E0D8] text-[var(--color-obsidian)] font-semibold"
                : ""
            }`}
            title="Numbered list"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#DDDCD5] mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded hover:bg-[#EAE8E1] disabled:opacity-40 transition-colors"
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded hover:bg-[#EAE8E1] disabled:opacity-40 transition-colors"
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Body */}
      <div
        style={fillHeight ? undefined : { minHeight }}
        className={`cursor-text bg-[#FFFFFF] ${embedded ? "px-0" : ""} ${fillHeight ? "min-h-0 flex-1 overflow-y-auto" : ""}`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
