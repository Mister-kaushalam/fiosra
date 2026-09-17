"""
Fiosra Multi-Agent State Machine Package.
Powered by LangGraph, with native MCP tool consumption and strict Answer Isolation.
"""
from fiosra.mvp.agents.contracts import (
    TutorSessionState,
    VerificationResult,
    EvidenceSessionState,
    CurriculumExtractionState,
    AssignmentDesignerState,
)
from fiosra.mvp.agents.socratic_tutor_agent import SocraticTutorAgent
from fiosra.mvp.agents.critic_agent import AnswerIsolationCriticAgent
from fiosra.mvp.agents.graph import socratic_tutor_graph, create_socratic_tutor_graph
from fiosra.mvp.agents.learner_evidence_agent import LearnerEvidenceAgent, learner_evidence_agent
from fiosra.mvp.agents.curriculum_architect_agent import CurriculumArchitectAgent, curriculum_architect_agent
from fiosra.mvp.agents.assignment_designer_agent import AssignmentDesignerAgent, assignment_designer_agent

__all__ = [
    "TutorSessionState",
    "VerificationResult",
    "EvidenceSessionState",
    "CurriculumExtractionState",
    "AssignmentDesignerState",
    "SocraticTutorAgent",
    "AnswerIsolationCriticAgent",
    "socratic_tutor_graph",
    "create_socratic_tutor_graph",
    "LearnerEvidenceAgent",
    "learner_evidence_agent",
    "CurriculumArchitectAgent",
    "curriculum_architect_agent",
    "AssignmentDesignerAgent",
    "assignment_designer_agent",
]
