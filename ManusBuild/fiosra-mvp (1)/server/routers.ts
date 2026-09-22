import {
  assertEducatorAccess,
  getEducatorAcademicReview,
  getEducatorAssignmentCohort,
  getEducatorCourseAttention,
  getEducatorMomentEvidence,
  getEducatorStudentCourseHistory,
  getEducatorStudentContext,
  recordEducatorAttentionAction,
} from "./educatorServices";
import {
  createLmsLaunch,
  getLmsAssignmentDetail,
  getLmsCourseHome,
  getLmsEducatorAssignmentContext,
  getLmsLaunchContext,
} from "./lmsServices";

import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  addSupportingSubmissionArtefact,
  getAssembledAssignment,
  getAssembledAssignmentPreview,
  getAssignmentContext,
  getFoundationBootstrap,
  getStudentCohort,
  getOrCreateStudentWork,
  getStudentWorkSectionPreviousState,
  removeSupportingSubmissionArtefact,
  saveStudentWorkSection,
  submitStudentAssignment,
  getDb,
} from "./db";
import { and, desc, eq } from "drizzle-orm";
import {
  assignmentAiPolicyContexts,
  developmentGraphNodes,
  developmentGraphRelationships,
  developmentMoments,
  developmentProfiles,
  developmentTraces,
  inquiryNotes,
  inquiryThreads,
  studentWork,
} from "../drizzle/schema";
import {
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
  captureEvidenceIfEligible,
  ensureStage3SeedData,
  interpretPendingEvidence,
  processAiSupportRequest,
} from "./stage3Services";
import {
  resolveAiPolicyContextForAssignment,
  resolveDevelopmentProfileForAssignment,
} from "./assignmentContextResolvers";
import { resolveAssignmentId } from "./assignmentConstants";
import {
  addInquiryNote,
  createInquiryThread,
  getInquiryStudioOverview,
  getInquiryThreadDetail,
  linkInquiryThreadToAssignment,
  postInquiryMessage,
  removeInquiryNote,
  retryInquiryResponse,
} from "./inquiryServices";
import {
  getEducatorAssignmentAuthoringOptions,
  getEducatorAuthoredAssignment,
  saveEducatorAuthoredAssignment,
  updateEducatorAssignmentPolicyLevel,
} from "./educatorAuthoringServices";
import {
  getEducatorNotifications,
  getStudentNotifications,
  markStudentNotificationRead,
  postEducatorNotification,
  withdrawEducatorNotification,
} from "./notificationServices";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  foundation: router({
    getStudentCohort: publicProcedure.query(async () => {
      return await getStudentCohort();
    }),
    getBootstrap: publicProcedure
      .input(
        z.object({
          role: z.enum(["student", "educator"]).default("student"),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        return await getFoundationBootstrap(input.role, input.studentProfileId);
      }),
    getStudentNotifications: publicProcedure
      .input(
        z.object({
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
          unreadOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(100).default(30),
        })
      )
      .query(async ({ input }) => {
        return await getStudentNotifications(input.studentProfileId, {
          unreadOnly: input.unreadOnly,
          limit: input.limit,
        });
      }),
    markStudentNotificationRead: publicProcedure
      .input(
        z.object({
          notificationId: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await markStudentNotificationRead(input.notificationId, input.studentProfileId);
      }),
  }),
  inquiry: router({
    getOverview: publicProcedure
      .input(
        z
          .object({
            studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await getInquiryStudioOverview(input?.studentProfileId);
      }),

    getThread: publicProcedure
      .input(
        z.object({
          threadId: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        return await getInquiryThreadDetail(input.threadId, input.studentProfileId);
      }),

    createThread: publicProcedure
      .input(
        z.object({
          scope: z.enum(["course", "assignment"]).default("course"),
          assignmentId: z.string().optional(),
          initialQuestion: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await createInquiryThread(input);
      }),

    linkToAssignment: publicProcedure
      .input(
        z.object({
          threadId: z.string(),
          assignmentId: z.string().optional(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await linkInquiryThreadToAssignment(input);
      }),

    postMessage: publicProcedure
      .input(
        z.object({
          threadId: z.string(),
          studentPrompt: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await postInquiryMessage(input);
      }),

    retryResponse: publicProcedure
      .input(
        z.object({
          threadId: z.string(),
          unavailableMessageId: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await retryInquiryResponse(input);
      }),

    addNote: publicProcedure
      .input(
        z.object({
          threadId: z.string(),
          noteType: z.enum(["question", "tension", "reflection"]).default("question"),
          content: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await addInquiryNote(input);
      }),

    removeNote: publicProcedure
      .input(
        z.object({
          noteId: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await removeInquiryNote(input.noteId, input.studentProfileId);
      }),
  }),
  assignment: router({
    getContext: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
        })
      )
      .query(async ({ input }) => {
        return await getAssignmentContext(input.assignmentId);
      }),
  }),
  studentWork: router({
    getWorkspace: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        const workspace = await getOrCreateStudentWork(input.assignmentId, input.studentProfileId);
        const policy = await resolveAiPolicyContextForAssignment(workspace.assignment.id);
        return {
          ...workspace,
          policy: {
            level: policy.policyLevel,
            label: policy.policyLevelDefinition.label,
            shortLabel: policy.policyLevelDefinition.shortLabel,
            studentResponsibilityText: policy.studentResponsibilityText,
            permittedSupportPatterns: policy.permittedSupportPatterns,
            restrictedCapabilities: policy.restrictedCapabilities,
            responseBoundaryNote: policy.policyLevelDefinition.responseBoundaryNote,
          },
        };
      }),

    getAssembled: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        return await getAssembledAssignment(input.assignmentId, input.studentProfileId);
      }),

    getAssembledPreview: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        return await getAssembledAssignmentPreview(input.assignmentId, input.studentProfileId);
      }),

    saveSection: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string(),
          assignmentTaskId: z.string(),
          content: z.union([z.string(), z.record(z.string(), z.any())]),
          editorSurface: z.enum(["structured_workspace", "assembled_assignment"]).default("structured_workspace"),
          inquiryThreadId: z.string().optional(),
          inquiryNoteId: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.inquiryNoteId) {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");

          const [work] = await db
            .select()
            .from(studentWork)
            .where(eq(studentWork.id, input.studentWorkId))
            .limit(1);
          const [note] = await db
            .select()
            .from(inquiryNotes)
            .where(eq(inquiryNotes.id, input.inquiryNoteId))
            .limit(1);

          if (!work || !note || note.studentProfileId !== work.studentProfileId) {
            throw new Error("This inquiry note is not available for this workspace.");
          }

          const [thread] = await db
            .select()
            .from(inquiryThreads)
            .where(eq(inquiryThreads.id, note.threadId))
            .limit(1);

          if (
            !thread ||
            thread.scope !== "assignment" ||
            thread.assignmentId !== work.assignmentId ||
            thread.studentProfileId !== work.studentProfileId
          ) {
            throw new Error("Only a student-linked assignment inquiry note can be added to this workspace.");
          }
        }

        const previousState = await getStudentWorkSectionPreviousState(
          input.studentWorkId,
          input.assignmentTaskId
        );

        const saveResult = await saveStudentWorkSection(
          input.studentWorkId,
          input.assignmentTaskId,
          input.content
        );

        // Post-save structural eligibility evaluation for semantic text changes only
        // Formatting-only changes (different document hash, same semantic text) do not produce evidence.
        const prevTextTrimmed = previousState.content.trim();
        const currTextTrimmed = saveResult.content.trim();

        // A promoted inquiry note becomes student work only when the student
        // edits it further. The import action itself never generates evidence.
        if (prevTextTrimmed !== currTextTrimmed && !input.inquiryNoteId) {
          try {
            const sectionId = `section_${input.studentWorkId}_${input.assignmentTaskId}`;
            await captureEvidenceIfEligible(
              input.studentWorkId,
              sectionId,
              input.assignmentTaskId,
              previousState.content,
              saveResult.content,
              {
                previousDocumentJson: previousState.contentDocumentJson,
                currentDocumentJson: saveResult.contentDocumentJson,
                editorSurface: input.editorSurface,
                inquiryThreadId: input.inquiryThreadId,
              }
            );
          } catch (evidenceError) {
            // Guard: evidence evaluation failure must NEVER prevent student work from persisting
            console.warn("[Stage 3] Evidence evaluation failed silently:", evidenceError);
          }
        }

        return saveResult;
      }),

    submit: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string(),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .mutation(async ({ input }) => {
        return await submitStudentAssignment(input.studentWorkId, input.studentProfileId);
      }),

    addArtefact: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string(),
          filename: z.string().min(1).max(255),
          mediaType: z.string(),
          category: z.enum(["document", "image", "presentation", "spreadsheet", "video"]),
          byteSize: z.number().positive(),
          storageKey: z.string(),
          storageUrl: z.string(),
          studentDescription: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await addSupportingSubmissionArtefact(input);
      }),

    removeArtefact: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string(),
          artefactId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        return await removeSupportingSubmissionArtefact(input.artefactId, input.studentWorkId);
      }),
  }),
  developmentTrace: router({
    getStatus: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string().optional(),
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
        })
      )
      .query(async ({ input }) => {
        await ensureStage3SeedData();
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const targetAssignmentId =
          input.assignmentId === "atlantic-edge-foods"
            ? CANONICAL_ASSIGNMENT_ID
            : input.assignmentId;

        const [trace] = await db
          .select()
          .from(developmentTraces)
          .where(
            and(
              eq(developmentTraces.assignmentId, targetAssignmentId),
              eq(developmentTraces.developmentProfileId, CANONICAL_DEVELOPMENT_PROFILE_ID)
            )
          )
          .limit(1);

        if (!trace) {
          return { exists: false, state: "active" as const, hasMoments: false, momentCount: 0 };
        }

        const moments = await db
          .select()
          .from(developmentMoments)
          .where(and(eq(developmentMoments.traceId, trace.id), eq(developmentMoments.state, "current")));

        return {
          exists: true,
          traceId: trace.id,
          state: trace.state,
          hasMoments: moments.length > 0,
          momentCount: moments.length,
        };
      }),

    getTraceForStudent: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
          recordView: z.boolean().default(true),
        })
      )
      .query(async ({ input }) => {
        await ensureStage3SeedData();
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const targetAssignmentId = resolveAssignmentId(input.assignmentId);
        const resolvedProfile = await resolveDevelopmentProfileForAssignment(targetAssignmentId);

        const [trace] = await db
          .select()
          .from(developmentTraces)
          .where(
            and(
              eq(developmentTraces.assignmentId, targetAssignmentId),
              eq(developmentTraces.studentProfileId, input.studentProfileId),
              eq(developmentTraces.developmentProfileId, resolvedProfile.profileId)
            )
          )
          .limit(1);

        if (!trace) {
          throw new Error("Development Trace record not found for student.");
        }

        // If requested, update interaction metadata WITHOUT changing trace lifecycle state
        if (input.recordView) {
          const updateSet: Record<string, unknown> = {
            lastReviewedAt: new Date(),
          };
          if (!trace.firstViewedAt) {
            updateSet.firstViewedAt = new Date();
          }
          await db.update(developmentTraces).set(updateSet).where(eq(developmentTraces.id, trace.id));
        }

        const moments = await db
          .select()
          .from(developmentMoments)
          .where(and(eq(developmentMoments.traceId, trace.id), eq(developmentMoments.state, "current")))
          .orderBy(desc(developmentMoments.sequence));

        const [graphNodes, graphRelationships] = await Promise.all([
          db
            .select()
            .from(developmentGraphNodes)
            .where(and(eq(developmentGraphNodes.traceId, trace.id), eq(developmentGraphNodes.state, "qualified"))),
          db
            .select()
            .from(developmentGraphRelationships)
            .where(and(eq(developmentGraphRelationships.traceId, trace.id), eq(developmentGraphRelationships.state, "qualified"))),
        ]);

        const policy = await resolveAiPolicyContextForAssignment(targetAssignmentId);

        return {
          trace: {
            id: trace.id,
            state: trace.state,
            modelVersion: trace.currentInterpretationModelVersion,
            firstViewedAt: trace.firstViewedAt,
            lastReviewedAt: trace.lastReviewedAt,
            coherentAt: trace.coherentAt,
            updatedAt: trace.updatedAt,
          },
          profile: {
            id: resolvedProfile.profileId,
            name: resolvedProfile.name,
            description: resolvedProfile.description,
            dimensions: resolvedProfile.dimensions,
          },
          moments: moments.map((m) => ({
            id: m.id,
            sequence: m.sequence,
            dimensionId: m.dimensionId,
            title: m.title,
            whatChanged: m.whatChanged,
            contextualSignificance: m.contextualSignificance,
            sourceLabel: m.sourceLabel,
            assignmentTaskId: m.assignmentTaskId,
            createdAt: m.createdAt,
          })),
          graph: {
            nodes: graphNodes.map((node) => ({
              id: node.id,
              nodeType: node.nodeType,
              content: node.content,
              learningObjectiveCodes: JSON.parse(node.learningObjectiveCodesJson || "[]"),
              dimensionId: node.dimensionId,
              sourceEvidenceIds: JSON.parse(node.sourceEvidenceIdsJson || "[]"),
              sourceAnchors: JSON.parse(node.sourceAnchorsJson || "[]"),
              limitations: node.limitations,
              state: node.state,
            })),
            relationships: graphRelationships.map((relationship) => ({
              id: relationship.id,
              fromNodeId: relationship.fromNodeId,
              toNodeId: relationship.toNodeId,
              relationshipType: relationship.relationshipType,
              learningObjectiveCodes: JSON.parse(relationship.learningObjectiveCodesJson || "[]"),
              sourceEvidenceIds: JSON.parse(relationship.sourceEvidenceIdsJson || "[]"),
              sourceAnchors: JSON.parse(relationship.sourceAnchorsJson || "[]"),
              rationale: relationship.rationale,
              limitations: relationship.limitations,
              state: relationship.state,
            })),
          },
          policy: {
            policySource: policy?.policySource,
            studentResponsibilityText: policy?.studentResponsibilityText,
          },
        };
      }),

    considerRecentWork: publicProcedure
      .input(
        z.object({
          traceId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        return await interpretPendingEvidence(input.traceId);
      }),
  }),
  educator: router({
    postNotification: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string().optional(),
          educatorProfileId: z.string().optional(),
          sourceType: z.enum(["attention_signal", "development_moment", "educator_intervention", "course_announcement"]),
          sourceId: z.string().optional(),
          sourceSnapshot: z.record(z.string(), z.any()).optional(),
          title: z.string().trim().min(1).max(255),
          body: z.string().trim().min(1).max(4000),
          audienceType: z.enum(["individual", "signal_students", "course_cohort"]),
          recipientStudentProfileId: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await postEducatorNotification(input);
      }),
    getNotifications: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorNotifications(input.workspaceId, input.educatorProfileId);
      }),
    withdrawNotification: publicProcedure
      .input(
        z.object({
          notificationId: z.string(),
          workspaceId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await withdrawEducatorNotification(input.notificationId, input.workspaceId, input.educatorProfileId);
      }),
    getAuthoringOptions: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorAssignmentAuthoringOptions(input.workspaceId, input.educatorProfileId);
      }),

    getAuthoredAssignment: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorAuthoredAssignment(
          input.workspaceId,
          input.assignmentId,
          input.educatorProfileId
        );
      }),

    saveAuthoredAssignment: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          workspaceId: z.string(),
          educatorProfileId: z.string().optional(),
          title: z.string().max(255),
          brief: z.string().max(20000),
          dueAt: z.string().datetime().nullable().optional(),
          dueTimeZone: z.string().min(1).max(64),
          weighting: z.string().max(32).nullable().optional(),
          wordLimit: z.number().int().positive().max(50000).nullable().optional(),
          learningOutcomeCodes: z.array(z.string().min(1)).min(1),
          activityGuidance: z.string().max(5000),
          developmentProfileId: z.string().min(1),
          policyLevel: z.enum(["level_1", "level_2", "level_3", "level_4", "level_5"]),
          tasks: z.array(z.object({
            title: z.string().max(255),
            prompt: z.string().max(10000),
            guidance: z.string().max(5000),
          })).min(1).max(8),
          rubric: z.array(z.object({
            title: z.string().max(255),
            weight: z.string().max(32),
            guidance: z.string().max(5000),
            levelDescriptors: z.array(z.object({
              label: z.string().max(120),
              description: z.string().max(5000),
            })).max(6).optional(),
          })).min(1).max(10),
          materials: z.array(z.object({
            title: z.string().max(255),
            summary: z.string().max(2000),
            content: z.string().max(30000),
            materialType: z.enum(["learning", "decision_context"]),
          })).max(8),
          publish: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        return await saveEducatorAuthoredAssignment(input);
      }),

    updateAssignmentPolicyLevel: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string(),
          educatorProfileId: z.string().optional(),
          policyLevel: z.enum(["level_1", "level_2", "level_3", "level_4", "level_5"]),
        })
      )
      .mutation(async ({ input }) => {
        return await updateEducatorAssignmentPolicyLevel(input);
      }),

    getCourseAttention: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorCourseAttention(input.workspaceId, input.educatorProfileId);
      }),

    getAssignmentCohort: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorAssignmentCohort(
          input.workspaceId,
          input.assignmentId,
          input.educatorProfileId
        );
      }),

    getStudentContext: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string(),
          studentProfileId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorStudentContext(
          input.workspaceId,
          input.assignmentId,
          input.studentProfileId,
          input.educatorProfileId
        );
      }),

    getStudentCourseHistory: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          studentProfileId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorStudentCourseHistory(
          input.workspaceId,
          input.studentProfileId,
          input.educatorProfileId
        );
      }),

    getMomentEvidence: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          momentId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorMomentEvidence(
          input.workspaceId,
          input.momentId,
          input.educatorProfileId
        );
      }),

    getAcademicReview: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string(),
          studentProfileId: z.string(),
          educatorProfileId: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEducatorAcademicReview(
          input.workspaceId,
          input.assignmentId,
          input.studentProfileId,
          input.educatorProfileId
        );
      }),

    recordAttentionAction: publicProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          assignmentId: z.string().optional(),
          studentProfileId: z.string().optional(),
          educatorProfileId: z.string().optional(),
          sourceType: z.enum(["attention_signal", "development_moment", "academic_review"]),
          sourceId: z.string(),
          sourceSnapshot: z.record(z.string(), z.any()),
          disposition: z.enum(["observe", "no_action", "individual_support", "cohort_response"]),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await recordEducatorAttentionAction(input);
      }),
  }),
  aiSupport: router({
    getContext: publicProcedure
      .input(
        z.object({
          assignmentId: z.string().default(CANONICAL_ASSIGNMENT_ID),
        })
      )
      .query(async ({ input }) => {
        await ensureStage3SeedData();
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const targetAssignmentId = resolveAssignmentId(input.assignmentId);
        const policy = await resolveAiPolicyContextForAssignment(targetAssignmentId);

        return {
          policyLevel: policy.policyLevel,
          policyLevelLabel: policy.policyLevelDefinition.label,
          policyLevelDescription: policy.policyLevelDefinition.educatorDescription,
          policySource: policy.policySource,
          studentResponsibilityText: policy.studentResponsibilityText,
          permittedSupportPatterns: policy.permittedSupportPatterns,
          restrictedCapabilities: policy.restrictedCapabilities,
        };
      }),

    requestSupport: publicProcedure
      .input(
        z.object({
          studentWorkId: z.string(),
          taskId: z.string(),
          studentPrompt: z.string().min(2).max(1000),
          supportPattern: z.string().optional(),
          selectedPassage: z.string().min(3).max(2000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await processAiSupportRequest(
          input.studentWorkId,
          input.taskId,
          input.studentPrompt,
          input.supportPattern,
          input.selectedPassage
        );
      }),
  }),
  lms: router({
    getCourseHome: publicProcedure
      .input(
        z.object({
          courseCode: z.string().default("SDM401"),
        })
      )
      .query(async ({ input }) => {
        return await getLmsCourseHome(input.courseCode);
      }),

    getAssignmentDetail: publicProcedure
      .input(
        z.object({
          courseCode: z.string().default("SDM401"),
          assignmentIdentifier: z.string().default("atlantic-edge-foods"),
          studentProfileId: z.string().default(CANONICAL_STUDENT_PROFILE_ID),
        })
      )
      .query(async ({ input }) => {
        return await getLmsAssignmentDetail(
          input.courseCode,
          input.assignmentIdentifier,
          input.studentProfileId
        );
      }),

    getEducatorAssignmentContext: publicProcedure
      .input(
        z.object({
          courseCode: z.string().default("SDM401"),
          assignmentIdentifier: z.string().default("atlantic-edge-foods"),
          educatorProfileId: z.string().default("profile_educator_lead"),
        })
      )
      .query(async ({ input }) => {
        return await getLmsEducatorAssignmentContext(
          input.courseCode,
          input.assignmentIdentifier,
          input.educatorProfileId
        );
      }),

    createLaunch: publicProcedure
      .input(
        z.object({
          courseCode: z.string().default("SDM401"),
          assignmentIdentifier: z.string().default("atlantic-edge-foods"),
          fiosraProfileId: z.string(),
          launchRole: z.enum(["student", "educator"]),
          destination: z
            .enum(["assignment_context", "learning_workspace", "educator_context"])
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createLmsLaunch(input);
      }),

    getLaunchContext: publicProcedure
      .input(
        z.object({
          launchId: z.string(),
        })
      )
      .query(async ({ input }) => {
        return await getLmsLaunchContext(input.launchId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
