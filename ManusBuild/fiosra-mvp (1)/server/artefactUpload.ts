import type { Express } from "express";
import { storagePut } from "./storage";

const MAX_GENERAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_FILE_BYTES = 40 * 1024 * 1024;

const SUPPORTED_CATEGORIES = new Set(["document", "image", "presentation", "spreadsheet", "video"]);
const SUPPORTED_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/csv",
  "image/",
  "video/",
];

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "supporting-artefact";
}

/**
 * Handles binary storage for the deliberately narrow supporting-submission artefact workflow.
 * Metadata and submission relationship remain owned by the corresponding tRPC mutation.
 */
export function registerArtefactUploadRoute(app: Express) {
  app.post("/api/artefacts/upload", async (req, res) => {
    try {
      const { filename, mediaType, category, contentBase64, studentWorkId } = req.body ?? {};

      if (
        typeof filename !== "string" ||
        typeof mediaType !== "string" ||
        typeof category !== "string" ||
        typeof contentBase64 !== "string" ||
        typeof studentWorkId !== "string"
      ) {
        return res.status(400).json({ error: "Incomplete artefact upload request." });
      }

      if (!SUPPORTED_CATEGORIES.has(category)) {
        return res.status(400).json({ error: "This file category is not supported for submission artefacts." });
      }

      if (!SUPPORTED_MIME_PREFIXES.some((prefix) => mediaType === prefix || mediaType.startsWith(prefix))) {
        return res.status(400).json({ error: "This file type is not approved for supporting artefacts." });
      }

      const rawBase64 = contentBase64.includes(",") ? contentBase64.split(",", 2)[1] : contentBase64;
      const fileBuffer = Buffer.from(rawBase64, "base64");

      if (fileBuffer.length === 0) {
        return res.status(400).json({ error: "The selected file is empty." });
      }

      const maxBytes = category === "video" ? MAX_VIDEO_FILE_BYTES : MAX_GENERAL_FILE_BYTES;
      if (fileBuffer.length > maxBytes) {
        return res.status(413).json({
          error: `This ${category} exceeds the maximum permitted size of ${Math.floor(maxBytes / (1024 * 1024))}MB.`,
        });
      }

      const storageKey = `supporting-artefacts/${studentWorkId}/${Date.now()}_${safeFilename(filename)}`;
      const stored = await storagePut(storageKey, fileBuffer, mediaType || "application/octet-stream");

      return res.status(201).json({
        key: stored.key,
        url: stored.url,
        byteSize: fileBuffer.length,
      });
    } catch (error) {
      console.error("[Artefact Upload] Unable to store supporting artefact:", error);
      return res.status(500).json({ error: "Supporting artefact upload failed." });
    }
  });
}
