import React, { useState } from "react";
import { Paperclip, Upload, Trash2, FileText, Image, Presentation, Table, Video, Loader2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface SupportingArtefactsPanelProps {
  studentWorkId: string;
  readOnly?: boolean;
}

export function SupportingArtefactsPanel({
  studentWorkId,
  readOnly = false,
}: SupportingArtefactsPanelProps) {
  const utils = trpc.useUtils();
  const [isUploading, setIsUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: assembledData } = trpc.studentWork.getAssembled.useQuery({});
  const artefacts = assembledData?.artefacts ?? [];

  const addMutation = trpc.studentWork.addArtefact.useMutation({
    onSuccess: async () => {
      setIsUploading(false);
      setDescription("");
      setUploadError(null);
      await utils.studentWork.getAssembled.invalidate();
    },
    onError: (err) => {
      setIsUploading(false);
      setUploadError(`Upload could not be registered: ${err.message}`);
    },
  });

  const removeMutation = trpc.studentWork.removeArtefact.useMutation({
    onSuccess: async () => {
      await utils.studentWork.getAssembled.invalidate();
    },
    onError: (err) => {
      alert(`Could not remove artefact: ${err.message}`);
    },
  });

  const detectCategory = (filename: string, mime: string): "document" | "image" | "presentation" | "spreadsheet" | "video" => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (["mp4", "webm", "mov", "m4v"].includes(ext) || mime.startsWith("video/")) return "video";
    if (["jpg", "jpeg", "png", "webp", "svg"].includes(ext) || mime.startsWith("image/")) return "image";
    if (["ppt", "pptx", "key"].includes(ext) || mime.includes("presentation")) return "presentation";
    if (["xls", "xlsx", "csv", "numbers"].includes(ext) || mime.includes("sheet") || mime.includes("csv")) return "spreadsheet";
    return "document";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const category = detectCategory(file.name, file.type);
    const maxBytes = category === "video" ? 40 * 1024 * 1024 : 25 * 1024 * 1024;

    if (file.size > maxBytes) {
      setUploadError(`File exceeds maximum size for ${category} (${category === "video" ? "40MB" : "25MB"}).`);
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // File bytes travel only to the server-side storage route. Metadata and submission relationship
      // are then recorded through the typed tRPC procedure below.
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const uploadResponse = await fetch("/api/artefacts/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              mediaType: file.type || "application/octet-stream",
              category,
              contentBase64: reader.result,
              studentWorkId,
            }),
          });

          const uploadPayload = await uploadResponse.json();
          if (!uploadResponse.ok) {
            throw new Error(uploadPayload?.error || "Storage service rejected this file.");
          }

          await addMutation.mutateAsync({
            studentWorkId,
            filename: file.name,
            mediaType: file.type || "application/octet-stream",
            category,
            byteSize: uploadPayload.byteSize,
            storageKey: uploadPayload.key,
            storageUrl: uploadPayload.url,
            studentDescription: description.trim() || undefined,
          });
        } catch (innerErr: any) {
          setIsUploading(false);
          setUploadError(innerErr?.message ?? "Failed to save file reference.");
        }
      };
      reader.onerror = () => {
        setIsUploading(false);
        setUploadError("Could not read local file.");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploading(false);
      setUploadError(err?.message ?? "Upload failed.");
    } finally {
      e.target.value = "";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "image":
        return <Image className="w-4 h-4 text-[var(--color-horizon-blue)]" />;
      case "presentation":
        return <Presentation className="w-4 h-4 text-[var(--color-amber)]" />;
      case "spreadsheet":
        return <Table className="w-4 h-4 text-[var(--color-signal-green)]" />;
      case "video":
        return <Video className="w-4 h-4 text-[var(--color-deep-red)]" />;
      default:
        return <FileText className="w-4 h-4 text-[var(--color-slate)]" />;
    }
  };

  return (
    <div className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-5 sm:p-6 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD5] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-obsidian)] flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-[var(--color-horizon-blue)]" />
            <span>Supporting Submission Artefacts</span>
          </h3>
          <p className="text-xs text-[var(--color-slate)] mt-0.5">
            Attach companion materials (financial models, board decks, diagrams, or recorded briefings) that accompany your written submission.
          </p>
        </div>
        <span className="text-xs font-mono text-[var(--color-slate)] bg-[#FAF9F5] px-2.5 py-1 rounded border border-[#DDDCD5]">
          {artefacts.length} attached
        </span>
      </div>

      {/* Upload boundary disclaimer */}
      <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] text-[11px] text-[var(--color-slate)] leading-relaxed">
        <strong>Permitted formats:</strong> Documents, spreadsheets, presentations, images (max 25MB), or video briefings (max 40MB). Supporting artefacts form an immutable part of the final submission snapshot. They are not interpreted by the Development Trace.
      </div>

      {/* Upload Controls (only if not submitted) */}
      {!readOnly && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description (e.g. Sensitivity analysis spreadsheet, Board presentation slide deck)..."
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-[#DDDCD5] bg-[#FFFFFF] text-[var(--color-obsidian)] placeholder:text-[var(--color-slate-light)] focus:outline-none focus:ring-1 focus:ring-[var(--color-horizon-blue)]"
              disabled={isUploading}
            />

            <label
              className={`relative inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all shadow-xs ${
                isUploading
                  ? "bg-[#EAE8E1] text-[var(--color-slate)] cursor-not-allowed"
                  : "bg-[var(--color-horizon-blue)] text-white hover:opacity-95"
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Attaching...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Companion File</span>
                </>
              )}
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm"
                aria-label="Upload supporting submission artefact"
              />
            </label>
          </div>

          {uploadError && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-deep-red)] bg-[var(--color-deep-red-soft)] border border-[#F5CACA] p-2.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {/* List of Attached Artefacts */}
      {artefacts.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-slate)] border border-dashed border-[#DDDCD5] rounded-lg">
          No supporting artefacts attached yet.
        </div>
      ) : (
        <div className="divide-y divide-[#DDDCD5]/60 border border-[#DDDCD5] rounded-lg overflow-hidden bg-[#FAF9F5]">
          {artefacts.map((art: any) => (
            <div key={art.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-[#FFFFFF]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-[#FAF9F5] border border-[#DDDCD5] mt-0.5">
                  {getCategoryIcon(art.category)}
                </div>
                <div className="space-y-0.5">
                  <div className="font-medium text-[var(--color-obsidian)] flex items-center gap-2">
                    <span>{art.filename}</span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#FAF9F5] border border-[#DDDCD5] text-[var(--color-slate)]">
                      {art.category}
                    </span>
                  </div>
                  {art.studentDescription && (
                    <div className="text-[11px] text-[var(--color-slate)] italic">
                      "{art.studentDescription}"
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--color-slate-light)]">
                    {(art.byteSize / 1024).toFixed(1)} KB • Uploaded on{" "}
                    {new Date(art.uploadedAt).toLocaleString("en-IE", {
                      timeZone: "Europe/Dublin",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <a
                  href={art.storageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-[#DDDCD5] text-[var(--color-obsidian)] hover:bg-[#FAF9F5] transition-colors"
                >
                  View File
                </a>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate({ studentWorkId, artefactId: art.id })}
                    disabled={removeMutation.isPending}
                    className="p-1 text-[var(--color-slate)] hover:text-[var(--color-deep-red)] transition-colors"
                    title="Remove artefact"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
