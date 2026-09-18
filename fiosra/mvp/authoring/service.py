import json
import logging
import re
from typing import Any

from sqlalchemy import text

from fiosra.mvp.assignment_designer.generator import assignment_generator
from fiosra.mvp.assignment_designer.schemas import ClarifyAndScaffoldRequest, HintRung, PublicRubricCriterion, RubricLevel
from fiosra.mvp.authoring.schemas import (
    AssignmentDraftPackage,
    AssignmentDraftRequest,
    AssignmentDraftRevisionRequest,
    AssignmentDraftRevisionResponse,
    AssignmentDraftSpec,
    CognitiveTrapSpec,
    CourseDraftRequest,
    CourseDraftRevisionRequest,
    CourseDraftRevisionResponse,
    CourseDraftSpec,
    DraftAssignmentMilestoneSpec,
    DraftModuleSpec,
    HintRungSpec,
    PublishAssignmentDraftRequest,
    PublishCourseDraftRequest,
    RubricSynthesisRequest,
    RubricSynthesisResponse,
)
from fiosra.mvp.config import settings
from fiosra.mvp.courses.ingestion import syllabus_parser
from fiosra.mvp.courses.schemas import CourseResponse
from fiosra.mvp.courses.service import course_service
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.llm.contracts import CompletionRequest
from fiosra.mvp.llm.litellm_provider import LiteLLMProvider

logger = logging.getLogger(__name__)


def _extract_json_block(text_response: str) -> dict[str, Any] | None:
    """Extracts and parses JSON from markdown code fences or raw text."""
    if not text_response:
        return None
    # Try direct parse
    try:
        return json.loads(text_response.strip())
    except json.JSONDecodeError:
        pass

    # Prefer the entire fenced payload. The previous non-greedy brace capture
    # stopped at the first nested object and rejected otherwise valid drafts.
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text_response, re.DOTALL | re.IGNORECASE)
    candidate = match.group(1) if match else text_response
    try:
        parsed = json.loads(candidate.strip())
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    # Decode the first complete object so a provider's explanatory suffix does
    # not invalidate a valid structured payload.
    start = candidate.find("{")
    if start != -1:
        try:
            parsed, _ = json.JSONDecoder().raw_decode(candidate[start:])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass
    return None


class CourseAuthoringService:
    """
    AI Co-Pilot service for curriculum ingestion, structured course blueprint synthesis,
    multi-turn iterative educator review loops, and one-click publishing.
    """

    @classmethod
    async def generate_course_draft(cls, req: CourseDraftRequest) -> CourseDraftSpec:
        """
        Synthesizes a structured CourseDraftSpec from raw syllabus text, lecture notes, or readings.
        """
        system_prompt = (
            "You are an expert university curriculum designer and pedagogical architect. "
            "Analyze the provided course materials and output a rigorous, well-sequenced university course draft. "
            "Respond ONLY with a valid JSON object strictly matching this schema:\n"
            "{\n"
            '  "title": "Course Title",\n'
            '  "domain": "Discipline/Domain",\n'
            '  "overview": "Comprehensive syllabus overview and course rationale",\n'
            '  "target_audience": "Undergraduate",\n'
            '  "modules": [\n'
            "    {\n"
            '      "title": "Module Title",\n'
            '      "description": "Pedagogical focus and historical/scientific scope",\n'
            '      "learning_objectives": ["Objective 1 using Bloom\'s verbs", "Objective 2"],\n'
            '      "position": 1,\n'
            '      "knowledge_components": ["KC_DOMAIN_TOPIC1", "KC_DOMAIN_TOPIC2"],\n'
            '      "suggested_assignments": [\n'
            "        {\n"
            '          "title": "Milestone Task Title",\n'
            '          "description": "Task brief and inquiry question",\n'
            '          "primary_sources": ["Primary text 1", "Evidence document 2"]\n'
            "        }\n"
            "      ],\n"
            '      "change_status": "unchanged"\n'
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Course Materials / Syllabus Content:\n"
            f"---\n{req.materials_text}\n---\n"
            f"Domain: {req.domain}\n"
            f"Title Hint: {req.title_hint or 'Derive optimal title from materials'}\n\n"
            f"Synthesize 3 to 6 cohesive modules that scaffold student reasoning progressively."
        )

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() != "deterministic":
            try:
                provider = LiteLLMProvider.from_settings()
                comp_req = CompletionRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    purpose="course_draft_synthesis",
                    max_tokens=2500,
                    temperature=0.3,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": "course_draft",
                            "schema": CourseDraftSpec.model_json_schema(),
                        },
                    },
                )
                result = await provider.complete(comp_req)
                parsed = _extract_json_block(result.content)
                if not parsed or "title" not in parsed or "modules" not in parsed:
                    raise RuntimeError("The provider did not return a valid course draft JSON.")
                return CourseDraftSpec.model_validate(parsed)
            except Exception as error:  # noqa: BLE001 - course drafting must remain usable with local models.
                logger.warning("Course draft generation fell back to deterministic proposal: %s", error)

        # High quality deterministic synthesis fallback
        lines = [line.strip() for line in req.materials_text.splitlines() if line.strip()]
        title = req.title_hint or (lines[0] if lines else f"{req.domain} Foundations")
        if len(title) > 100:
            title = title[:97] + "..."

        modules: list[DraftModuleSpec] = [
            DraftModuleSpec(
                title=f"Unit 1: Foundations of {req.domain}",
                description="Introduction to core concepts, historiographical / methodological framing, and initial evidence analysis.",
                learning_objectives=[
                    f"Identify core foundational frameworks in {req.domain}",
                    "Critically evaluate primary source evidence and context",
                ],
                position=1,
                knowledge_components=[f"KC_{req.domain.upper()}_FOUNDATIONS", f"KC_{req.domain.upper()}_SOURCES"],
                suggested_assignments=[
                    DraftAssignmentMilestoneSpec(
                        title=f"{req.domain} Methodological Inquiry",
                        description="Analyze foundational documents and construct an evidentiary claim.",
                        primary_sources=["Foundational Source Excerpt", "Methodological Overview"],
                    )
                ],
                change_status="unchanged",
            ),
            DraftModuleSpec(
                title="Unit 2: Structural Dynamics & Critical Inquiries",
                description="Deep dive into causal mechanisms, competing perspectives, and secondary literature debate.",
                learning_objectives=[
                    "Examine causal interactions and institutional pressures",
                    "Synthesize competing interpretations from primary evidence",
                ],
                position=2,
                knowledge_components=[f"KC_{req.domain.upper()}_DYNAMICS", f"KC_{req.domain.upper()}_CAUSALITY"],
                suggested_assignments=[
                    DraftAssignmentMilestoneSpec(
                        title="Evidentiary Synthesis & Thesis Formulation",
                        description="Examine structural constraints and resolve contradictory historical accounts.",
                        primary_sources=["Comparative Case Accounts", "Statistical Summary"],
                    )
                ],
                change_status="unchanged",
            ),
            DraftModuleSpec(
                title="Unit 3: Synthesis, Historiography & Modern Implications",
                description="Culminating synthesis applying learned knowledge components to broader academic and contemporary debates.",
                learning_objectives=[
                    "Construct rigorous, source-grounded academic arguments",
                    "Defend claims against counter-arguments and cognitive traps",
                ],
                position=3,
                knowledge_components=[f"KC_{req.domain.upper()}_SYNTHESIS", f"KC_{req.domain.upper()}_EVALUATION"],
                suggested_assignments=[
                    DraftAssignmentMilestoneSpec(
                        title="Culminating Reasoning Portfolio",
                        description="Final long-form synthesis essay defended through Socratic reasoning probes.",
                        primary_sources=["Archive Compendium", "Contemporary Debate Transcripts"],
                    )
                ],
                change_status="unchanged",
            ),
        ]

        return CourseDraftSpec(
            title=title,
            domain=req.domain,
            overview=f"Comprehensive {req.domain} course synthesized from educator materials, designed for Socratic student inquiry and autonomous reasoning development.",
            target_audience="Undergraduate",
            modules=modules,
        )

    @classmethod
    async def revise_course_draft(cls, req: CourseDraftRevisionRequest) -> CourseDraftRevisionResponse:
        """
        Applies educator critique/review comments to the current course draft in a multi-turn refinement loop.
        """
        system_prompt = (
            "You are a pedagogical course builder assistant collaborating with a university educator.\n"
            "The educator is providing review comments, critiques, additions, questions, or conversational messages.\n"
            "Guidelines:\n"
            "1. If the educator requests changes (e.g. adding/modifying/removing modules, updating learning objectives, scope, sources):\n"
            "   Update the course draft accordingly. Set change_status to 'modified' for updated modules, 'added' for new modules, and 'unchanged' for untouched modules.\n"
            "2. If the educator sends a greeting (e.g. 'hi', 'hello') or asks an exploratory question without requesting draft modifications:\n"
            "   Keep the course draft intact in 'revised_draft' (with change_status='unchanged'), and respond warmly and helpfully in 'changes_summary' explaining what you can help them refine or build.\n"
            "Respond ONLY with a JSON object strictly matching:\n"
            "{\n"
            '  "revised_draft": { ...CourseDraftSpec... },\n'
            '  "changes_summary": "Your explanation of changes or conversational response to the educator."\n'
            "}"
        )

        user_prompt = (
            f"Current Course Draft:\n{json.dumps(req.current_draft.model_dump(), indent=2)}\n\n"
            f"Educator Input / Instructions:\n{req.review_comments}\n"
        )
        if req.target_module_index is not None:
            user_prompt += f"Target Focused Module Index: {req.target_module_index}\n"

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() != "deterministic":
            provider = LiteLLMProvider.from_settings()
            comp_req = CompletionRequest(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                purpose="course_draft_revision",
                temperature=0.3,
                max_tokens=2500,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "course_draft_revision",
                        "schema": CourseDraftRevisionResponse.model_json_schema(),
                    },
                },
            )
            result = await provider.complete(comp_req)
            parsed = _extract_json_block(result.content)
            if parsed and "revised_draft" in parsed:
                revised = CourseDraftSpec.model_validate(parsed["revised_draft"])
                summary = parsed.get("changes_summary", "Updated course draft according to review comments.")
                return CourseDraftRevisionResponse(
                    revised_draft=revised,
                    changes_summary=summary,
                    revision_count=len(req.conversation_history) + 1,
                )
            elif parsed and "changes_summary" in parsed:
                return CourseDraftRevisionResponse(
                    revised_draft=req.current_draft,
                    changes_summary=parsed["changes_summary"],
                    revision_count=len(req.conversation_history) + 1,
                )
            elif result.content.strip():
                return CourseDraftRevisionResponse(
                    revised_draft=req.current_draft,
                    changes_summary=result.content.strip(),
                    revision_count=len(req.conversation_history) + 1,
                )
            else:
                raise RuntimeError("LLM returned empty revision response.")

        # Deterministic revision handling
        revised = req.current_draft.model_copy(deep=True)
        comment_lower = req.review_comments.lower()

        # Handle adding a module
        if "add module" in comment_lower or "new module" in comment_lower:
            new_pos = len(revised.modules) + 1
            mod_title = req.review_comments.split(":")[-1].strip() if ":" in req.review_comments else f"Module {new_pos}: Advanced Topics in {revised.domain}"
            revised.modules.append(
                DraftModuleSpec(
                    title=mod_title,
                    description=f"Specialized exploration addressing educator feedback: {req.review_comments}",
                    learning_objectives=[f"Analyze targeted topics in {revised.domain}", "Synthesize primary evidence"],
                    position=new_pos,
                    knowledge_components=[f"KC_{revised.domain.upper()}_EXT_{new_pos}"],
                    suggested_assignments=[
                        DraftAssignmentMilestoneSpec(
                            title=f"{mod_title} Milestone",
                            description="Inquiry assessment based on educator curriculum additions.",
                            primary_sources=["Curriculum Extension Readings"],
                        )
                    ],
                    change_status="added",
                )
            )
            summary = f"Added new module '{mod_title}' at position {new_pos} to reflect educator instructions."
        elif req.target_module_index is not None and 0 <= req.target_module_index < len(revised.modules):
            tgt = revised.modules[req.target_module_index]
            tgt.description = f"{tgt.description} [Refined: {req.review_comments}]"
            tgt.learning_objectives.append(f"Demonstrate competency in {req.review_comments[:40]}")
            tgt.change_status = "modified"
            summary = f"Updated module '{tgt.title}' with refined objectives and scope."
        else:
            # Mark first module as modified with note
            if revised.modules:
                revised.modules[0].description = f"{revised.modules[0].description} (Revised with educator feedback)"
                revised.modules[0].change_status = "modified"
            summary = f"Applied educator revision: '{req.review_comments}' across the course blueprint."

        return CourseDraftRevisionResponse(
            revised_draft=revised,
            changes_summary=summary,
            revision_count=len(req.conversation_history) + 1,
        )

    @classmethod
    async def publish_course_draft(cls, req: PublishCourseDraftRequest) -> CourseResponse:
        """
        Atomically publishes the approved course draft into the database (courses, modules, assignments)
        and indexes the curriculum content into pgvector.
        """
        draft = req.draft
        async with AsyncSessionLocal() as session:
            # 1. Insert course
            insert_course_sql = text("""
                INSERT INTO courses (title, domain, created_by, syllabus_context, created_at)
                VALUES (:title, :domain, :created_by, :syllabus_context, NOW())
                RETURNING course_id, title, domain, created_by, syllabus_context, created_at;
            """)
            c_res = await session.execute(
                insert_course_sql,
                {
                    "title": draft.title,
                    "domain": draft.domain,
                    "created_by": req.author_id,
                    "syllabus_context": draft.overview,
                },
            )
            course_row = c_res.mappings().first()
            if not course_row:
                raise RuntimeError("Failed to publish course.")
            course_id = course_row["course_id"]

            # 2. Insert modules and assignments
            for mod in draft.modules:
                insert_mod_sql = text("""
                    INSERT INTO modules (course_id, title, description, learning_objectives, position)
                    VALUES (:course_id, :title, :description, :learning_objectives, :position)
                    RETURNING module_id;
                """)
                m_res = await session.execute(
                    insert_mod_sql,
                    {
                        "course_id": course_id,
                        "title": mod.title,
                        "description": mod.description,
                        "learning_objectives": json.dumps(mod.learning_objectives),
                        "position": mod.position,
                    },
                )
                mod_row = m_res.mappings().first()
                if mod_row and mod.suggested_assignments:
                    module_id = mod_row["module_id"]
                    for assign in mod.suggested_assignments:
                        assign_spec = {
                            "status": "published",
                            "topic": assign.title,
                            "domain": draft.domain,
                            "task_brief": assign.description,
                            "allowed_sources": assign.primary_sources,
                            "learning_objectives": mod.learning_objectives,
                        }
                        insert_assign_sql = text("""
                            INSERT INTO assignments (module_id, title, spec, created_by, created_at)
                            VALUES (:module_id, :title, :spec, :created_by, NOW());
                        """)
                        await session.execute(
                            insert_assign_sql,
                            {
                                "module_id": module_id,
                                "title": assign.title,
                                "spec": json.dumps(assign_spec),
                                "created_by": req.author_id,
                            },
                        )

            await session.commit()

        # Ingest course syllabus into pgvector
        try:
            full_syllabus_text = f"# {draft.title}\n\n{draft.overview}\n\n"
            for m in draft.modules:
                full_syllabus_text += f"## {m.title}\n{m.description}\nObjectives: {', '.join(m.learning_objectives)}\n\n"

            await syllabus_parser.ingest_syllabus(
                course_id=course_id,
                content=full_syllabus_text,
                title=f"{draft.title} - Complete Curriculum",
                domain=draft.domain,
            )
        except Exception as e:  # noqa: BLE001 - publishing must survive non-critical ingestion failures.
            logger.warning(f"Syllabus vectorization during publish encountered warning: {e}")

        course_response = await course_service.get_course(course_id)
        if not course_response:
            raise RuntimeError("Course created but could not be loaded.")
        return course_response


class AssignmentAuthoringService:
    """
    AI Co-Pilot service for synthesizing, tuning, and publishing Socratic assignments.
    """

    @classmethod
    async def generate_assignment_draft(cls, req: AssignmentDraftRequest) -> AssignmentDraftSpec:
        """
        Synthesizes an AssignmentDraftSpec including 3-Rung Hint Ladder and Cognitive Traps.
        """
        context_text = f"Assignment Topic: {req.task_topic}\nDomain: {req.domain}\n"
        module_title = ""
        module_description = ""
        module_objectives: list[str] = []
        assigned_source_titles: list[str] = []
        if req.course_id:
            try:
                course = await course_service.get_course(req.course_id)
                if course:
                    context_text += f"Course: {course.title}\nCourse Overview: {course.syllabus_context or ''}\n"
                    if req.module_id:
                        module = next(
                            (item for item in course.modules if item.module_id == req.module_id),
                            None,
                        )
                        if module:
                            module_title = module.title
                            module_description = module.description or ""
                            module_objectives = module.learning_objectives or []
                            context_text += (
                                f"Module: {module.title}\n"
                                f"Module Scope: {module.description or ''}\n"
                                f"Module Learning Objectives: {', '.join(module.learning_objectives or [])}\n"
                            )
                    sources = await syllabus_parser.list_chunks(
                        course_id=req.course_id,
                        module_id=req.module_id,
                    )
                    usable_sources = [source for source in sources if syllabus_parser.has_substantive_content(source.content)]
                    assigned_source_titles = [
                        source.title or "Assigned course material" for source in (usable_sources or sources)[:5]
                    ]
                    if assigned_source_titles:
                        context_text += f"Assigned source titles: {', '.join(assigned_source_titles)}\n"
                    source_excerpts = [
                        f"- {source.title}: {source.content[:500]}"
                        for source in usable_sources[:3]
                    ]
                    if source_excerpts:
                        context_text += "Assigned source excerpts (use only these as evidence context):\n" + "\n".join(source_excerpts) + "\n"
            except Exception as error:  # noqa: BLE001 - preserve a draftable fallback without course context.
                logger.warning("Course context was unavailable for assignment drafting: %s", error)

        system_prompt = (
            "You are an expert Socratic assignment designer and learning sciences specialist. "
            "Design an inquiry-based assignment with a rigorous 3-Rung Socratic Hint Ladder: "
            "Rung 1: Orienting Question (broad conceptual steer), "
            "Rung 2: Source-bounded directional cue (directing student to specific evidence), "
            "Rung 3: Structural scaffold (step-by-step reasoning breakdown without giving the answer). "
            "Also define potential cognitive traps/misconceptions and AutoSCORE rubric criteria. "
            "The module title, learning objectives, and assigned materials are authoritative. Never substitute a different "
            "course, period, country, case, or example. Reference assigned source titles only when they are supplied. "
            "Respond ONLY with a JSON object strictly matching:\n"
            "{\n"
            '  "title": "Assignment Title",\n'
            '  "domain": "Domain",\n'
            '  "task_brief": "Detailed student prompt and challenge",\n'
            '  "context_scope": "Historical / disciplinary bounds",\n'
            '  "learning_objectives": ["Objective 1", "Objective 2"],\n'
            '  "allowed_sources": ["Source 1", "Source 2"],\n'
            '  "hint_ladder": [\n'
            '    {"rung": 1, "title": "Orienting Question", "content": "..."},\n'
            '    {"rung": 2, "title": "Source Evidence Cue", "content": "..."},\n'
            '    {"rung": 3, "title": "Structural Scaffold", "content": "..."}\n'
            "  ],\n"
            '  "cognitive_traps": [\n'
            '    {"trap_id": "TRAP_1", "name": "Trap Name", "description": "...", "remediation_hint": "..."}\n'
            "  ],\n"
            '  "rubric_criteria": ["Criterion 1", "Criterion 2"]\n'
            "}"
        )

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() != "deterministic":
            try:
                provider = LiteLLMProvider.from_settings()
                comp_req = CompletionRequest(
                    system_prompt=system_prompt,
                    user_prompt=context_text,
                    purpose="assignment_draft_synthesis",
                    temperature=0.3,
                    max_tokens=1200,
                    timeout_seconds=35.0,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": "assignment_draft",
                            "schema": AssignmentDraftSpec.model_json_schema(),
                        },
                    },
                )
                result = await provider.complete(comp_req)
                parsed = _extract_json_block(result.content)
                if not parsed or "title" not in parsed or "hint_ladder" not in parsed:
                    raise RuntimeError("The provider did not return a valid assignment draft JSON.")
                return AssignmentDraftSpec.model_validate(parsed)
            except Exception as error:  # noqa: BLE001 - an assistant proposal must remain available offline.
                logger.warning("Assignment draft generation fell back to deterministic proposal: %s", error)

        # Deterministic fallback remains specific to the selected module when the local model is unavailable.
        focus = module_title or req.task_topic
        objective_text = module_objectives or [
            f"Explain the central dynamics of {focus}",
            f"Use assigned material to develop a well-supported interpretation of {focus}",
        ]
        source_plan = assigned_source_titles or ["The assigned module materials"]
        return AssignmentDraftSpec(
            title=f"Inquiry: {focus[:80]}",
            domain=req.domain,
            task_brief=(
                f"Using the assigned materials for {focus}, develop an explanation that addresses the task: "
                f"{req.task_topic}. Select relevant evidence, explain how it supports your interpretation, "
                "and revise your response to acknowledge a meaningful limitation or alternative account."
            ),
            context_scope=module_description or f"The conceptual and historical boundaries of {focus}.",
            learning_objectives=objective_text,
            allowed_sources=source_plan,
            hint_ladder=[
                HintRungSpec(
                    rung=1,
                    title="Orienting Question",
                    content=f"Which learning objective for {focus} should guide your first reading of the assigned material?",
                ),
                HintRungSpec(
                    rung=2,
                    title="Source Evidence Cue",
                    content=f"Return to {source_plan[0]}. Which detail helps you address the task without going beyond the module's scope?",
                ),
                HintRungSpec(
                    rung=3,
                    title="Structural Scaffold",
                    content="Plan the next section around one relevant detail, your explanation of its significance, and a revision that tests its limits. Ground each step in the assigned material.",
                ),
            ],
            cognitive_traps=[
                CognitiveTrapSpec(
                    trap_id="TRAP_SINGLE_CAUSE",
                    name="Monocausal Fallacy",
                    description=f"Reducing {focus} to one isolated factor while ignoring the module's stated context.",
                    remediation_hint="Compare the selected detail with the other conditions identified in the assigned material and module objectives.",
                ),
                CognitiveTrapSpec(
                    trap_id="TRAP_ANACHRONISM",
                    name="Anachronistic Judgment",
                    description="Replacing evidence from the assigned material with assumptions that are outside the task's historical or disciplinary setting.",
                    remediation_hint="Return to the assigned source and explain what it establishes before extending the interpretation.",
                ),
            ],
            rubric_criteria=[
                f"Module alignment: demonstrates the selected learning objectives for {focus}",
                f"Evidence use: connects details from {source_plan[0]} to the task's central question",
                "Reasoning and revision: develops an explanation, tests a limitation, and improves the final response",
            ],
        )

    @classmethod
    async def propose_assignment_package(cls, req: AssignmentDraftRequest) -> AssignmentDraftPackage:
        """Generate one editable AI proposal that can be saved through the standard assignment lifecycle."""
        draft = await cls.generate_assignment_draft(req)
        source_titles = ", ".join(draft.allowed_sources[:3]) or "the assigned module materials"
        answers = {
            "Q1_TEMPORAL": draft.context_scope,
            "Q2_MISCONCEPTIONS": "; ".join(trap.description for trap in draft.cognitive_traps[:2]),
            "Q3_EVIDENCE": source_titles,
        }
        scaffold = await assignment_generator.generate_scaffolding_plan(
            ClarifyAndScaffoldRequest(
                raw_prompt=draft.task_brief,
                domain=draft.domain,
                answers=answers,
                course_id=req.course_id,
                module_id=req.module_id,
            ),
            allow_live_enhancement=False,
        )
        target_kc = scaffold.target_kcs[0]
        proposal_hints = [
            HintRung(
                level=0,
                hint_type="task_orientation",
                content=(
                    f"Read the task once, then choose which course objective you will address first: "
                    f"{draft.learning_objectives[0] if draft.learning_objectives else draft.task_brief}"
                ),
            ),
            *[
                HintRung(
                    level=item.rung,
                    hint_type=item.title.lower().replace(" ", "_"),
                    content=item.content,
                )
                for item in draft.hint_ladder[:3]
            ],
            HintRung(
                level=4,
                hint_type="educator_only",
                content="Educator-only reference support is locked and never exposed in the student workspace.",
                is_locked=True,
            ),
        ]
        try:
            rubric_req = RubricSynthesisRequest(
                title=draft.title,
                prompt=draft.task_brief,
                deliverable="Source-grounded analytical essay (750–1000 words)",
                scope=draft.context_scope,
                domain=draft.domain,
                course_id=req.course_id,
                module_id=req.module_id,
                sources=[{"title": s} for s in draft.allowed_sources],
                learning_goals=draft.learning_objectives,
            )
            rubric_resp = await cls.synthesize_assignment_rubric(rubric_req)
            proposal_rules = [
                {
                    "criterion_id": crit.criterion_id,
                    "title": crit.title,
                    "label": crit.title,
                    "description": crit.description,
                    "target_kc": target_kc,
                    "nli_threshold": 0.80,
                    "weight": crit.weight,
                    "levels": [lvl.model_dump() for lvl in crit.levels],
                    "self_review_prompt": crit.self_review_prompt,
                }
                for crit in rubric_resp.public_rubric
            ]
        except Exception as err:
            logger.warning("Falling back to default proposal rules: %s", err)
            proposal_rules = [
                {
                    "criterion_id": f"proposal_rule_{index + 1}",
                    "title": criterion.split(":", maxsplit=1)[0].strip() or f"Assignment criterion {index + 1}",
                    "label": criterion.split(":", maxsplit=1)[0].strip() or f"Assignment criterion {index + 1}",
                    "description": criterion.split(":", maxsplit=1)[-1].strip() or criterion,
                    "target_kc": target_kc,
                    "nli_threshold": 0.80,
                    "weight": 1.0,
                }
                for index, criterion in enumerate(draft.rubric_criteria[:4])
            ]

        scaffold = scaffold.model_copy(
            update={
                "hint_ladder": proposal_hints,
                "rubric_rules": proposal_rules or scaffold.rubric_rules,
                "distractor_traps": [trap.model_dump() for trap in draft.cognitive_traps] or scaffold.distractor_traps,
            }
        )
        return AssignmentDraftPackage(draft=draft, scaffold=scaffold)

    @classmethod
    async def revise_assignment_draft(cls, req: AssignmentDraftRevisionRequest) -> AssignmentDraftRevisionResponse:
        """
        Refines assignment hints, scope, traps, or rubric based on educator review feedback.
        """
        system_prompt = (
            "You are a pedagogical assistant refining an assignment draft for a university educator.\n"
            "Update the assignment specification according to the educator's review comments or handle conversational inquiries.\n"
            "If the educator provides a greeting or question without requesting draft modifications, keep the draft intact and respond warmly in 'changes_summary'.\n"
            "Respond ONLY with a JSON object strictly matching:\n"
            "{\n"
            '  "revised_draft": { ...AssignmentDraftSpec... },\n'
            '  "changes_summary": "Explanation of changes made or conversational response."\n'
            "}"
        )

        user_prompt = (
            f"Current Assignment Draft:\n{json.dumps(req.current_draft.model_dump(), indent=2)}\n\n"
            f"Educator Review Comments:\n{req.review_comments}\n"
        )

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() != "deterministic":
            provider = LiteLLMProvider.from_settings()
            comp_req = CompletionRequest(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                purpose="assignment_draft_revision",
                temperature=0.3,
                max_tokens=2000,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "assignment_draft_revision",
                        "schema": AssignmentDraftRevisionResponse.model_json_schema(),
                    },
                },
            )
            result = await provider.complete(comp_req)
            parsed = _extract_json_block(result.content)
            if parsed and "revised_draft" in parsed:
                revised = AssignmentDraftSpec.model_validate(parsed["revised_draft"])
                summary = parsed.get("changes_summary", "Updated assignment spec according to review comments.")
                return AssignmentDraftRevisionResponse(
                    revised_draft=revised,
                    changes_summary=summary,
                )
            elif parsed and "changes_summary" in parsed:
                return AssignmentDraftRevisionResponse(
                    revised_draft=req.current_draft,
                    changes_summary=parsed["changes_summary"],
                )
            elif result.content.strip():
                return AssignmentDraftRevisionResponse(
                    revised_draft=req.current_draft,
                    changes_summary=result.content.strip(),
                )
            else:
                raise RuntimeError("LLM returned empty assignment revision response.")

        # Deterministic fallback
        revised = req.current_draft.model_copy(deep=True)
        if "hint" in req.review_comments.lower() and revised.hint_ladder:
            revised.hint_ladder[0].content = f"{revised.hint_ladder[0].content} (Refined: {req.review_comments})"
        else:
            revised.task_brief = f"{revised.task_brief}\n\n[Educator Note: {req.review_comments}]"

        return AssignmentDraftRevisionResponse(
            revised_draft=revised,
            changes_summary=f"Refined assignment based on feedback: '{req.review_comments}'",
        )

    @classmethod
    async def publish_assignment_draft(cls, req: PublishAssignmentDraftRequest) -> dict[str, Any]:
        """
        Publishes the assignment draft into the target course module.
        """
        spec = {
            "status": "published",
            "topic": req.draft.title,
            "domain": req.draft.domain,
            "task_brief": req.draft.task_brief,
            "context_scope": req.draft.context_scope,
            "learning_objectives": req.draft.learning_objectives,
            "allowed_sources": req.draft.allowed_sources,
            "hint_ladder": [h.model_dump() for h in req.draft.hint_ladder],
            "cognitive_traps": [t.model_dump() for t in req.draft.cognitive_traps],
            "rubric_criteria": req.draft.rubric_criteria,
            "created_by": req.author_id,
        }

        insert_sql = text("""
            INSERT INTO assignments (module_id, title, spec, created_by, created_at)
            VALUES (:module_id, :title, :spec, :created_by, NOW())
            RETURNING assignment_id, module_id, title, spec, created_at;
        """)

        async with AsyncSessionLocal() as session:
            res = await session.execute(
                insert_sql,
                {
                    "module_id": str(req.module_id),
                    "title": req.draft.title,
                    "spec": json.dumps(spec),
                    "created_by": req.author_id,
                },
            )
            row = res.mappings().first()
            if not row:
                raise RuntimeError("Failed to insert published assignment.")
            await session.commit()

        return {
            "assignment_id": str(row["assignment_id"]),
            "module_id": str(row["module_id"]),
            "course_id": str(req.course_id),
            "title": row["title"],
            "status": "published",
            "spec": spec,
        }

    @classmethod
    async def synthesize_assignment_rubric(cls, req: RubricSynthesisRequest) -> RubricSynthesisResponse:
        """Synthesize rich, concept-grounded grading criteria bound directly to course module objectives and KCs."""
        # 1. Resolve source titles for grounding context
        context_sources: list[str] = [
            s.get("title") or s.get("citation") or "Assigned reading"
            for s in req.sources
            if isinstance(s, dict) and (s.get("title") or s.get("citation"))
        ]

        # 2. Resolve module objectives and target concepts
        objectives = [o.strip() for o in req.module_objectives if o.strip()]
        concepts: list[dict[str, Any]] = req.target_concepts[:]

        if req.course_id and (not context_sources or not objectives or not concepts):
            try:
                course = await course_service.get_course(req.course_id)
                if course and course.modules:
                    mod = next((m for m in course.modules if str(m.module_id) == str(req.module_id)), None) if req.module_id else course.modules[0]
                    if mod:
                        if not objectives and mod.learning_objectives:
                            objectives = [o.strip() for o in mod.learning_objectives if o.strip()]
                        if not concepts and mod.knowledge_components:
                            concepts = [
                                {
                                    "kc_id": k if isinstance(k, str) else k.get("kc_id"),
                                    "label": (k if isinstance(k, str) else k.get("label", "")).replace("KC_HIST_", "").replace("KC_", "").replace("_", " ").title(),
                                }
                                for k in mod.knowledge_components
                            ]
                if not context_sources:
                    sources = await syllabus_parser.list_chunks(course_id=req.course_id, module_id=req.module_id)
                    usable = [s for s in sources if syllabus_parser.has_substantive_content(s.content)]
                    context_sources = [s.title for s in (usable or sources)[:4] if s.title]
            except Exception as e:
                logger.debug("Could not retrieve course context for concept rubric synthesis: %s", e)

        sources_text = ", ".join(context_sources) if context_sources else "the assigned course documents and readings"
        src_lead = context_sources[0] if context_sources else "assigned primary course texts"
        scope_lead = req.scope or "the designated module chronological and institutional boundaries"

        # 3. Try live LLM provider if available
        if settings.FIOSRA_LLM_PROVIDER.strip().lower() != "deterministic":
            try:
                system_prompt = (
                    "You are an expert university pedagogical assessment designer and learning sciences specialist. "
                    "Your role is to author an authentic, concept-grounded grading rubric for a university inquiry assignment.\n"
                    "CRITICAL REQUIREMENT: The rubric criteria MUST directly map to the course concepts and module learning objectives.\n"
                    "Do NOT generate generic writing skills (never use generic titles like 'Evidence Use', 'Module Alignment', or 'Argumentative Clarity').\n"
                    "For EACH target concept / module objective, generate ONE dedicated criterion whose title, standard description, and 3-level performance descriptors (Developing, Secure, Strong) specifically evaluate student understanding and evidence use for THAT concept.\n\n"
                    "Format your response strictly as a JSON object matching:\n"
                    "{\n"
                    '  "learning_goals": ["Specific goal 1", "Specific goal 2"],\n'
                    '  "public_rubric": [\n'
                    '    {\n'
                    '      "criterion_id": "crit_1",\n'
                    '      "concept_id": "KC_ID_IF_PROVIDED",\n'
                    '      "concept_label": "Concept Name",\n'
                    '      "title": "Concept: Specific Concept Standard Title",\n'
                    '      "description": "Clear explanation of how the student must demonstrate this specific concept using course evidence.",\n'
                    '      "weight": 35.0,\n'
                    '      "levels": [\n'
                    '        {"level_id": "developing", "label": "Developing", "description": "Common misconceptions or superficial explanations specific to this concept."},\n'
                    '        {"level_id": "secure", "label": "Secure", "description": "Concrete explanation of proficient student work with proper evidence citations on this concept."},\n'
                    '        {"level_id": "strong", "label": "Strong", "description": "Concrete explanation of masterful, nuanced analysis synthesizing this concept."}\n'
                    '      ],\n'
                    '      "self_review_prompt": "Reflective question for the student about this concept."\n'
                    '    }\n'
                    '  ]\n'
                    "}\n"
                    "Generate 2 to 4 criteria matching the provided concepts, whose weights sum to 100."
                )

                concepts_desc = "\n".join(f"- {c.get('kc_id')}: {c.get('label')}" for c in concepts) if concepts else "Extract concepts from objectives"
                objectives_desc = "\n".join(f"- {obj}" for obj in objectives) if objectives else req.prompt

                user_prompt = (
                    f"Assignment Title: {req.title}\n"
                    f"Discipline/Domain: {req.domain}\n"
                    f"Inquiry Prompt: {req.prompt}\n"
                    f"Deliverable: {req.deliverable}\n"
                    f"Scope & Chronology: {req.scope}\n"
                    f"Target Course Concepts:\n{concepts_desc}\n"
                    f"Module Learning Objectives:\n{objectives_desc}\n"
                    f"Assigned Primary Sources: {sources_text}\n"
                )

                provider = LiteLLMProvider.from_settings()
                comp_req = CompletionRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    purpose="rubric_synthesis",
                    temperature=0.3,
                    max_tokens=1500,
                    timeout_seconds=30.0,
                )
                result = await provider.complete(comp_req)
                parsed = _extract_json_block(result.content)
                if parsed and "public_rubric" in parsed and isinstance(parsed["public_rubric"], list):
                    raw_criteria = parsed["public_rubric"]
                    if len(raw_criteria) >= 2:
                        criteria: list[PublicRubricCriterion] = []
                        total_w = sum(float(c.get("weight", 0)) for c in raw_criteria) or 100.0
                        allocated = 0.0
                        for idx, c in enumerate(raw_criteria):
                            w = round((float(c.get("weight", 0)) / total_w) * 100, 2)
                            if idx == len(raw_criteria) - 1:
                                w = round(100.0 - allocated, 2)
                            allocated += w
                            levels = [
                                RubricLevel(
                                    level_id=lvl.get("level_id", "secure"),
                                    label=lvl.get("label", lvl.get("level_id", "Secure").capitalize()),
                                    description=lvl.get("description", "Meets standard."),
                                )
                                for lvl in c.get("levels", [])
                            ]
                            if len(levels) < 3:
                                levels = [
                                    RubricLevel(level_id="developing", label="Developing", description=f"Needs clearer evidence and elaboration for {c.get('title', 'this standard')}."),
                                    RubricLevel(level_id="secure", label="Secure", description=f"Demonstrates {c.get('title', 'this standard')} with citations and clear explanation."),
                                    RubricLevel(level_id="strong", label="Strong", description=f"Masterful, nuanced execution of {c.get('title', 'this standard')} with deep analytical insight."),
                                ]
                            crit_title = c.get("title") or f"Standard {idx + 1}"
                            c_id = c.get("concept_id") or (concepts[idx]["kc_id"] if idx < len(concepts) else None)
                            c_label = c.get("concept_label") or (concepts[idx]["label"] if idx < len(concepts) else None)
                            criteria.append(
                                PublicRubricCriterion(
                                    criterion_id=c.get("criterion_id") or f"crit_{idx + 1}",
                                    title=crit_title,
                                    concept_id=c_id,
                                    concept_label=c_label,
                                    description=c.get("description", f"Demonstrates analytical standard for {crit_title}."),
                                    weight=w,
                                    levels=levels,
                                    self_review_prompt=c.get("self_review_prompt") or f"Where does your completed response demonstrate {crit_title.lower()}?",
                                )
                            )
                        return RubricSynthesisResponse(
                            public_rubric=criteria,
                            learning_goals=parsed.get("learning_goals", objectives or req.learning_goals),
                        )
            except Exception as e:
                logger.warning("LLM rubric synthesis fell back to dynamic concept-grounded generation: %s", e)

        # 4. Dynamic Concept-Grounded Synthesis Fallback
        # Clean topic text for customized rubric descriptors
        topic_phrase = req.title.strip() or "Course Inquiry"
        if topic_phrase.lower().startswith("inquiry:"):
            topic_phrase = topic_phrase.split(":", 1)[-1].strip()
        if len(topic_phrase) < 5 and req.prompt:
            topic_phrase = req.prompt[:80].strip()

        # Build concept-tied criteria directly from module objectives & KCs
        fallback_criteria: list[PublicRubricCriterion] = []

        # Determine 3 concept focus areas from objectives / KCs / topic
        c1_label = concepts[0]["label"] if len(concepts) > 0 else "Source Evidentiary Grounding"
        c1_id = concepts[0]["kc_id"] if len(concepts) > 0 else "KC_HIST_SOURCE_ANALYSIS"
        c1_obj = objectives[0] if len(objectives) > 0 else f"Analyze primary source evidence regarding {topic_phrase}"

        c2_label = concepts[1]["label"] if len(concepts) > 1 else "Causal Analysis & Institutional Dynamics"
        c2_id = concepts[1]["kc_id"] if len(concepts) > 1 else "KC_HIST_CAUSAL_MECHANISMS"
        c2_obj = objectives[1] if len(objectives) > 1 else f"Explain institutional mechanisms shaping {topic_phrase}"

        c3_label = concepts[2]["label"] if len(concepts) > 2 else "Historiographical Synthesis & Thesis Defensibility"
        c3_id = concepts[2]["kc_id"] if len(concepts) > 2 else "KC_HIST_HISTORIOGRAPHY"
        c3_obj = objectives[2] if len(objectives) > 2 else f"Formulate a defensible thesis addressing {topic_phrase}"

        fallback_criteria = [
            PublicRubricCriterion(
                criterion_id="crit_concept_1",
                concept_id=c1_id,
                concept_label=c1_label,
                title=f"Concept: {c1_label}",
                description=f"Directly examines authentic evidence from {sources_text} to evaluate: {c1_obj}.",
                weight=40.0,
                levels=[
                    RubricLevel(
                        level_id="developing",
                        label="Developing",
                        description=f"Treats {c1_label} descriptively; claims about {topic_phrase} lack direct citations or misinterpret assigned material from {src_lead}.",
                    ),
                    RubricLevel(
                        level_id="secure",
                        label="Secure",
                        description=f"Accurately demonstrates understanding of {c1_label}, substantiating arguments with relevant citations from {src_lead}.",
                    ),
                    RubricLevel(
                        level_id="strong",
                        label="Strong",
                        description=f"Masterfully synthesizes evidence on {c1_label}; interrogates source perspectives and corroborates multiple documents to build an authoritative interpretation.",
                    ),
                ],
                self_review_prompt=f"Where in your response have you directly cited evidence analyzing {c1_label.lower()}?",
            ),
            PublicRubricCriterion(
                criterion_id="crit_concept_2",
                concept_id=c2_id,
                concept_label=c2_label,
                title=f"Concept: {c2_label}",
                description=f"Explains the interacting institutional, political, and material mechanisms underlying {c2_obj} within {scope_lead}.",
                weight=35.0,
                levels=[
                    RubricLevel(
                        level_id="developing",
                        label="Developing",
                        description=f"Adopts a simplistic or monocausal view of {c2_label}; asserts events occurred without explaining underlying institutional dynamics.",
                    ),
                    RubricLevel(
                        level_id="secure",
                        label="Secure",
                        description=f"Clearly articulates how structural, institutional, and socio-economic factors shaped {c2_label} in {scope_lead}.",
                    ),
                    RubricLevel(
                        level_id="strong",
                        label="Strong",
                        description=f"Delivers a sophisticated analysis of competing factors, institutional shifts, and historical consequences regarding {c2_label}.",
                    ),
                ],
                self_review_prompt=f"Have you articulated the structural and causal mechanisms driving {c2_label.lower()}?",
            ),
            PublicRubricCriterion(
                criterion_id="crit_concept_3",
                concept_id=c3_id,
                concept_label=c3_label,
                title=f"Concept: {c3_label}",
                description=f"Constructs a coherent, defensible thesis that synthesizes {c3_obj} into a logically organized {req.deliverable}.",
                weight=25.0,
                levels=[
                    RubricLevel(
                        level_id="developing",
                        label="Developing",
                        description=f"Thesis on {c3_label} is vague or descriptive rather than analytical; paragraphs wander without advancing a sustained line of reasoning.",
                    ),
                    RubricLevel(
                        level_id="secure",
                        label="Secure",
                        description=f"Presents a clearly formulated, defensible thesis supported by a logical progression of analytical claims addressing {c3_label}.",
                    ),
                    RubricLevel(
                        level_id="strong",
                        label="Strong",
                        description=f"Constructs an authoritative analytical argument that anticipates counter-evidence and achieves conceptual synthesis across the inquiry.",
                    ),
                ],
                self_review_prompt=f"Is your thesis statement defensible and maintained consistently across your analysis of {c3_label.lower()}?",
            ),
        ]

        goals = objectives or req.learning_goals or [
            f"Demonstrate mastery of {c1_label} supported by authentic source citations.",
            f"Analyze the institutional mechanisms governing {c2_label}.",
            f"Formulate a defensible thesis addressing {c3_label}.",
        ]

        return RubricSynthesisResponse(
            public_rubric=fallback_criteria,
            learning_goals=goals,
        )


course_authoring_service = CourseAuthoringService()
assignment_authoring_service = AssignmentAuthoringService()
