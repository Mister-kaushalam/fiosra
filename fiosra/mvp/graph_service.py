import logging
from typing import Any

from fiosra.mvp.neo4j_client import Neo4jClient, neo4j_client

logger = logging.getLogger(__name__)


class GraphService:
    """
    Curriculum & Pedagogical Knowledge Graph service operating directly on Neo4j 5.
    Provides async prerequisite traversal, learning frontier discovery,
    schema constraints management, misconception diagnostic lookup, and student state tracking.
    """

    def __init__(self, client: Neo4jClient | None = None) -> None:
        self.client = client or neo4j_client

    async def search_misconceptions(self, query: str = "", kc_id: str = "*", limit: int = 3) -> list[dict[str, Any]]:
        """
        Searches native Misconception nodes linked to Knowledge Components in Neo4j.
        Returns matching cognitive traps and their associated Socratic probes.
        """
        cypher = """
        MATCH (m:Misconception)
        WHERE ($kc_id = '*' OR m.kc_id = $kc_id)
          AND coalesce(m.status, 'approved') = 'approved'
          AND ($query = '' OR toLower(m.name) CONTAINS toLower($query) 
               OR toLower(m.flawed_rule) CONTAINS toLower($query)
               OR toLower(coalesce(m.remediation_hint, '')) CONTAINS toLower($query))
        OPTIONAL MATCH (m)-[:PROBED_BY]->(p:SocraticProbe)
        WHERE coalesce(p.status, 'approved') = 'approved'
        RETURN m.misconception_id AS misconception_id,
               m.kc_id AS kc_id,
               m.name AS name,
               m.flawed_rule AS flawed_rule,
               m.remediation_hint AS remediation_hint,
               collect(DISTINCT p { .probe_id, .rung, .probe_text, .rationale }) AS probes
        LIMIT $limit
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher, {"kc_id": kc_id, "query": query, "limit": limit})
            records = [dict(record) for record in await result.data()]
        return records

    async def init_schema(self) -> None:
        """
        Initializes uniqueness constraints and performance indices for the expanded pedagogical ontology in Neo4j.
        """
        queries = [
            # Course & Module constraints
            "CREATE CONSTRAINT course_id_unique IF NOT EXISTS FOR (c:Course) REQUIRE c.course_id IS UNIQUE",
            "CREATE CONSTRAINT module_id_unique IF NOT EXISTS FOR (m:Module) REQUIRE m.module_id IS UNIQUE",
            # Pedagogical Knowledge Component & Misconception constraints
            "CREATE CONSTRAINT kc_id_unique IF NOT EXISTS FOR (k:KnowledgeComponent) REQUIRE k.kc_id IS UNIQUE",
            "CREATE CONSTRAINT misconception_id_unique IF NOT EXISTS FOR (m:Misconception) REQUIRE m.misconception_id IS UNIQUE",
            "CREATE CONSTRAINT probe_id_unique IF NOT EXISTS FOR (p:SocraticProbe) REQUIRE p.probe_id IS UNIQUE",
            # Assessment & Question constraints
            "CREATE CONSTRAINT assignment_id_unique IF NOT EXISTS FOR (a:Assignment) REQUIRE a.assignment_id IS UNIQUE",
            "CREATE CONSTRAINT question_id_unique IF NOT EXISTS FOR (q:Question) REQUIRE q.question_id IS UNIQUE",
            # Student & Session tracking constraints
            "CREATE CONSTRAINT student_id_unique IF NOT EXISTS FOR (s:Student) REQUIRE s.student_id IS UNIQUE",
            "CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (sess:TutoringSession) REQUIRE sess.session_id IS UNIQUE",
            # Indices for traversal performance
            "CREATE INDEX kc_domain_idx IF NOT EXISTS FOR (k:KnowledgeComponent) ON (k.domain)",
            "CREATE INDEX misconception_kc_idx IF NOT EXISTS FOR (m:Misconception) ON (m.kc_id)",
        ]
        async with self.client.get_session() as session:
            for q in queries:
                await session.run(q)
        logger.info("Neo4j expanded pedagogical ontology constraints and indices initialized.")

    async def seed_curriculum(self, kcs: list[dict[str, Any]]) -> dict[str, int]:
        """
        Upserts Knowledge Components and their prerequisite DAG edges into Neo4j.
        Returns counts of seeded nodes and edges.
        """
        await self.init_schema()

        # 1. Upsert nodes
        upsert_nodes_cypher = """
        UNWIND $kcs AS item
        MERGE (k:KnowledgeComponent {kc_id: item.kc_id})
        SET k.label = item.label,
            k.domain = item.domain,
            k.bloom_level = item.bloom_level,
            k.description = item.description,
            k.estimated_difficulty = item.estimated_difficulty
        RETURN count(k) AS total_nodes
        """

        # 2. Extract edge list: (target_kc_id, prerequisite_id)
        edges = []
        for item in kcs:
            target_id = item["kc_id"]
            for prereq_id in item.get("prerequisite_ids", []):
                edges.append({"target_id": target_id, "prereq_id": prereq_id})

        upsert_edges_cypher = """
        UNWIND $edges AS edge
        MATCH (target:KnowledgeComponent {kc_id: edge.target_id})
        MATCH (prereq:KnowledgeComponent {kc_id: edge.prereq_id})
        MERGE (target)-[r:REQUIRES]->(prereq)
        RETURN count(r) AS total_edges
        """

        async with self.client.get_session() as session:
            await session.run(upsert_nodes_cypher, {"kcs": kcs})
            if edges:
                await session.run(upsert_edges_cypher, {"edges": edges})

        return {"nodes_seeded": len(kcs), "edges_seeded": len(edges)}

    async def get_prerequisites(self, kc_id: str, depth: int = 10) -> list[str]:
        """
        Returns all prerequisite KC IDs (transitive dependencies) required before kc_id.
        """
        cypher = f"""
        MATCH path=(target:KnowledgeComponent {{kc_id: $kc_id}})-[:REQUIRES*1..{depth}]->(prereq:KnowledgeComponent)
        WHERE all(n IN nodes(path) WHERE coalesce(n.status, 'approved') = 'approved')
        RETURN DISTINCT prereq.kc_id AS prereq_id
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher, {"kc_id": kc_id})
            records = await result.data()
            return [r["prereq_id"] for r in records]

    async def get_learning_frontier(
        self,
        mastered_kc_ids: list[str],
        domain: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Calculates the student's optimal Learning Frontier.
        Returns all unmastered KCs whose prerequisites are completely satisfied
        by the set of mastered_kc_ids.
        """
        cypher = """
        MATCH (k:KnowledgeComponent)
        WHERE NOT k.kc_id IN $mastered_kc_ids
          AND coalesce(k.status, 'approved') = 'approved'
          AND ($domain IS NULL OR k.domain = $domain)
        OPTIONAL MATCH (k)-[:REQUIRES]->(p:KnowledgeComponent)
        WITH k, collect(p.kc_id) AS required_prereqs
        WHERE all(p_id IN required_prereqs WHERE p_id IN $mastered_kc_ids)
        RETURN k.kc_id AS kc_id,
               k.label AS label,
               k.domain AS domain,
               k.bloom_level AS bloom_level,
               k.course_id AS course_id,
               k.description AS description,
               k.estimated_difficulty AS estimated_difficulty,
               required_prereqs
        ORDER BY k.estimated_difficulty ASC, k.bloom_level ASC
        """
        async with self.client.get_session() as session:
            result = await session.run(
                cypher,
                {"mastered_kc_ids": mastered_kc_ids, "domain": domain},
            )
            return await result.data()

    async def check_acyclicity(self) -> bool:
        """
        Validates that the prerequisite graph contains zero directed cycles.
        Returns True if the graph is a strict DAG, False if cycles exist.
        """
        cypher = """
        MATCH path = (k:KnowledgeComponent)-[:REQUIRES*1..20]->(k)
        RETURN count(path) = 0 AS is_acyclic
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher)
            record = await result.single()
            return bool(record["is_acyclic"]) if record else True

    async def get_kc_details(self, kc_id: str) -> dict[str, Any] | None:
        """
        Fetches a single KC node with its direct prerequisites and direct dependents.
        """
        cypher = """
        MATCH (k:KnowledgeComponent {kc_id: $kc_id})
        WHERE coalesce(k.status, 'approved') = 'approved'
        OPTIONAL MATCH (k)-[:REQUIRES]->(prereq:KnowledgeComponent)
        WHERE coalesce(prereq.status, 'approved') = 'approved'
        OPTIONAL MATCH (dependent:KnowledgeComponent)-[:REQUIRES]->(k)
        WHERE coalesce(dependent.status, 'approved') = 'approved'
        RETURN k.kc_id AS kc_id,
               k.label AS label,
               k.domain AS domain,
               k.bloom_level AS bloom_level,
               k.course_id AS course_id,
               k.description AS description,
               k.estimated_difficulty AS estimated_difficulty,
               collect(DISTINCT prereq.kc_id) AS direct_prerequisites,
               collect(DISTINCT dependent.kc_id) AS direct_dependents
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher, {"kc_id": kc_id})
            record = await result.single()
            if not record or record["kc_id"] is None:
                return None
            return dict(record)

    async def list_all_kcs(self, domain: str | None = None) -> list[dict[str, Any]]:
        """
        Lists all Knowledge Components optionally filtered by domain.
        """
        cypher = """
        MATCH (k:KnowledgeComponent)
        WHERE ($domain IS NULL OR toLower(k.domain) = toLower($domain))
        AND coalesce(k.status, 'approved') <> 'superseded'
        RETURN k.kc_id AS kc_id,
               k.label AS label,
               k.domain AS domain,
               k.course_id AS course_id,
               k.description AS description
        ORDER BY k.kc_id ASC
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher, {"domain": domain})
            return await result.data()

    async def record_student_attempt(self, student_id: str, question_id: str, session_id: str | None = None) -> None:
        """Records a student's attempt on a question in the pedagogical graph."""
        cypher = """
        MERGE (s:Student {student_id: $student_id})
        MERGE (q:Question {question_id: $question_id})
        MERGE (s)-[r:ATTEMPTED]->(q)
        SET r.last_attempted_at = datetime(),
            r.session_id = $session_id
        """
        async with self.client.get_session() as session:
            await session.run(cypher, {"student_id": student_id, "question_id": question_id, "session_id": session_id})

    async def record_probe_delivery(self, session_id: str, probe_id: str, student_id: str | None = None) -> None:
        """Records a Socratic probe delivery during a tutoring session."""
        cypher = """
        MERGE (sess:TutoringSession {session_id: $session_id})
        MERGE (p:SocraticProbe {probe_id: $probe_id})
        MERGE (sess)-[r:DELIVERED_DURING]->(p)
        SET r.delivered_at = datetime()
        WITH sess, p
        FOREACH (_ IN CASE WHEN $student_id IS NULL THEN [] ELSE [1] END |
            MERGE (s:Student {student_id: $student_id})
            MERGE (s)-[:ATTEMPTED]->(p)
        )
        """
        async with self.client.get_session() as session:
            await session.run(cypher, {"session_id": session_id, "probe_id": probe_id, "student_id": student_id})

    async def record_student_belief(self, student_id: str, misconception_id: str) -> None:
        """Marks that a student exhibits a specific reasoning misconception trap."""
        cypher = """
        MERGE (s:Student {student_id: $student_id})
        MERGE (m:Misconception {misconception_id: $misconception_id})
        MERGE (s)-[r:BELIEVES]->(m)
        SET r.flagged_at = datetime()
        """
        async with self.client.get_session() as session:
            await session.run(cypher, {"student_id": student_id, "misconception_id": misconception_id})

    async def record_student_mastery(self, student_id: str, kc_id: str, cleared_misconception_id: str | None = None) -> None:
        """Marks that a student has mastered a Knowledge Component, optionally clearing a misconception."""
        cypher = """
        MERGE (s:Student {student_id: $student_id})
        MERGE (k:KnowledgeComponent {kc_id: $kc_id})
        MERGE (s)-[r:MASTERED]->(k)
        SET r.mastered_at = datetime()
        WITH s
        OPTIONAL MATCH (s)-[b:BELIEVES]->(m:Misconception)
        WHERE $cleared_misconception_id IS NOT NULL AND m.misconception_id = $cleared_misconception_id
        DELETE b
        """
        async with self.client.get_session() as session:
            await session.run(cypher, {
                "student_id": student_id,
                "kc_id": kc_id,
                "cleared_misconception_id": cleared_misconception_id,
            })

    async def get_student_pedagogical_state(self, student_id: str) -> dict[str, Any]:
        """Returns the student's active beliefs, mastered KCs, and attempted items."""
        cypher = """
        MATCH (s:Student {student_id: $student_id})
        OPTIONAL MATCH (s)-[:MASTERED]->(k:KnowledgeComponent)
        OPTIONAL MATCH (s)-[:BELIEVES]->(m:Misconception)
        OPTIONAL MATCH (s)-[:ATTEMPTED]->(q:Question)
        RETURN s.student_id AS student_id,
               collect(DISTINCT k.kc_id) AS mastered_kcs,
               collect(DISTINCT m { .misconception_id, .name, .flawed_rule }) AS active_misconceptions,
               collect(DISTINCT q.question_id) AS attempted_questions
        """
        async with self.client.get_session() as session:
            result = await session.run(cypher, {"student_id": student_id})
            record = await result.single()
            if not record:
                return {"student_id": student_id, "mastered_kcs": [], "active_misconceptions": [], "attempted_questions": []}
            return dict(record)


graph_service = GraphService()
