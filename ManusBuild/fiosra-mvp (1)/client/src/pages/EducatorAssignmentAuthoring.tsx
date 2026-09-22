import React, { useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  FilePlus,
  HelpCircle,
  Lock,
  Plus,
  Save,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { FiosraAppShell } from "@/components/FiosraAppShell";
import { trpc } from "@/lib/trpc";
import { CANONICAL_WORKSPACE_ID } from "../../../server/assignmentConstants";

type TaskDraft = {
  title: string;
  prompt: string;
  guidance: string;
};

type RubricCriterionDraft = {
  title: string;
  weight: string;
  guidance: string;
  levelDescriptors: Array<{ label: string; description: string }>;
};

type MaterialDraft = {
  title: string;
  summary: string;
  content: string;
  materialType: "learning" | "decision_context";
};

type AuthoringMode = "scratch" | "document" | "hybrid";

export default function EducatorAssignmentAuthoringPage() {
  const [, setLocation] = useLocation();
  const [, editRouteParams] = useRoute("/educator/workspace/:workspaceId/assignments/:assignmentId/edit");
  const workspaceId = CANONICAL_WORKSPACE_ID;
  const editingAssignmentId = editRouteParams?.assignmentId;

  const { data: options, isLoading, error } = trpc.educator.getAuthoringOptions.useQuery({
    workspaceId,
  });
  const { data: existingAssignment, isLoading: isExistingAssignmentLoading, error: existingAssignmentError } =
    trpc.educator.getAuthoredAssignment.useQuery(
      { workspaceId, assignmentId: editingAssignmentId ?? "" },
      { enabled: Boolean(editingAssignmentId) }
    );

  const saveMutation = trpc.educator.saveAuthoredAssignment.useMutation();

  const [mode, setMode] = useState<AuthoringMode>("scratch");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [dueTimeZone, setDueTimeZone] = useState("Europe/Dublin");
  const [weighting, setWeighting] = useState("30%");
  const [wordLimit, setWordLimit] = useState<string>("2000");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedPolicyLevel, setSelectedPolicyLevel] = useState<
    "level_1" | "level_2" | "level_3" | "level_4" | "level_5"
  >("level_2");
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>([]);
  const [activityGuidance, setActivityGuidance] = useState(
    "Use the available academic context critically. You remain responsible for evaluating information, forming your own judgement, and explaining your reasoning."
  );

  const [tasks, setTasks] = useState<TaskDraft[]>([
    {
      title: "Context & Diagnostic Framing",
      prompt: "Examine the operating dilemma and diagnose the core strategic tension.",
      guidance: "Clarify decision boundaries, symptoms, and primary evaluation criteria.",
    },
    {
      title: "Plausible Strategic Alternatives",
      prompt: "Identify and compare distinct strategic routes across consistent dimensions.",
      guidance: "Contrast trade-offs, resource commitments, and operational risks.",
    },
  ]);

  const [rubric, setRubric] = useState<RubricCriterionDraft[]>([
    {
      title: "Diagnostic Depth & Framing",
      weight: "35%",
      guidance: "Distinguishes underlying causes from symptoms and defines realistic criteria.",
      levelDescriptors: [
        { label: "Distinction", description: "Clear separation of cause and symptom; defensible criteria." },
        { label: "Proficient", description: "Identifies core issues with minor analytical gaps." },
      ],
    },
    {
      title: "Strategic Reasoning & Trade-offs",
      weight: "40%",
      guidance: "Evaluates alternatives with transparent, balanced consideration of trade-offs.",
      levelDescriptors: [
        { label: "Distinction", description: "Balanced, evidence-grounded comparison of alternatives." },
        { label: "Proficient", description: "Compares routes but with occasional unexamined assertions." },
      ],
    },
  ]);

  const [materials, setMaterials] = useState<MaterialDraft[]>([
    {
      title: "Case Briefing Notes",
      summary: "Overview of operating conditions, resource constraints, and market pressures.",
      content:
        "The organisation faces significant capital commitments alongside uncertain operating margins. Expansion requires balanced capacity utilisation while maintaining service quality.",
      materialType: "decision_context",
    },
  ]);

  const [uploadText, setUploadText] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Initialise defaults when options arrive
  React.useEffect(() => {
    if (options) {
      if (!selectedProfileId && options.developmentProfiles[0]) {
        setSelectedProfileId(options.developmentProfiles[0].id);
      }
      if (selectedOutcomes.length === 0 && options.course.learningOutcomes.length > 0) {
        setSelectedOutcomes(options.course.learningOutcomes.slice(0, 2).map((o) => o.code));
      }
    }
  }, [options, selectedProfileId, selectedOutcomes]);

  React.useEffect(() => {
    if (!existingAssignment) return;
    const { assignment } = existingAssignment;
    setTitle(assignment.title);
    setBrief(assignment.brief);
    setDueAt(assignment.dueAt ? assignment.dueAt.slice(0, 16) : "");
    setDueTimeZone(assignment.dueTimeZone);
    setWeighting(assignment.weighting ?? "");
    setWordLimit(assignment.wordLimit ? String(assignment.wordLimit) : "");
    setSelectedOutcomes(assignment.learningOutcomeCodes);
    setActivityGuidance(assignment.activityGuidance);
    setSelectedProfileId(existingAssignment.developmentProfileId ?? "");
    setSelectedPolicyLevel(existingAssignment.policyLevel as typeof selectedPolicyLevel);
    setTasks(existingAssignment.tasks);
    setRubric(existingAssignment.rubric);
    setMaterials(existingAssignment.materials);
  }, [existingAssignment]);

  const activePolicy = options?.policyLevels.find((p) => p.id === selectedPolicyLevel);

  const handleApplyDocumentText = () => {
    const raw = uploadText.trim();
    if (!raw) return;

    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const candidateTitle = lines[0] ?? "";
    if (candidateTitle) setTitle(candidateTitle.slice(0, 140));

    const candidateBrief = lines.slice(1, 5).join(" ");
    if (candidateBrief.length >= 30) setBrief(candidateBrief);

    setMaterials([
      {
        title: candidateTitle ? `${candidateTitle} Context Reference` : "Uploaded Course Material Reference",
        summary: "Extracted reference material provided for contextual assignment work.",
        content: raw,
        materialType: "decision_context",
      },
    ]);
  };

  const handleSourceFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sourceFile = event.target.files?.[0];
    if (!sourceFile) return;
    if (sourceFile.size > 500_000) {
      setFeedbackError("Use a plain-text, Markdown, or CSV source smaller than 500 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadText(typeof reader.result === "string" ? reader.result : "");
      setFeedbackError(null);
    };
    reader.onerror = () => setFeedbackError("The selected source document could not be read.");
    reader.readAsText(sourceFile);
    event.target.value = "";
  };

  const handleToggleOutcome = (code: string) => {
    setSelectedOutcomes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        title: `Task ${prev.length + 1}`,
        prompt: "Articulate a defensible position grounded in available case facts.",
        guidance: "Identify assumptions, supporting evidence, and counter-arguments.",
      },
    ]);
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCriterion = () => {
    setRubric((prev) => [
      ...prev,
      {
        title: `Criterion ${prev.length + 1}`,
        weight: "25%",
        guidance: "Evaluates coherent reasoning and evidence handling.",
        levelDescriptors: [
          { label: "Distinction", description: "Exemplary execution of criterion demands." },
        ],
      },
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    setRubric((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMaterial = () => {
    setMaterials((prev) => [
      ...prev,
      {
        title: `Reference Source ${prev.length + 1}`,
        summary: "Summary of relevant operational or market context.",
        content: "Detailed background context that students can explore during learning.",
        materialType: "learning",
      },
    ]);
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (publish: boolean) => {
    setFeedbackError(null);
    try {
      const parsedWordLimit = wordLimit.trim() ? parseInt(wordLimit.trim(), 10) : null;
      const parsedDueAt = dueAt.trim() ? new Date(dueAt).toISOString() : null;

      const result = await saveMutation.mutateAsync({
        id: editingAssignmentId,
        workspaceId,
        title,
        brief,
        dueAt: parsedDueAt,
        dueTimeZone,
        weighting,
        wordLimit: parsedWordLimit,
        learningOutcomeCodes: selectedOutcomes,
        activityGuidance,
        developmentProfileId: selectedProfileId,
        policyLevel: selectedPolicyLevel,
        tasks,
        rubric,
        materials,
        publish,
      });

      setLocation(`/educator/workspace/${workspaceId}/assignments/${result.assignmentId}`);
    } catch (e: any) {
      setFeedbackError(e.message ?? "Could not save assignment.");
    }
  };

  return (
    <FiosraAppShell currentRole="educator">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
              <FilePlus className="w-3.5 h-3.5" />
              <span>Fiosra Assignment Authoring</span>
            </div>
            <h1 className="text-2xl font-serif text-foreground">
              {editingAssignmentId ? "Edit Learning Assessment" : "Author New Learning Assessment"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Create an academic-source assignment inside this workspace. Declare task scaffolding,
              evaluation criteria, and the active AI policy level.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/educator/courses/sdm401"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </Link>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Draft</span>
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono uppercase tracking-wider bg-foreground text-background rounded hover:bg-foreground/90 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Publish Assignment</span>
            </button>
          </div>
        </div>

        {feedbackError && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
            {feedbackError}
          </div>
        )}

        {(isLoading || isExistingAssignmentLoading) && (
          <div className="p-8 text-center text-sm font-mono text-muted-foreground">
            Loading course context and authoring options...
          </div>
        )}

        {(error || existingAssignmentError) && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
            {error?.message ?? existingAssignmentError?.message}
          </div>
        )}

        {options && (
          <div className="space-y-8">
            {existingAssignment?.isLockedForEditing && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900 flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>This assignment is locked because student work has started. Its contextual, policy, and academic specification cannot be silently revised.</span>
              </div>
            )}
            {/* Authoring Mode Switcher */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-serif text-foreground">Authoring Approach</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Start from scratch, upload or paste a source brief, or use a hybrid outline.
                  </p>
                </div>
                <div className="inline-flex p-1 bg-muted rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setMode("scratch")}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                      mode === "scratch" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    From Scratch
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("document")}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                      mode === "document" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Upload or Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("hybrid")}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                      mode === "hybrid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Hybrid Guided
                  </button>
                </div>
              </div>

              {mode === "document" && (
                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Upload or Paste Assignment Document / Syllabus Extract
                    </label>
                    <div>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                        onChange={handleSourceFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Plain Text</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={6}
                    value={uploadText}
                    onChange={(e) => setUploadText(e.target.value)}
                    placeholder="Upload a plain-text, Markdown, or CSV source, or paste the title, overview, scenario, and reference text from an existing syllabus or assignment document..."
                    className="w-full text-xs font-mono p-3 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleApplyDocumentText}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Populate from Pasted Content</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Core Assignment Details */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <h2 className="text-base font-serif text-foreground">Core Assignment Specification</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Assignment Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Sustainable Supply Chain Transition Strategy"
                    className="w-full text-sm p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Assignment Brief *
                  </label>
                  <textarea
                    rows={4}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Define the organisational context, core dilemma, and strategic deliverables expected from the student..."
                    className="w-full text-sm p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Due Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full text-xs font-mono p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Display Time Zone
                  </label>
                  <input
                    type="text"
                    value={dueTimeZone}
                    onChange={(e) => setDueTimeZone(e.target.value)}
                    className="w-full text-xs font-mono p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Assessment Weighting
                  </label>
                  <input
                    type="text"
                    value={weighting}
                    onChange={(e) => setWeighting(e.target.value)}
                    placeholder="e.g. 30%"
                    className="w-full text-xs font-mono p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Word Limit (Optional)
                  </label>
                  <input
                    type="number"
                    value={wordLimit}
                    onChange={(e) => setWordLimit(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full text-xs font-mono p-2.5 bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Course Learning Outcomes */}
              <div className="pt-4 border-t border-border space-y-3">
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Linked Course Learning Outcomes *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {options.course.learningOutcomes.map((outcome) => {
                    const checked = selectedOutcomes.includes(outcome.code);
                    return (
                      <button
                        type="button"
                        key={outcome.code}
                        onClick={() => handleToggleOutcome(outcome.code)}
                        className={`text-left p-3 rounded border text-xs transition-colors ${
                          checked
                            ? "bg-foreground/5 border-foreground/30 text-foreground"
                            : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-medium">{outcome.code}</span>
                          {checked && <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />}
                        </div>
                        <div className="font-serif text-sm text-foreground">{outcome.title}</div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{outcome.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI Policy Selection: 5 Levels as per Blueprint */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Fiosra 5-Level AI Policy Framework</span>
                  </div>
                  <h2 className="text-base font-serif text-foreground">AI Policy & Socratic Boundary</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                    Select one declared policy level for this assignment. The chosen level configures
                    Contextual Learning Support, permissible inquiry postures, and student responsibilities.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {options.policyLevels.map((policy) => {
                  const isSelected = selectedPolicyLevel === policy.id;
                  return (
                    <button
                      type="button"
                      key={policy.id}
                      onClick={() => setSelectedPolicyLevel(policy.id as any)}
                      className={`text-left p-4 rounded-lg border transition-all flex flex-col justify-between ${
                        isSelected
                          ? "bg-foreground/5 border-foreground shadow-xs"
                          : "bg-background border-border hover:bg-muted/40"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                          Level {policy.ordinal}
                        </div>
                        <div className="font-serif text-sm font-medium text-foreground mb-2">
                          {policy.shortLabel}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-4">
                          {policy.educatorDescription}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
                        {policy.id === "level_1" ? "No in-app AI" : `${policy.permittedSupportPatterns.length} support patterns`}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activePolicy && (
                <div className="p-4 bg-muted/40 border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-medium uppercase tracking-wider text-foreground">
                      Selected: {activePolicy.label}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      Enforced by Dialogue Agent
                    </span>
                  </div>
                  <div className="text-xs text-foreground/90 space-y-1">
                    <div className="font-medium text-xs">Student Responsibility Statement:</div>
                    <p className="text-xs text-muted-foreground italic">
                      "{activePolicy.studentResponsibilityText}"
                    </p>
                  </div>
                  {activePolicy.permittedSupportPatterns.length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                        Permitted Learning Support Patterns
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activePolicy.permittedSupportPatterns.map((pat) => (
                          <span
                            key={pat.pattern}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-background border border-border text-foreground"
                          >
                            {pat.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Development Profile Binding */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-serif text-foreground">Development Profile Binding</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select the qualitative lens model used to interpret student work changes for the Reasoning Trace.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {options.developmentProfiles.map((profile) => {
                  const isSelected = selectedProfileId === profile.id;
                  return (
                    <button
                      type="button"
                      key={profile.id}
                      onClick={() => setSelectedProfileId(profile.id)}
                      className={`text-left p-4 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-foreground/5 border-foreground shadow-xs"
                          : "bg-background border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-serif text-sm font-medium text-foreground mb-1">
                        {profile.name}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {profile.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Structured Tasks */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-serif text-foreground">Intellectual Scaffolding: Structured Tasks</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define the sequential prompts that structure the student's writing workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              </div>

              <div className="space-y-4">
                {tasks.map((task, index) => (
                  <div key={index} className="p-4 border border-border rounded-lg space-y-3 bg-background">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Task {index + 1}
                      </div>
                      {tasks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTask(index)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Task Title
                        </label>
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTasks((prev) =>
                              prev.map((t, i) => (i === index ? { ...t, title: val } : t))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Student Prompt
                        </label>
                        <textarea
                          rows={2}
                          value={task.prompt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTasks((prev) =>
                              prev.map((t, i) => (i === index ? { ...t, prompt: val } : t))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Scaffolding Guidance
                        </label>
                        <textarea
                          rows={2}
                          value={task.guidance}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTasks((prev) =>
                              prev.map((t, i) => (i === index ? { ...t, guidance: val } : t))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rubric Criteria */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-serif text-foreground">Assessment Rubric & Descriptors</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define criteria and level descriptors presented to students during Socratic drafting and pre-submission review.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddCriterion}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Criterion</span>
                </button>
              </div>

              <div className="space-y-4">
                {rubric.map((criterion, index) => (
                  <div key={index} className="p-4 border border-border rounded-lg space-y-3 bg-background">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Criterion {index + 1}
                      </div>
                      {rubric.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(index)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Criterion Title
                        </label>
                        <input
                          type="text"
                          value={criterion.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRubric((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, title: val } : c))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Weighting
                        </label>
                        <input
                          type="text"
                          value={criterion.weight}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRubric((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, weight: val } : c))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Assessment Guidance
                        </label>
                        <textarea
                          rows={2}
                          value={criterion.guidance}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRubric((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, guidance: val } : c))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Context Materials */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-serif text-foreground">Academic Context & Case Materials</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provide the factual source materials used by students in the Socratic canvas and Inquiry Studio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Material</span>
                </button>
              </div>

              <div className="space-y-4">
                {materials.map((mat, index) => (
                  <div key={index} className="p-4 border border-border rounded-lg space-y-3 bg-background">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Material {index + 1}
                      </div>
                      {materials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(index)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Material Title
                        </label>
                        <input
                          type="text"
                          value={mat.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaterials((prev) =>
                              prev.map((m, i) => (i === index ? { ...m, title: val } : m))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Material Type
                        </label>
                        <select
                          value={mat.materialType}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setMaterials((prev) =>
                              prev.map((m, i) => (i === index ? { ...m, materialType: val } : m))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        >
                          <option value="decision_context">Decision Context</option>
                          <option value="learning">Core Learning</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Summary
                        </label>
                        <input
                          type="text"
                          value={mat.summary}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaterials((prev) =>
                              prev.map((m, i) => (i === index ? { ...m, summary: val } : m))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          Material Content *
                        </label>
                        <textarea
                          rows={4}
                          value={mat.content}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaterials((prev) =>
                              prev.map((m, i) => (i === index ? { ...m, content: val } : m))
                            );
                          }}
                          className="w-full text-xs p-2 bg-background border border-border rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Link
                href="/educator/courses/sdm401"
                className="px-4 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground transition-colors"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded hover:bg-muted text-foreground transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save as Draft</span>
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-mono uppercase tracking-wider bg-foreground text-background rounded hover:bg-foreground/90 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Publish Assignment</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </FiosraAppShell>
  );
}
