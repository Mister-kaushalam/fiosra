import { eq } from "drizzle-orm";
import {
  assignmentSubmissions,
  assignments,
  courses,
  fiosraProfiles,
  supportingSubmissionArtefacts,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { createAndStoreSubmissionPdf, PdfSectionData } from "../server/pdfGenerator";

type ManifestSection = { taskSequence: number; taskTitle: string };

function createPdfSections(submission: typeof assignmentSubmissions.$inferSelect): PdfSectionData[] {
  const manifest = JSON.parse(submission.sectionManifestJson || "[]") as ManifestSection[];
  const plainTextParts = submission.plainText.split(/\n\n## /);
  return manifest.map((section, index) => ({
    taskSequence: section.taskSequence,
    taskTitle: section.taskTitle,
    content:
      index === 0
        ? plainTextParts[index]?.replace(/^## [^\n]+\n\n/, "") ?? ""
        : plainTextParts[index]?.replace(/^[^\n]+\n\n/, "") ?? "",
  }));
}

async function repairSubmissionPdfs() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const submissions = await db.select().from(assignmentSubmissions);
  let repaired = 0;

  for (const submission of submissions) {
    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1);
    const [course] = assignment
      ? await db.select().from(courses).where(eq(courses.id, assignment.courseId)).limit(1)
      : [];
    const [student] = await db
      .select()
      .from(fiosraProfiles)
      .where(eq(fiosraProfiles.id, submission.studentProfileId))
      .limit(1);
    const artefacts = await db
      .select()
      .from(supportingSubmissionArtefacts)
      .where(eq(supportingSubmissionArtefacts.submissionId, submission.id));

    if (!assignment || !student) {
      throw new Error(`Cannot generate PDF for ${submission.id}: missing assignment or student context.`);
    }

    const pdf = await createAndStoreSubmissionPdf({
      submissionId: submission.id,
      assignmentTitle: assignment.title,
      courseCode: course?.code ?? "SDM401",
      courseTitle: course?.title ?? "Strategic Decision-Making in Organisations",
      institutionName: course?.institutionName ?? "Department of Management & Organisational Studies",
      studentName: student.displayName,
      submittedAtIso: submission.submittedAt.toISOString(),
      submissionTiming: submission.submissionTiming,
      dueAtIso: submission.dueAtAtSubmission.toISOString(),
      dueTimeZone: submission.dueTimeZoneAtSubmission,
      documentHash: submission.documentHash,
      sections: createPdfSections(submission),
      artefacts: artefacts.map((artefact) => ({
        filename: artefact.filename,
        category: artefact.category,
        byteSize: artefact.byteSize,
        description: artefact.studentDescription,
        uploadedAt: artefact.uploadedAt.toISOString(),
      })),
    });

    await db
      .update(assignmentSubmissions)
      .set({
        pdfStorageKey: pdf.key,
        pdfUrl: pdf.url,
        pdfGeneratedAt: new Date(),
      })
      .where(eq(assignmentSubmissions.id, submission.id));
    repaired += 1;
    console.log(`Repaired ${submission.id}`);
  }

  console.log(`REPAIRED_SUBMISSION_PDFS=${repaired}`);
}

repairSubmissionPdfs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
