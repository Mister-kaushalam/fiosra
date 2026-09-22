import { assignmentSubmissions } from "../drizzle/schema";
import { getDb } from "../server/db";

async function verifySubmissionPdfs() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const submissions = await db.select().from(assignmentSubmissions);
  const missing = submissions.filter((submission) => !submission.pdfUrl || !submission.pdfStorageKey);
  if (missing.length > 0) {
    throw new Error(`Missing PDF metadata for: ${missing.map((submission) => submission.id).join(", ")}`);
  }

  const previewOrigin = "https://3000-igonb0w8qphi6lxbzxlx1-3c61f939.us1.manus.computer";
  for (const submission of submissions) {
    const pdfUrl = new URL(submission.pdfUrl!, previewOrigin).toString();
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`PDF unavailable (${response.status}) for ${submission.id}: ${pdfUrl}`);
    }
    const header = (await response.arrayBuffer()).slice(0, 5);
    if (Buffer.from(header).toString("utf8") !== "%PDF-") {
      throw new Error(`PDF signature invalid for ${submission.id}`);
    }
  }

  console.log(`VERIFIED_SUBMISSION_PDFS=${submissions.length}`);
}

verifySubmissionPdfs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
