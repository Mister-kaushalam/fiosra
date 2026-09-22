export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TiptapDocument {
  type: "doc";
  content: TiptapNode[];
}

export function createDocumentFromPlainText(text: string): TiptapDocument {
  const clean = (text || "").trim();
  if (!clean) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return {
    type: "doc",
    content: clean.split(/\n\s*\n/).map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph.trim() }],
    })),
  };
}
