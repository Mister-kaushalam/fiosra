import hashlib
import logging
import math
import re
from typing import Any

from fiosra.mvp.concepts.schemas import (
    CompletenessStats,
    ConceptGraphProposal,
    ConceptProposalNode,
    MisconceptionProposal,
    PrerequisiteProposal,
    SocraticProbeProposal,
)

logger = logging.getLogger(__name__)


def compute_embedding(text: str, dimensions: int = 1536) -> list[float]:
    """
    Generates a unit-normalized vector embedding using token & subword n-gram feature hashing.
    Provides deterministic, semantically grounded vector representations where shared vocabulary
    and semantic phrasing produce high cosine similarity.
    """
    vec = [0.0] * dimensions
    clean_text = re.sub(r"[^\w\s]", " ", text.lower())
    words = [w for w in clean_text.split() if w]
    if not words:
        return [0.0] * dimensions

    tokens = list(words)
    for i in range(len(words) - 1):
        tokens.append(f"{words[i]}_{words[i+1]}")
    for w in words:
        if len(w) >= 4:
            for j in range(len(w) - 3):
                tokens.append(f"#{w[j:j+4]}")

    for token in tokens:
        h = int(hashlib.sha256(token.encode("utf-8")).hexdigest()[:8], 16)
        dim = h % dimensions
        sign = 1.0 if (h >> 31) & 1 else -1.0
        vec[dim] += sign

    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [round(x / norm, 6) for x in vec]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Computes cosine similarity between two unit-normalized vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    return max(-1.0, min(1.0, dot_product))


class ConceptEntityResolver:
    """Discovers semantic duplicates across extracted concept proposals and merges them into a clean DAG."""

    def __init__(self, similarity_threshold: float = 0.85) -> None:
        self.similarity_threshold = similarity_threshold

    def resolve_proposal(
        self,
        proposal: ConceptGraphProposal,
        similarity_threshold: float | None = None,
    ) -> tuple[ConceptGraphProposal, dict[str, str]]:
        """
        Clusters synonym/duplicate concepts by semantic embedding similarity, merges them,
        and re-maps hierarchical parent links and prerequisite DAG dependencies.
        Returns the resolved ConceptGraphProposal and an ID remap dictionary.
        """
        threshold = similarity_threshold if similarity_threshold is not None else self.similarity_threshold
        raw_concepts = list(proposal.concepts)
        if len(raw_concepts) <= 1:
            return proposal, {}

        # 1. Compute embeddings for each concept
        embeddings: dict[str, list[float]] = {}
        for c in raw_concepts:
            text_rep = f"{c.label}: {c.definition}"
            embeddings[c.proposal_id] = compute_embedding(text_rep)

        # 2. Pairwise similarity clustering within the same concept level
        clusters: list[list[ConceptProposalNode]] = []
        assigned_ids: set[str] = set()

        for i, node_a in enumerate(raw_concepts):
            if node_a.proposal_id in assigned_ids:
                continue
            current_cluster = [node_a]
            assigned_ids.add(node_a.proposal_id)

            vec_a = embeddings[node_a.proposal_id]
            for j in range(i + 1, len(raw_concepts)):
                node_b = raw_concepts[j]
                if node_b.proposal_id in assigned_ids:
                    continue

                # Match if same hierarchical level and high semantic similarity
                if node_a.level == node_b.level:
                    sim = cosine_similarity(vec_a, embeddings[node_b.proposal_id])
                    # Also check for near-exact string title matches
                    label_a_clean = re.sub(r"[^a-z0-9]", "", node_a.label.lower())
                    label_b_clean = re.sub(r"[^a-z0-9]", "", node_b.label.lower())
                    is_exact_label = label_a_clean == label_b_clean or label_a_clean in label_b_clean or label_b_clean in label_a_clean

                    if sim >= threshold or (is_exact_label and sim >= 0.70):
                        current_cluster.append(node_b)
                        assigned_ids.add(node_b.proposal_id)

            clusters.append(current_cluster)

        # 3. Merge clusters into canonical concepts and build ID remap
        id_remap: dict[str, str] = {}
        canonical_concepts: list[ConceptProposalNode] = []

        for cluster in clusters:
            if len(cluster) == 1:
                canonical = cluster[0]
                id_remap[canonical.proposal_id] = canonical.proposal_id
                canonical_concepts.append(canonical)
                continue

            # Sort cluster: prioritize node with longer definition / richest misconceptions
            cluster.sort(
                key=lambda x: (len(x.misconceptions), len(x.definition), len(x.label)),
                reverse=True,
            )
            canonical = cluster[0]
            canonical_id = canonical.proposal_id

            all_aliases = list(canonical.aliases or [])
            combined_positions = set(canonical.module_positions or [])
            combined_evidence_chunks = set(canonical.evidence_chunk_ids or [])
            existing_misc_names = {m.name.lower() for m in canonical.misconceptions}
            combined_misconceptions: list[MisconceptionProposal] = list(canonical.misconceptions)

            for secondary in cluster[1:]:
                id_remap[secondary.proposal_id] = canonical_id
                if secondary.label.lower() != canonical.label.lower() and secondary.label not in all_aliases:
                    all_aliases.append(secondary.label)
                for alias in secondary.aliases or []:
                    if alias not in all_aliases and alias.lower() != canonical.label.lower():
                        all_aliases.append(alias)
                combined_positions.update(secondary.module_positions or [])
                combined_evidence_chunks.update(secondary.evidence_chunk_ids or [])

                for m in secondary.misconceptions:
                    if m.name.lower() not in existing_misc_names:
                        combined_misconceptions.append(m)
                        existing_misc_names.add(m.name.lower())

            id_remap[canonical.proposal_id] = canonical_id
            merged_node = ConceptProposalNode(
                proposal_id=canonical.proposal_id,
                label=canonical.label,
                definition=canonical.definition,
                concept_type=canonical.concept_type,
                level=canonical.level,
                bloom_level=canonical.bloom_level,
                parent_proposal_id=canonical.parent_proposal_id,
                module_positions=sorted(list(combined_positions)) or [1],
                module_role=canonical.module_role,
                misconceptions=combined_misconceptions,
                aliases=all_aliases[:10],
                evidence_chunk_ids=sorted(list(combined_evidence_chunks))[:16],
            )
            canonical_concepts.append(merged_node)

        # 4. Re-map parent links
        valid_canonical_ids = {c.proposal_id for c in canonical_concepts}
        root_id = next((c.proposal_id for c in canonical_concepts if c.level == "course_theme"), canonical_concepts[0].proposal_id)

        for c in canonical_concepts:
            if c.parent_proposal_id:
                remapped_parent = id_remap.get(c.parent_proposal_id, c.parent_proposal_id)
                if remapped_parent not in valid_canonical_ids or remapped_parent == c.proposal_id:
                    c.parent_proposal_id = root_id if c.proposal_id != root_id else None
                else:
                    c.parent_proposal_id = remapped_parent
            elif c.proposal_id != root_id and c.level != "course_theme":
                c.parent_proposal_id = root_id

        # 5. Re-map and deduplicate prerequisite dependencies
        remapped_prereqs: list[PrerequisiteProposal] = []
        seen_edges: set[tuple[str, str]] = set()

        for prereq in proposal.prerequisites:
            src = id_remap.get(prereq.prerequisite_proposal_id, prereq.prerequisite_proposal_id)
            tgt = id_remap.get(prereq.dependent_proposal_id, prereq.dependent_proposal_id)

            if src in valid_canonical_ids and tgt in valid_canonical_ids and src != tgt:
                edge_key = (src, tgt)
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    remapped_prereqs.append(
                        PrerequisiteProposal(
                            prerequisite_proposal_id=src,
                            dependent_proposal_id=tgt,
                            rationale=prereq.rationale,
                        )
                    )

        resolved_proposal = ConceptGraphProposal(
            course_rationale=proposal.course_rationale,
            concepts=canonical_concepts,
            prerequisites=remapped_prereqs,
        )
        return resolved_proposal, id_remap


class CompletenessChecker:
    """Analyzes curriculum coverage, learning objective mapping, and identifies ungrounded content gaps."""

    @staticmethod
    def evaluate_completeness(
        course: Any,
        proposal: ConceptGraphProposal,
        syllabus_chunks: list[dict[str, Any]] | None = None,
        ungrounded_threshold: float = 0.55,
    ) -> CompletenessStats:
        """
        Calculates coverage statistics across modules, learning objectives, and primary source chunks.
        """
        all_modules = list(course.modules) if hasattr(course, "modules") and course.modules else []
        total_modules = max(1, len(all_modules))

        # Check module coverage
        covered_module_positions: set[int] = set()
        for concept in proposal.concepts:
            for pos in concept.module_positions:
                covered_module_positions.add(pos)
        module_positions_in_course = {m.position for m in all_modules} if all_modules else {1}
        covered_modules_count = len(module_positions_in_course.intersection(covered_module_positions))
        module_coverage_pct = round((covered_modules_count / total_modules) * 100.0, 1)

        # Check learning objective coverage
        all_objectives: list[str] = []
        for m in all_modules:
            for obj in (m.learning_objectives or []):
                if str(obj).strip():
                    all_objectives.append(str(obj).strip())

        mapped_objectives_count = 0
        concept_texts = [f"{c.label} {c.definition}".lower() for c in proposal.concepts]
        for obj in all_objectives:
            obj_clean = obj.lower()
            obj_words = set(re.findall(r"[a-z0-9]{4,}", obj_clean))
            is_mapped = False
            for c_text in concept_texts:
                if any(word in c_text for word in obj_words) or obj_clean in c_text:
                    is_mapped = True
                    break
            if is_mapped:
                mapped_objectives_count += 1

        objective_coverage_pct = (
            round((mapped_objectives_count / max(1, len(all_objectives))) * 100.0, 1)
            if all_objectives
            else 100.0
        )

        # Check source chunk grounding & identify unmapped chunks
        unmapped_chunk_ids: list[str] = []
        grounded_chunk_count = 0
        total_chunks = len(syllabus_chunks) if syllabus_chunks else 0

        if syllabus_chunks and proposal.concepts:
            concept_embeddings = [
                compute_embedding(f"{c.label}: {c.definition}")
                for c in proposal.concepts
            ]

            for chunk in syllabus_chunks:
                chunk_id = str(chunk.get("chunk_id", ""))
                chunk_text = str(chunk.get("content") or chunk.get("title") or "")
                chunk_vec = chunk.get("embedding")
                if not isinstance(chunk_vec, list) or len(chunk_vec) != 1536:
                    chunk_vec = compute_embedding(chunk_text)

                max_sim = max(
                    (cosine_similarity(chunk_vec, c_vec) for c_vec in concept_embeddings),
                    default=0.0,
                )

                if max_sim >= ungrounded_threshold:
                    grounded_chunk_count += 1
                else:
                    unmapped_chunk_ids.append(chunk_id)

        evidence_recall_pct = (
            round((grounded_chunk_count / max(1, total_chunks)) * 100.0, 1)
            if total_chunks > 0
            else 100.0
        )

        is_complete = module_coverage_pct >= 90.0 and objective_coverage_pct >= 75.0 and evidence_recall_pct >= 70.0

        return CompletenessStats(
            module_coverage_pct=module_coverage_pct,
            objective_coverage_pct=objective_coverage_pct,
            evidence_recall_pct=evidence_recall_pct,
            total_concepts=len(proposal.concepts),
            total_prerequisites=len(proposal.prerequisites),
            unmapped_chunk_ids=unmapped_chunk_ids[:20],
            is_complete=is_complete,
        )
