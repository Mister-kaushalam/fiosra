import json
import logging
import re
import uuid
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from fiosra.mvp.assignment_designer.distractor_engine import distractor_engine
from fiosra.mvp.assignment_designer.schemas import (
    AssignmentTask,
    AutoScoreEvaluationPlan,
    ClarifyAndScaffoldRequest,
    EvaluationCriterionMap,
    GroundingSource,
    HintRung,
    LLMGenerationMetadata,
    PublicQuestionSpec,
    PublicRubricCriterion,
    PublicSource,
    PublishedAssignmentSpec,
    QuestionDraftRequest,
    QuestionSpec,
    RubricLevel,
    ScaffoldingPlan,
    ScaffoldingStep,
    SupportMenuItem,
)
from fiosra.mvp.assignment_designer.vault import answer_vault
from fiosra.mvp.courses.source_queries import CANONICAL_CHUNKS
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.llm.orchestrator import llm_orchestrator

logger = logging.getLogger(__name__)


class AssignmentGenerator:
    """Build, persist, and publish answer-isolated assignments with teacher-visible grounding."""

    FALLBACK_KCS: ClassVar[dict[str, list[str]]] = {
        "history": ["KC_HIST_HISTORICAL_ARGUMENT", "KC_HIST_PRIMARY_SOURCE_ANALYSIS"],
        "language": ["KC_LANG_CLAIM_CONSTRUCTION", "KC_LANG_EVIDENCE_EVALUATION"],
    }

    @staticmethod
    def _deduplicate(values: list[str]) -> list[str]:
        return list(dict.fromkeys(value for value in values if value))

    @classmethod
    async def _load_grounding_sources(
        cls,
        course_id: UUID | str | None,
        module_id: UUID | str | None,
    ) -> list[GroundingSource]:
        if not course_id:
            return []
        source_sql = text(f"""
            SELECT chunk_id, title, kc_id, content, source_url
            FROM {CANONICAL_CHUNKS}
            WHERE course_id = CAST(:course_id AS UUID)
              AND (CAST(:module_id AS UUID) IS NULL OR module_id = CAST(:module_id AS UUID))
            ORDER BY created_at ASC
            LIMIT 5;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                source_sql,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                },
            )
            rows = result.mappings().all()
        sources = [
            GroundingSource(
                chunk_id=str(row["chunk_id"]),
                title=row["title"] or "Assigned course material",
                kc_id=row["kc_id"],
                excerpt=(row["content"] or "").strip()[:280],
                source_url=row["source_url"],
            )
            for row in rows
        ]
        substantive_sources = [source for source in sources if cls._has_substantive_content(source.excerpt)]
        return substantive_sources or sources

    @staticmethod
    def _has_substantive_content(content: str) -> bool:
        return len(content.split()) >= 20

    @staticmethod
    def _select_objective(task: str, objectives: list[str]) -> str:
        if not objectives:
            return "complete the assignment's stated learning goal"
        task_words = {word.lower() for word in re.findall(r"[A-Za-z]{4,}", task)}
        return max(
            objectives,
            key=lambda objective: len(task_words & {word.lower() for word in re.findall(r"[A-Za-z]{4,}", objective)}),
        )

    @classmethod
    async def _load_module_context(cls, module_id: UUID | str | None) -> tuple[str, str, list[str]]:
        if not module_id:
            return "", "", []
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT title, description, learning_objectives FROM modules WHERE module_id = CAST(:module_id AS UUID)"),
                {"module_id": str(module_id)},
            )
            row = result.mappings().first()
        if not row:
            return "", "", []
        raw_objectives = row["learning_objectives"] or []
        if isinstance(raw_objectives, str):
            raw_objectives = json.loads(raw_objectives)
        return row["title"] or "", row["description"] or "", list(raw_objectives)

    @classmethod
    async def generate_scaffolding_plan(
        cls,
        req: ClarifyAndScaffoldRequest,
        *,
        allow_live_enhancement: bool = True,
    ) -> ScaffoldingPlan:
        """Generate an answer-blind scaffold constrained to the selected course corpus when present."""
        grounding_sources = await cls._load_grounding_sources(req.course_id, req.module_id)
        module_title, module_description, module_objectives = await cls._load_module_context(req.module_id)
        source_titles = ", ".join(source.title for source in grounding_sources[:2])
        temporal = req.answers.get("Q1_TEMPORAL", "").strip()
        misconception = req.answers.get("Q2_MISCONCEPTIONS", "").strip()
        evidence_anchor = req.answers.get("Q3_EVIDENCE", "").strip()

        evidence = source_titles or evidence_anchor or "the assigned course materials"
        scope = temporal or "the setting and boundaries named in the educator's prompt"
        cognitive_trap = misconception or "moving from an observation to an unsupported broad conclusion"
        objective = cls._select_objective(req.raw_prompt, module_objectives)
        module_focus = module_title or module_description or scope
        base_prompt = req.raw_prompt.strip()
        clarification = (
            f"Work within {scope}. Use {evidence} to distinguish direct observations from justified inferences, "
            f"and test the risk of {cognitive_trap}."
        )
        clarified_prompt = base_prompt if clarification.lower() in base_prompt.lower() else f"{base_prompt}\n\n{clarification}"
        source_context = "\n".join(
            f"- {source.title}: {source.excerpt}" for source in grounding_sources
        ) or "No course source is attached; preserve the educator's stated evidence requirement."
        generation = await llm_orchestrator.enhance(
            purpose="assignment_scaffold_prompt",
            system_prompt=(
                "You refine an educator-authored student task for a Socratic reasoning workspace. "
                "Return one or two concise prose sentences only: no markdown, headings, labels, bullets, "
                "numbered lists, claims, or evidence examples. Preserve the stated learning scope, use only "
                "the supplied public sources, require a bounded claim with evidence and uncertainty, and do "
                "not supply an answer, thesis, rubric, solution, or grading judgment."
            ),
            user_prompt=(
                f"Educator draft:\n{base_prompt}\n\nRequired boundaries:\n{clarification}\n\n"
                f"Public course context:\n{source_context}"
            ),
            deterministic_fallback=clarified_prompt,
            pseudonymous_seed=f"assignment:{req.course_id or 'unbound'}:{req.module_id or 'unbound'}:{base_prompt}",
            max_characters=1600,
            max_tokens=240,
            allow_live=allow_live_enhancement,
            request_timeout_seconds=15.0,
        )
        clarified_prompt = generation.content

        source_kcs = [source.kc_id for source in grounding_sources if source.kc_id]
        target_kcs = cls._deduplicate(req.target_kcs or source_kcs)
        if not target_kcs:
            target_kcs = cls.FALLBACK_KCS.get(req.domain.lower(), ["KC_GENERAL"])

        source_label = grounding_sources[0].title if grounding_sources else evidence
        target_label = target_kcs[0]
        hint_ladder = [
            HintRung(
                level=0,
                hint_type="metacognitive",
                content=(
                    f"Start with the module goal: {objective}. Which part of the task asks you to demonstrate that goal?"
                ),
            ),
            HintRung(
                level=1,
                hint_type="conceptual",
                content=(
                    f"Return to {source_label}. Which detail is most useful for {module_focus}, and how does it move your response forward?"
                ),
            ),
            HintRung(
                level=2,
                hint_type="procedural",
                content=(
                    f"Draft the next section in three moves: identify a relevant detail, explain its significance for {objective}, "
                    f"then connect it back to the task boundary: {scope}."
                ),
            ),
            HintRung(
                level=3,
                hint_type="worked_analogy",
                content=(
                    f"Use a revision pass: underline the sentence that addresses {objective}, then check that every nearby "
                    "source detail actively supports that sentence rather than simply appearing beside it."
                ),
            ),
            HintRung(
                level=4,
                hint_type="bottom_out",
                content="Bottom-out full solution: locked by default and available only to an educator.",
                is_locked=True,
            ),
        ]
        rubric_rules = [
            {
                "criterion_id": "rule_claim_precision",
                "label": "Module objective alignment",
                "description": f"Demonstrates the module objective: {objective}.",
                "target_kc": target_label,
                "nli_threshold": 0.80,
                "weight": 2.0,
            },
            {
                "criterion_id": "rule_evidence_reasoning",
                "label": "Assigned material in use",
                "description": f"Uses {evidence} to develop the task rather than merely listing source information.",
                "target_kc": target_kcs[min(1, len(target_kcs) - 1)],
                "nli_threshold": 0.80,
                "weight": 2.0,
            },
            {
                "criterion_id": "rule_alternative_explanation",
                "label": "Explanation and revision",
                "description": f"Builds an explanation within {scope} and revises it to address the risk of {cognitive_trap}.",
                "target_kc": target_label,
                "nli_threshold": 0.80,
                "weight": 1.0,
            },
        ]
        distractors = await distractor_engine.get_distractors_for_kcs(
            target_kcs,
            domain=req.domain.lower(),
            limit=3,
        )
        return ScaffoldingPlan(
            clarified_prompt=clarified_prompt,
            domain=req.domain,
            target_kcs=target_kcs,
            hint_ladder=hint_ladder,
            rubric_rules=rubric_rules,
            distractor_traps=distractors,
            grounding_mode="course_grounded" if grounding_sources else "generic",
            grounding_sources=grounding_sources,
            generation_metadata=LLMGenerationMetadata.model_validate(generation.metadata.as_dict()),
        )

    @staticmethod
    def _public_rubric(rules: list[dict[str, Any]]) -> list[PublicRubricCriterion]:
        weights = [float(rule.get("weight", 0.0)) for rule in rules]
        total_weight = sum(weights)
        criteria: list[PublicRubricCriterion] = []
        allocated = 0.0
        for index, rule in enumerate(rules):
            normalized_weight = round((weights[index] / total_weight * 100) if total_weight else 0.0, 2)
            if total_weight and index == len(rules) - 1:
                normalized_weight = round(100.0 - allocated, 2)
            allocated += normalized_weight
            criteria.append(
                PublicRubricCriterion(
                criterion_id=rule.get("criterion_id", f"criterion_{index + 1}"),
                title=rule.get("label", f"Criterion {index + 1}"),
                description=rule.get("description", "Demonstrates the stated assignment requirement."),
                weight=normalized_weight,
                levels=[
                    RubricLevel(
                        level_id="developing",
                        label="Developing",
                        description="Begins to address this criterion but needs a clearer, more complete response.",
                    ),
                    RubricLevel(
                        level_id="secure",
                        label="Secure",
                        description="Addresses this criterion clearly with relevant detail and explanation.",
                    ),
                    RubricLevel(
                        level_id="strong",
                        label="Strong",
                        description="Addresses this criterion precisely, using well-chosen material and a well-developed explanation.",
                    ),
                ],
                self_review_prompt=f"Where does your completed work show {rule.get('label', 'this criterion').lower()}?",
                )
            )
        return criteria

    @classmethod
    def _build_public_contract(
        cls,
        req: QuestionDraftRequest,
        prompt: str,
        grounding_sources: list[GroundingSource],
        rubric_rules: list[dict[str, Any]],
    ) -> PublishedAssignmentSpec:
        scope = (req.answers or {}).get("Q1_TEMPORAL", "").strip() or "the scope stated in the task"
        learning_goals = cls._deduplicate(
            [
                rule.get("description", "")
                for rule in rubric_rules
                if rule.get("description")
            ]
        )[:3]
        source_pack = [
            PublicSource(
                source_id=f"source_{index + 1}",
                title=source.title,
                excerpt=source.excerpt,
                source_url=source.source_url,
                citation=source.title,
                relevance_guidance="Use this assigned material to develop and support your response to the task.",
            )
            for index, source in enumerate(grounding_sources)
        ]
        title = req.topic.strip() or "Untitled assignment"
        return PublishedAssignmentSpec(
            title=title,
            purpose=(
                f"This assignment helps you practice the course learning goals for {title}."
            ),
            task=AssignmentTask(
                prompt=prompt,
                scope=scope,
                deliverable="A source-grounded written response",
                requirements=[
                    "Respond directly to the task within the stated scope.",
                    "Use the assigned materials to develop your explanation.",
                    "Review your work against the published rubric before submitting.",
                ],
            ),
            learning_goals=learning_goals or ["Develop a clear, evidence-grounded response to the assignment task."],
            source_pack=source_pack,
            public_rubric=cls._public_rubric(rubric_rules),
            start_options=[
                "Read the task and underline the action words and boundaries.",
                "Explore an assigned source and note one detail relevant to the task.",
                "Sketch a short outline before drafting your response.",
            ],
            support_menu=[
                SupportMenuItem(
                    action_id="understand_task",
                    title="Understand the task",
                    description="Clarify the task, deliverable, or scope without receiving an answer.",
                ),
                SupportMenuItem(
                    action_id="use_materials",
                    title="Work with assigned materials",
                    description="Find and use relevant details from the approved source pack.",
                ),
                SupportMenuItem(
                    action_id="plan_or_revise",
                    title="Plan or revise your response",
                    description="Choose a helpful next step for organizing or improving your own work.",
                ),
            ],
            completion_checklist=[
                "I responded directly to the task and stayed within its scope.",
                "I used assigned material in my explanation.",
                "I checked my work against each rubric criterion.",
                "I acknowledged the sources I used.",
            ],
        )

    @staticmethod
    def _build_evaluation_plan(
        rubric_rules: list[dict[str, Any]],
        target_kcs: list[str],
        grounding_sources: list[GroundingSource],
    ) -> AutoScoreEvaluationPlan:
        source_chunk_ids = [source.chunk_id for source in grounding_sources]
        return AutoScoreEvaluationPlan(
            public_rubric_map=[
                EvaluationCriterionMap(
                    public_criterion_id=rule.get("criterion_id", f"criterion_{index + 1}"),
                    concept_ids=[rule.get("target_kc")] if rule.get("target_kc") else target_kcs[:1],
                    source_chunk_ids=source_chunk_ids,
                    evidence_expectation=rule.get("description", "Collect evidence relevant to this public criterion."),
                )
                for index, rule in enumerate(rubric_rules)
            ],
            completion_states=["task understood", "materials explored", "response developing", "ready to review"],
            support_policy=[
                "Offer student-selected task, source, planning, and revision support.",
                "Never generate a final answer, overwrite student writing, or assign a final grade.",
            ],
        )

    @classmethod
    async def draft_question(cls, req: QuestionDraftRequest) -> QuestionSpec:
        """Persist an assignment while retaining reference solutions only in the Answer Vault."""
        assignment_id = str(uuid.uuid4())
        question_id = f"Q_{uuid.uuid4().hex[:8].upper()}"

        fallback_plan: ScaffoldingPlan | None = None
        generation_metadata = req.generation_metadata
        if req.clarified_prompt:
            prompt = req.clarified_prompt
            target_kcs = req.target_kcs or []
            hint_ladder = req.hint_ladder
            rubric_criteria = req.rubric_rules
            grounding_mode = req.grounding_mode
            grounding_sources = req.grounding_sources
            if not target_kcs or not hint_ladder or not rubric_criteria:
                fallback_plan = await cls.generate_scaffolding_plan(
                    ClarifyAndScaffoldRequest(
                        raw_prompt=req.raw_prompt or req.clarified_prompt,
                        domain=req.domain,
                        answers=req.answers or {},
                        target_kcs=target_kcs,
                        course_id=req.course_id,
                        module_id=req.module_id,
                    )
                )
                target_kcs = target_kcs or fallback_plan.target_kcs
                hint_ladder = hint_ladder or fallback_plan.hint_ladder
                rubric_criteria = rubric_criteria or fallback_plan.rubric_rules
                if not grounding_sources:
                    grounding_sources = fallback_plan.grounding_sources
                    grounding_mode = fallback_plan.grounding_mode
                generation_metadata = generation_metadata or fallback_plan.generation_metadata
        else:
            fallback_plan = await cls.generate_scaffolding_plan(
                ClarifyAndScaffoldRequest(
                    raw_prompt=req.raw_prompt or f"Develop an evidence-based response about {req.topic}.",
                    domain=req.domain,
                    answers=req.answers or {},
                    target_kcs=req.target_kcs or [],
                    course_id=req.course_id,
                    module_id=req.module_id,
                )
            )
            prompt = fallback_plan.clarified_prompt
            target_kcs = fallback_plan.target_kcs
            hint_ladder = fallback_plan.hint_ladder
            rubric_criteria = fallback_plan.rubric_rules
            grounding_mode = fallback_plan.grounding_mode
            grounding_sources = fallback_plan.grounding_sources
            generation_metadata = fallback_plan.generation_metadata

        subproblems = [
            ScaffoldingStep(
                step_id="step_1",
                step_prompt="Identify the source observation or course evidence that bears most directly on your claim.",
                target_kc=target_kcs[0],
            ),
            ScaffoldingStep(
                step_id="step_2",
                step_prompt="Explain the inference your evidence supports and name a limit or alternative explanation.",
                target_kc=target_kcs[min(1, len(target_kcs) - 1)],
            ),
        ]
        reference_solution = req.reference_solution or {
            "thesis": "A defensible response makes a bounded claim and explains how assigned evidence supports it.",
            "key_evidence": "Specific details from the teacher-selected source corpus",
            "model_argument": "The response distinguishes direct observation from inference and tests a plausible alternative.",
        }
        vault_token = answer_vault.lock_solution(
            assignment_id=assignment_id,
            question_id=question_id,
            reference_solution=reference_solution,
        )
        published = req.published or cls._build_public_contract(req, prompt, grounding_sources, rubric_criteria)
        evaluation_plan = req.evaluation_plan or cls._build_evaluation_plan(
            rubric_criteria, target_kcs, grounding_sources
        )
        spec = QuestionSpec(
            question_id=question_id,
            assignment_id=assignment_id,
            prompt=prompt,
            domain=req.domain,
            target_kcs=target_kcs,
            subproblems=subproblems,
            hint_ladder=hint_ladder,
            rubric_criteria=rubric_criteria,
            vault_token=vault_token,
            status="draft",
            grounding_mode=grounding_mode,
            grounding_sources=grounding_sources,
            generation_metadata=generation_metadata,
            canvas_sections=req.canvas_sections,
            published=published,
            evaluation_plan=evaluation_plan,
        )
        insert_sql = text("""
            INSERT INTO assignments (assignment_id, module_id, title, created_by, spec, created_at)
            VALUES (CAST(:assignment_id AS UUID), CAST(:module_id AS UUID), :title, :created_by, CAST(:spec AS JSONB), NOW());
        """)
        async with AsyncSessionLocal() as session:
            await session.execute(
                insert_sql,
                {
                    "assignment_id": assignment_id,
                    "module_id": str(req.module_id) if req.module_id else None,
                    "title": req.topic,
                    "created_by": req.created_by,
                    "spec": json.dumps(spec.model_dump()),
                },
            )
            await session.commit()
        logger.info("Persisted assignment %s to database in draft state.", assignment_id)
        return spec

    @classmethod
    def _legacy_public_contract(cls, spec: dict[str, Any]) -> PublishedAssignmentSpec:
        sources = [GroundingSource.model_validate(source) for source in spec.get("grounding_sources", [])]
        request = QuestionDraftRequest(
            topic=spec.get("title") or "Assignment",
            domain=spec.get("domain") or "general",
            clarified_prompt=spec.get("prompt") or "Complete the assigned task.",
            answers={},
        )
        return cls._build_public_contract(
            request,
            spec.get("prompt") or "Complete the assigned task.",
            sources,
            spec.get("rubric_criteria", []),
        )

    @classmethod
    def _to_public_spec(cls, spec: dict[str, Any]) -> PublicQuestionSpec:
        safe_spec = dict(spec)
        safe_spec.pop("vault_token", None)
        safe_spec.pop("evaluation_plan", None)
        safe_spec.pop("generation_metadata", None)
        if not safe_spec.get("published"):
            safe_spec["published"] = cls._legacy_public_contract(safe_spec).model_dump()
        return PublicQuestionSpec.model_validate(safe_spec)

    @staticmethod
    def _readiness(spec: dict[str, Any], module_id: UUID | str | None = None) -> list[dict[str, str]]:
        published = PublishedAssignmentSpec.model_validate(spec.get("published"))
        evaluation = AutoScoreEvaluationPlan.model_validate(spec.get("evaluation_plan") or {})
        issues: list[dict[str, str]] = []

        if not published.title.strip() or not published.purpose.strip() or not published.task.prompt.strip():
            issues.append({"code": "brief_incomplete", "message": "Add a student-facing title, purpose, and task."})
        if not published.task.scope.strip() or not published.task.deliverable.strip():
            issues.append({"code": "task_incomplete", "message": "Define the task scope and deliverable."})
        if len(published.learning_goals) < 2:
            issues.append({"code": "learning_goals_incomplete", "message": "Add at least two student-facing learning goals."})
        if module_id and not published.source_pack:
            issues.append({"code": "source_pack_missing", "message": "Attach at least one substantive student-readable source."})
        for source in published.source_pack:
            if len(source.excerpt.split()) < 20 or not source.relevance_guidance.strip():
                issues.append({"code": "source_not_ready", "message": f"Make '{source.title}' readable and explain why it is assigned."})
                break
        if len(published.public_rubric) < 3:
            issues.append({"code": "rubric_incomplete", "message": "Add at least three public rubric criteria."})
        elif any(len(criterion.levels) < 3 for criterion in published.public_rubric):
            issues.append({"code": "rubric_levels_incomplete", "message": "Give every public rubric criterion at least three performance descriptions."})
        elif (
            any(criterion.weight > 0 for criterion in published.public_rubric)
            and round(sum(criterion.weight for criterion in published.public_rubric), 2) != 100.0
        ):
            issues.append({"code": "rubric_weights_invalid", "message": "Public rubric weights must total 100%."})
        if not published.completion_checklist or not published.integrity_notice.strip():
            issues.append({"code": "submission_incomplete", "message": "Add a completion checklist and integrity notice."})
        public_ids = {criterion.criterion_id for criterion in published.public_rubric}
        if not evaluation.public_rubric_map or any(
            mapping.public_criterion_id not in public_ids for mapping in evaluation.public_rubric_map
        ):
            issues.append({"code": "autoscore_alignment_missing", "message": "Map each AutoSCORE rule to a visible public rubric criterion."})
        return issues

    @classmethod
    async def get_authoring_assignment(cls, assignment_id: UUID | str) -> dict[str, Any] | None:
        sql = text("SELECT spec FROM assignments WHERE assignment_id = CAST(:assignment_id AS UUID);")
        async with AsyncSessionLocal() as session:
            result = await session.execute(sql, {"assignment_id": str(assignment_id)})
            stored = result.scalar()
        if not stored:
            return None
        spec = stored if isinstance(stored, dict) else json.loads(stored)
        if not spec.get("published"):
            spec["published"] = cls._legacy_public_contract(spec).model_dump()
        if not spec.get("evaluation_plan"):
            spec["evaluation_plan"] = cls._build_evaluation_plan(
                spec.get("rubric_criteria", []),
                spec.get("target_kcs", []),
                [GroundingSource.model_validate(source) for source in spec.get("grounding_sources", [])],
            ).model_dump()
        return {
            "assignment_id": spec["assignment_id"],
            "question_id": spec["question_id"],
            "status": spec.get("status", "draft"),
            "published": spec["published"],
            "evaluation_plan": spec["evaluation_plan"],
            "canvas_sections": spec.get("canvas_sections", []),
            "readiness": {
                "is_publishable": not cls._readiness(spec),
                "items": cls._readiness(spec),
            },
        }

    @classmethod
    async def update_authoring_assignment(
        cls,
        assignment_id: UUID | str,
        published: PublishedAssignmentSpec,
        evaluation_plan: AutoScoreEvaluationPlan,
        canvas_sections: list[Any] | None = None,
    ) -> dict[str, Any] | None:
        sql = text("SELECT spec FROM assignments WHERE assignment_id = CAST(:assignment_id AS UUID) FOR UPDATE;")
        async with AsyncSessionLocal() as session:
            result = await session.execute(sql, {"assignment_id": str(assignment_id)})
            stored = result.scalar()
            if not stored:
                return None
            spec = stored if isinstance(stored, dict) else json.loads(stored)
            spec["published"] = published.model_dump()
            spec["evaluation_plan"] = evaluation_plan.model_dump()
            if canvas_sections is not None:
                spec["canvas_sections"] = [
                    section.model_dump() if hasattr(section, "model_dump") else section for section in canvas_sections
                ]
            await session.execute(
                text("UPDATE assignments SET title = :title, spec = CAST(:spec AS JSONB) WHERE assignment_id = CAST(:assignment_id AS UUID);"),
                {"assignment_id": str(assignment_id), "title": published.title, "spec": json.dumps(spec)},
            )
            await session.commit()
        return await cls.get_authoring_assignment(assignment_id)

    @classmethod
    async def get_public_assignment(cls, assignment_id: UUID | str) -> PublicQuestionSpec | None:
        sql = text("SELECT spec FROM assignments WHERE assignment_id = CAST(:assignment_id AS UUID);")
        async with AsyncSessionLocal() as session:
            result = await session.execute(sql, {"assignment_id": str(assignment_id)})
            spec = result.scalar()
        if not spec:
            return None
        return cls._to_public_spec(spec if isinstance(spec, dict) else json.loads(spec))

    @staticmethod
    def completion_support(assignment: PublicQuestionSpec, action_id: str, document_excerpt: str) -> dict[str, Any]:
        """Offer an optional next step from the public assignment contract without judging student claims."""
        published = assignment.published
        excerpt_words = len(document_excerpt.split())
        actions = {item.action_id: item for item in published.support_menu}
        requested = actions.get(action_id)
        if not requested:
            raise ValueError("This support action is not enabled for the published assignment.")

        if action_id == "understand_task":
            return {
                "action_id": action_id,
                "title": "Understand the task",
                "guidance": (
                    f"The task asks you to {published.task.prompt.strip()} Work within {published.task.scope.strip()} "
                    f"and produce {published.task.deliverable.strip()}."
                ),
                "next_steps": [
                    "Underline the main action word in the task.",
                    "Write one sentence describing the response you will create.",
                    "Check that your planned response stays within the stated scope.",
                ],
            }
        if action_id == "use_materials":
            source_titles = ", ".join(source.title for source in published.source_pack[:2]) or "the assigned materials"
            return {
                "action_id": action_id,
                "title": "Work with assigned materials",
                "guidance": f"Open {source_titles}. Look for a detail that can help you address the task, then explain why that detail matters in your own words.",
                "next_steps": [
                    "Choose one relevant detail from an assigned source.",
                    "Place the detail beside the part of your draft it supports.",
                    "Add a sentence explaining the connection instead of only quoting the source.",
                ],
            }
        phase = "beginning" if excerpt_words < 40 else "developing"
        return {
            "action_id": action_id,
            "title": "Plan or revise your response",
            "guidance": (
                f"Your draft is currently {phase}. Use one visible rubric criterion as the focus for your next revision; "
                "make the next change yourself, then check whether the change makes the task response clearer."
            ),
            "next_steps": [
                f"Choose one rubric criterion: {published.public_rubric[0].title if published.public_rubric else 'the assignment criteria'}.",
                "Identify the next paragraph or section that would most improve your response.",
                "Revise that section, then use the rubric's self-review prompt to check it.",
            ],
        }

    @classmethod
    async def list_public_assignments(
        cls,
        course_id: UUID | str | None = None,
        module_id: UUID | str | None = None,
        status: str | None = None,
    ) -> list[PublicQuestionSpec]:
        sql = text("""
            SELECT a.spec
            FROM assignments a
            LEFT JOIN modules m ON a.module_id = m.module_id
            WHERE (CAST(:course_id AS UUID) IS NULL OR m.course_id = CAST(:course_id AS UUID))
              AND (CAST(:module_id AS UUID) IS NULL OR a.module_id = CAST(:module_id AS UUID))
              AND (CAST(:status AS VARCHAR) IS NULL OR a.spec ->> 'status' = CAST(:status AS VARCHAR))
            ORDER BY a.created_at DESC;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                sql,
                {
                    "course_id": str(course_id) if course_id else None,
                    "module_id": str(module_id) if module_id else None,
                    "status": status,
                },
            )
            specs = result.scalars().all()
        valid: list[PublicQuestionSpec] = []
        for spec in specs:
            try:
                data = spec if isinstance(spec, dict) else json.loads(spec)
                if isinstance(data, dict) and "question_id" in data:
                    valid.append(cls._to_public_spec(data))
            except Exception as e:  # noqa: BLE001 - one malformed legacy spec must not hide valid assignments.
                logger.warning("Skipping invalid assignment spec: %s", e)
        return valid

    @classmethod
    async def publish_assignment(
        cls,
        assignment_id: UUID | str,
        module_id: UUID | str | None = None,
    ) -> dict[str, Any]:
        """Publish an assignment only when its same student-safe projection is retrievable."""
        readiness_sql = text("""
            SELECT module_id, spec
            FROM assignments
            WHERE assignment_id = CAST(:assignment_id AS UUID);
        """)
        async with AsyncSessionLocal() as session:
            readiness_result = await session.execute(
                readiness_sql,
                {"assignment_id": str(assignment_id)},
            )
            readiness_row = readiness_result.mappings().first()
        if not readiness_row:
            raise ValueError(f"Assignment '{assignment_id}' not found.")

        active_module_id = module_id or readiness_row["module_id"]
        private_spec = readiness_row["spec"]
        private_spec = private_spec if isinstance(private_spec, dict) else json.loads(private_spec)
        if not private_spec.get("published"):
            private_spec["published"] = cls._legacy_public_contract(private_spec).model_dump()
        if not private_spec.get("evaluation_plan"):
            private_spec["evaluation_plan"] = cls._build_evaluation_plan(
                private_spec.get("rubric_criteria", []),
                private_spec.get("target_kcs", []),
                [GroundingSource.model_validate(source) for source in private_spec.get("grounding_sources", [])],
            ).model_dump()
        issues = cls._readiness(private_spec, active_module_id)
        if issues:
            raise RuntimeError(" ".join(issue["message"] for issue in issues))
        private_spec["status"] = "published"

        update_sql = text("""
            UPDATE assignments
            SET module_id = COALESCE(CAST(:module_id AS UUID), module_id),
                spec = CAST(:spec AS JSONB)
            WHERE assignment_id = CAST(:assignment_id AS UUID)
            RETURNING assignment_id, module_id, title;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                update_sql,
                {
                    "assignment_id": str(assignment_id),
                    "module_id": str(module_id) if module_id else None,
                    "spec": json.dumps(private_spec),
                },
            )
            row = result.mappings().first()
            if not row:
                raise ValueError(f"Assignment '{assignment_id}' not found.")
            await session.commit()

        public_spec = await cls.get_public_assignment(assignment_id)
        if not public_spec or public_spec.status != "published":
            raise RuntimeError("The assignment could not be verified through the student-safe publication contract.")
        return {
            "assignment_id": str(row["assignment_id"]),
            "module_id": str(row["module_id"]) if row["module_id"] else None,
            "title": row["title"],
            "status": "published",
        }

    @classmethod
    async def delete_assignment(cls, assignment_id: UUID | str) -> None:
        """Permanently remove a draft or published assignment.

        Refuses when a student has already interacted with it (a session, learning
        document, or reasoning trace references this assignment_id) so a real student
        submission can never be silently discarded — only the database's own foreign
        key constraints enforce this, so the guard rail can't be bypassed here.
        """
        delete_sql = text("""
            DELETE FROM assignments WHERE assignment_id = CAST(:assignment_id AS UUID)
            RETURNING assignment_id;
        """)
        async with AsyncSessionLocal() as session:
            try:
                result = await session.execute(delete_sql, {"assignment_id": str(assignment_id)})
                row = result.mappings().first()
                if not row:
                    raise ValueError(f"Assignment '{assignment_id}' not found.")
                await session.commit()
            except IntegrityError as exc:
                await session.rollback()
                raise RuntimeError(
                    "This assignment has student sessions or submitted work and cannot be deleted."
                ) from exc


assignment_generator = AssignmentGenerator()
