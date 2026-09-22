import { createHash } from "crypto";

export const CANONICAL_DOCUMENT_FORMAT_VERSION = "tiptap_json_v1";

export interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  text?: string;
}

export interface TiptapDocument {
  type: "doc";
  content: TiptapNode[];
}

/**
 * Normalises an author-supplied string into a valid initial Tiptap document.
 */
export function createDocumentFromPlainText(text: string): TiptapDocument {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
  }

  const paragraphs = clean.split(/\n\s*\n/);
  const nodes: TiptapNode[] = paragraphs.map((para) => ({
    type: "paragraph",
    content: [{ type: "text", text: para.trim() }],
  }));

  return {
    type: "doc",
    content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
  };
}

/**
 * Extracts normalized plain text from a Tiptap JSON document tree.
 * Used for word counts, previews, and structural semantic comparison.
 */
export function extractPlainTextFromDocument(doc: any): string {
  if (!doc || typeof doc !== "object") return "";

  if (typeof doc.text === "string") {
    return doc.text;
  }

  if (Array.isArray(doc.content)) {
    const pieces: string[] = doc.content
      .map((child: any) => extractPlainTextFromDocument(child))
      .filter((s: string) => s.length > 0);

    // Block-level separators
    if (["doc", "bulletList", "orderedList"].includes(doc.type)) {
      return pieces.join("\n\n").trim();
    }
    if (["paragraph", "heading", "listItem", "blockquote"].includes(doc.type)) {
      return pieces.join("").trim();
    }
    return pieces.join(" ").trim();
  }

  return "";
}

export function hashString(value: string): string {
  return createHash("sha256").update((value || "").trim()).digest("hex");
}

export function hashDocument(doc: any): string {
  return createHash("sha256").update(JSON.stringify(doc || {})).digest("hex");
}
