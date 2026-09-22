import PDFDocument from "pdfkit";
import { storageGetSignedUrl, storagePut } from "./storage";

const ATU_LOGO_STORAGE_KEY = "ATU-Logo-Initial-English-RGB-Black_74c85345.png";
const FIOSRA_LOCKUP_STORAGE_KEY = "fiosra-lockup-source_8b49614c.png";

async function loadAtuLogo(): Promise<Buffer | null> {
  try {
    const signedUrl = await storageGetSignedUrl(ATU_LOGO_STORAGE_KEY);
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[PDF] ATU logo unavailable; continuing with text-only institutional branding", error);
    return null;
  }
}

async function loadFiosraLockup(): Promise<Buffer | null> {
  try {
    const signedUrl = await storageGetSignedUrl(FIOSRA_LOCKUP_STORAGE_KEY);
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[PDF] Fiosra lockup unavailable; continuing without product lockup", error);
    return null;
  }
}

export interface PdfSectionData {
  taskSequence: number;
  taskTitle: string;
  content: string;
}

export interface PdfArtefactData {
  filename: string;
  category: string;
  byteSize: number;
  description?: string | null;
  uploadedAt: string;
}

export interface SubmissionPdfPayload {
  submissionId: string;
  assignmentTitle: string;
  courseCode: string;
  courseTitle: string;
  institutionName: string;
  studentName: string;
  submittedAtIso: string;
  submissionTiming: "on_time" | "after_due";
  dueAtIso: string;
  dueTimeZone: string;
  documentHash: string;
  sections: PdfSectionData[];
  artefacts: PdfArtefactData[];
}

/**
 * Builds a professional academic submission PDF buffer using PDFKit.
 * Renders the authoritative assignment document, submission metadata, and accompanying artefacts manifest.
 */
export async function generateSubmissionPdfBuffer(payload: SubmissionPdfPayload): Promise<Buffer> {
  const [atuLogo, fiosraLockup] = await Promise.all([loadAtuLogo(), loadFiosraLockup()]);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 56, bottom: 48, left: 56, right: 56 },
        autoFirstPage: true,
        bufferPages: true,
        info: {
          Title: `${payload.courseCode} Submission - ${payload.studentName}`,
          Author: payload.studentName,
          Subject: payload.assignmentTitle,
          Keywords: "Fiosra, Academic Submission, Immutable Record",
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Institutional context is deliberately subordinate to the Fiosra record,
      // while making the ATU proxy institution immediately recognisable.
      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const headerTop = 52;
      doc.x = pageLeft;
      doc.y = headerTop;
      if (fiosraLockup) {
        doc.image(fiosraLockup, pageLeft, headerTop, { fit: [118, 32], valign: "center" });
      }
      if (atuLogo) {
        doc.image(atuLogo, pageRight - 86, headerTop, { fit: [86, 30], align: "right", valign: "center" });
      }
      // Keep both marks in a reserved band, with text below them so neither
      // image can overlap the academic record metadata.
      doc.x = pageLeft;
      doc.y = 86;
      doc.fontSize(7).fillColor("#7E7A75").font("Helvetica").text("ATLANTIC TECHNOLOGICAL UNIVERSITY · PROXY INSTITUTION", pageLeft, doc.y);
      doc.y = 98;
      doc.strokeColor("#1D5268").lineWidth(1.5).moveTo(pageLeft, 96).lineTo(pageRight, 96).stroke();
      doc.y = 106;
      doc.fontSize(10).fillColor("#5C5955").text(`${payload.courseCode} • ${payload.courseTitle}`.toUpperCase(), pageLeft, doc.y);
      doc.fontSize(9).fillColor("#7E7A75").text(payload.institutionName, pageLeft, doc.y);
      doc.x = pageLeft;
      doc.moveDown(0.8);

      // Title
      doc.fontSize(22).fillColor("#1B1A19").font("Helvetica-Bold").text(payload.assignmentTitle);
      doc.moveDown(0.5);

      // Metadata box
      const submittedDateStr = new Date(payload.submittedAtIso).toLocaleString("en-IE", {
        timeZone: payload.dueTimeZone || "Europe/Dublin",
        dateStyle: "full",
        timeStyle: "short",
      });

      const dueDateStr = new Date(payload.dueAtIso).toLocaleString("en-IE", {
        timeZone: payload.dueTimeZone || "Europe/Dublin",
        dateStyle: "full",
        timeStyle: "short",
      });

      doc.rect(56, doc.y, 483, 72).fillAndStroke("#F6F5F1", "#DDDCD5");
      const boxY = doc.y + 10;

      doc.fontSize(9).fillColor("#5C5955").font("Helvetica");
      doc.text(`Student:`, 68, boxY);
      doc.fillColor("#1B1A19").font("Helvetica-Bold").text(payload.studentName, 130, boxY);

      doc.fillColor("#5C5955").font("Helvetica").text(`Submitted:`, 68, boxY + 16);
      doc.fillColor("#1B1A19").text(`${submittedDateStr} (${payload.submissionTiming === "on_time" ? "On Time" : "After Due Date"})`, 130, boxY + 16);

      doc.fillColor("#5C5955").font("Helvetica").text(`Due Date:`, 68, boxY + 32);
      doc.fillColor("#1B1A19").text(dueDateStr, 130, boxY + 32);

      doc.fillColor("#5C5955").font("Helvetica").text(`Record Hash:`, 68, boxY + 48);
      doc.font("Courier").fontSize(8).fillColor("#3A4D8F").text(payload.documentHash, 130, boxY + 49);

      doc.y = boxY + 76;
      doc.moveDown(1);
      // Metadata labels use explicit x positions. Restore the document cursor
      // before rendering the assignment so all sections share the page margin.
      doc.x = pageLeft;

      // Render canonical sections
      payload.sections.forEach((sec, idx) => {
        if (idx > 0 && doc.y > 620) {
          doc.addPage();
        } else if (idx > 0) {
          doc.moveDown(1.5);
        }

        // Section header
        doc.fontSize(8).fillColor("#3A4D8F").font("Helvetica-Bold").text(`PART ${sec.taskSequence} OF ${payload.sections.length}`.toUpperCase());
        doc.fontSize(14).fillColor("#1B1A19").font("Helvetica-Bold").text(sec.taskTitle);
        doc.moveDown(0.4);

        // Section body text
        const cleanBody = (sec.content || "").trim();
        if (cleanBody.length > 0) {
          doc.fontSize(10).fillColor("#2B2927").font("Helvetica").text(cleanBody, {
            lineGap: 4,
            paragraphGap: 8,
            align: "justify",
          });
        } else {
          doc.fontSize(10).fillColor("#999590").font("Helvetica-Oblique").text("[No text recorded for this section at submission time.]");
        }
      });

      // Supporting Artefacts Section
      if (doc.y > 580) {
        doc.addPage();
      } else {
        doc.moveDown(1.5);
      }

      doc.fontSize(12).fillColor("#1B1A19").font("Helvetica-Bold").text("SUPPORTING SUBMISSION ARTEFACTS");
      doc.strokeColor("#DDDCD5").lineWidth(0.5).moveTo(56, doc.y + 4).lineTo(539, doc.y + 4).stroke();
      doc.moveDown(0.8);

      if (payload.artefacts.length === 0) {
        doc.fontSize(9.5).fillColor("#7E7A75").font("Helvetica-Oblique").text("No accompanying artefacts were attached to this submission snapshot.");
      } else {
        doc.fontSize(9.5).fillColor("#5C5955").font("Helvetica").text("The following companion artefacts were uploaded and form part of this submission record:");
        doc.moveDown(0.6);

        payload.artefacts.forEach((art, i) => {
          doc.fontSize(10).fillColor("#1B1A19").font("Helvetica-Bold").text(`${i + 1}. ${art.filename}`);
          doc.fontSize(8.5).fillColor("#5C5955").font("Helvetica").text(
            `Category: ${art.category.toUpperCase()} • Size: ${(art.byteSize / 1024).toFixed(1)} KB • Uploaded: ${new Date(art.uploadedAt).toLocaleString("en-IE", { timeZone: payload.dueTimeZone || "Europe/Dublin" })}`
          );
          if (art.description) {
            doc.fontSize(8.5).fillColor("#3A3734").font("Helvetica-Oblique").text(`Description: "${art.description}"`);
          }
          doc.moveDown(0.5);
        });

        doc.moveDown(0.5);
        doc.fontSize(8.5).fillColor("#7E7A75").font("Helvetica-Oblique").text("Please refer to the accompanying storage references to review complete multimedia and model files.");
      }

      // Page numbers footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Suppress automatic page addition when writing the footer
        const oldBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).fillColor("#999590").font("Helvetica").text(
          `Fiosra Academic Record • ATU Demonstration Environment • Submission ${payload.submissionId.slice(0, 18)} • Page ${i + 1} of ${range.count}`,
          56,
          doc.page.height - 35,
          { align: "center", width: 483, lineBreak: false, baseline: "bottom" }
        );
        doc.page.margins.bottom = oldBottom;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates submission PDF, uploads it via S3 storagePut, and records storage references.
 */
export async function createAndStoreSubmissionPdf(payload: SubmissionPdfPayload): Promise<{ key: string; url: string }> {
  const pdfBuffer = await generateSubmissionPdfBuffer(payload);
  const storageKey = `submissions/${payload.submissionId}/Fiosra_Submission_${payload.courseCode}_${payload.submissionId.slice(-8)}.pdf`;
  const result = await storagePut(storageKey, pdfBuffer, "application/pdf");
  return result;
}
