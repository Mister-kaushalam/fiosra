<script>
  import { onMount } from 'svelte';
  import LongFormDocumentEditor from '../lib/LongFormDocumentEditor.svelte';
  import {
    getStudentId,
    responseError,
    routeParams,
    sessionAccessTokenStorageKey,
    sessionStorageKey,
  } from '../lib/session.js';
  import { learnerErrorSummary, responseErrorDetails } from '../lib/api-error.js';

  let courseId = $state('');
  let assignmentId = $state('');
  let assignment = $state(null);
  let studentId = $state('');
  let sessionId = $state('');
  let sessionAccessToken = $state('');
  let sessionStatus = $state('active');
  let learningDocument = $state(null);
  let probes = $state([]);
  let evidenceSummary = $state({ pending_questions: 0, evidence_submitted: 0 });
  let sessionEvents = $state([]);
  let documentHeadings = $state([]);
  let isLoading = $state(true);

  let isSidebarOpen = $state(true);
  let activeSidebarTab = $state('scope'); // 'scope' | 'outline' | 'graph' | 'trace'
  let activeWorkspaceTab = $state('canvas'); // 'materials' | 'canvas' | 'trace'
  let isTutorPanelOpen = $state(false);
  let activeProbeId = $state('');
  let probeResponse = $state('');
  let probeNotice = $state('');
  let isProbeBusy = $state(false);
  let sourceSearchQuery = $state('');
  let error = $state('');
  let probeTimer;
  let editorRef = $state(null);
  let supportResult = $state(null);
  let isSupportBusy = $state(false);
  let liveBlocks = $state([]);
  let oraclePressure = $state('socratic'); // 'socratic' | 'adversarial' | 'brainstorm' | 'structural' | 'hint' | 'assumptions'
  let isDrawerOpen = $state(false);
  let isSubmitting = $state(false);
  let submissionNotice = $state('');
  let submissionError = $state(null);
  let submittedRevision = $state(null);
  let submittedAt = $state('');
  let pendingSubmissionKey = $state('');
  let selectedSourceId = $state('');
  let sourceActionNotice = $state('');
  let sourceActionError = $state(null);
  let sourceLookupResults = $state({});
  let sourceActionBusy = $state(false);

  function toggleSocraticDrawer() {
    if (activeWorkspaceTab !== 'canvas') {
      activeWorkspaceTab = 'canvas';
    }
    setTimeout(() => {
      if (editorRef && typeof editorRef.toggleSocraticDrawer === 'function') {
        editorRef.toggleSocraticDrawer();
      }
    }, activeWorkspaceTab !== 'canvas' ? 50 : 0);
  }

  let allDocumentBlocks = $derived.by(() => {
    if (liveBlocks && liveBlocks.length > 0) return liveBlocks;
    return (learningDocument?.blocks || []).map((b) => ({
      block_id: b.block_id,
      block_type: b.block_type,
      plaintext: b.plaintext || '',
      semantic_type: b.semantic_type || b.content?.attrs?.semanticType || 'claim',
      position: b.position,
      section_id: b.section_id,
    }));
  });

  function canonicalBlockAnalysis(block) {
    const text = (block.plaintext || '').trim();
    if (block.block_type === 'heading') return { ...block, text, canonical_type: 'heading', has_premature: false };
    const suppliedType = block.semantic_type || block.content?.attrs?.semanticType;
    const validTypes = new Set(['claim', 'evidence', 'reasoning', 'assumption', 'counter', 'conclusion']);
    let canonicalType = validTypes.has(suppliedType) ? suppliedType : '';
    if (!canonicalType) {
      const likelyEvidence = /\b(?:the|this) (?:source|report|text|record|excavation|material)\s+(?:describes|states|shows|records|notes|documents)\b/i.test(text);
      const likelyReasoning = /\b(?:because|therefore|thus|consequently|which means|this suggests|as a result|leads? to)\b/i.test(text);
      const likelyAssumption = /\b(?:assumes?|taken for granted|must have|obviously)\b/i.test(text);
      canonicalType = likelyAssumption ? 'assumption'
        : likelyReasoning ? 'reasoning'
          : likelyEvidence ? 'evidence'
            : 'claim';
    }
    const hasPremature = /(?:therefore|thus|hence|in conclusion|consequently)\b/i.test(text)
      && !/\b(?:source|evidence|data|table|figure|report)\b/i.test(text);
    return { ...block, text, canonical_type: canonicalType, has_premature: hasPremature };
  }

  let canonicalBlocks = $derived.by(() => allDocumentBlocks.map(canonicalBlockAnalysis));

  let graphMetrics = $derived.by(() => {
    let c = 0, e = 0, w = 0, a = 0, p = 0;
    for (const b of canonicalBlocks) {
      const sem = b.canonical_type;
      if (sem === 'claim') c++;
      else if (sem === 'evidence') e++;
      else if (sem === 'reasoning') w++;
      else if (sem === 'assumption') a++;
      if (probes.some((pr) => pr.block_id === b.block_id && pr.status !== 'superseded')) p++;
    }
    return { claims: c, evidence: e, warrants: w, assumptions: a, probes: p };
  });

  let graphSections = $derived.by(() => {
    const sections = [];
    let currentSec = {
      heading: { text: 'Provisional Claims & Thesis', level: 2, pos: 0 },
      blocks: [],
    };

    for (const b of canonicalBlocks) {
      if (b.block_type === 'heading') {
        if (currentSec.blocks.length > 0) {
          sections.push(currentSec);
        }
        currentSec = {
          heading: { text: b.plaintext || 'Section', level: 2, pos: b.position },
          blocks: [],
        };
      } else {
        const text = b.text;
        if (text.length > 3) {
          const sem = b.canonical_type;
          const hasProbe = probes.some((pr) => pr.block_id === b.block_id && pr.status !== 'superseded');
          const icon = sem === 'evidence' ? '📜' : sem === 'reasoning' ? '⚡' : sem === 'assumption' ? '⚠️' : sem === 'counter' ? '🔄' : sem === 'conclusion' ? '🏁' : '🎯';
          const label = sem.charAt(0).toUpperCase() + sem.slice(1);
          currentSec.blocks.push({
            block_id: b.block_id,
            text: text.slice(0, 110),
            semanticType: sem,
            icon,
            label,
            hasProbe,
            hasPremature: b.has_premature,
          });
        }
      }
    }
    if (currentSec.blocks.length > 0 || sections.length === 0) {
      sections.push(currentSec);
    }
    return sections;
  });

  let currentProbe = $derived(activeProbe());
  let published = $derived(assignment?.published || null);
  let publicSources = $derived(published?.source_pack || []);
  let activeSourceReference = $derived.by(() => {
    const references = learningDocument?.source_references || [];
    return references.find((reference) => reference.source_id === selectedSourceId)
      || references.at(-1)
      || null;
  });
  let readinessItems = $derived.by(() => {
    const allText = canonicalBlocks.map((block) => block.text).join(' ');
    const linkedClaims = new Set(
      (learningDocument?.source_references || []).flatMap((reference) => reference.linked_block_ids || [])
    );
    const hasLinkedEvidence = linkedClaims.size > 0 || graphMetrics.evidence > 0;
    const hasClaim = graphMetrics.claims > 0 || graphMetrics.warrants > 0;
    const hasReasoning = graphMetrics.warrants > 0 || /\b(?:because|this suggests|therefore|however|although|but)\b/i.test(allText);
    const hasQualification = /\b(?:may|might|could|however|although|limit(?:ation)?|uncertain|does not establish)\b/i.test(allText);
    return (published?.public_rubric || []).map((criterion) => {
      const descriptor = `${criterion.title || ''} ${criterion.description || ''}`.toLowerCase();
      const asksForEvidence = /evidence|source|material|citation|ground/.test(descriptor);
      const asksForReasoning = /reason|explain|warrant|analysis|interpret/.test(descriptor);
      const asksForQualification = /alternative|revision|limit|uncertain|qualification/.test(descriptor);
      const met = asksForEvidence ? hasLinkedEvidence : asksForQualification ? hasQualification
        : asksForReasoning ? hasReasoning : hasClaim;
      const nextStep = asksForEvidence ? 'Link an assigned passage beside the claim it helps you test.'
        : asksForQualification ? 'Name a limitation, alternative, or uncertainty in your interpretation.'
          : asksForReasoning ? 'Explain how your evidence supports, complicates, or limits the claim.'
            : 'Draft a clear, bounded claim that responds to the task.';
      return { criterion, met, nextStep };
    });
  });
  let readinessSummary = $derived.by(() => {
    const met = readinessItems.filter((item) => item.met).length;
    return { met, total: readinessItems.length };
  });

  function sessionHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Fiosra-Session-Token': sessionAccessToken,
    };
  }

  function activeProbe() {
    return probes.find((probe) => probe.probe_id === activeProbeId) || probes[0] || null;
  }

  async function loadDocument() {
    const response = await fetch(`/learning-documents/sessions/${sessionId}`, { headers: sessionHeaders() });
    if (!response.ok) throw new Error(await responseError(response, 'Your long-form document could not be restored.'));
    learningDocument = await response.json();
    sessionStatus = learningDocument.status;
    if (!selectedSourceId && learningDocument.source_references?.length) {
      selectedSourceId = learningDocument.source_references.at(-1).source_id;
    }
  }

  async function loadProbes() {
    if (!sessionId || sessionStatus !== 'active') return;
    const response = await fetch(`/learning-documents/sessions/${sessionId}/probes`, { headers: sessionHeaders() });
    if (!response.ok) throw new Error(await responseError(response, 'Your evidence questions could not be restored.'));
    const result = await response.json();
    probes = result.probes || [];
    evidenceSummary = result.evidence_summary || evidenceSummary;
    if (!activeProbeId && probes[0]) activeProbeId = probes[0].probe_id;
  }

  async function loadSessionEvents() {
    if (!sessionId) return;
    try {
      const response = await fetch(`/events/session/${sessionId}`, { headers: sessionHeaders() });
      if (response.ok) {
        const data = await response.json();
        sessionEvents = data.events || [];
        if (data.session?.status === 'submitted') {
          sessionStatus = 'submitted';
          submittedRevision = data.session.submitted_document_revision ?? submittedRevision;
          submittedAt = data.session.submitted_at || submittedAt;
          submissionNotice = submittedAt
            ? `Submitted ${new Date(submittedAt).toLocaleString()}.`
            : 'Submitted for educator review.';
        }
      }
    } catch (err) {
      console.warn('Loading session events for sidebar trace:', err);
    }
  }

  async function loadAssignment() {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    assignmentId = params.get('assignment_id') || '';

    if (assignmentId) {
      const response = await fetch(`/assignments/${assignmentId}`);
      if (!response.ok) throw new Error(await responseError(response, 'The requested assignment could not be loaded.'));
      const found = await response.json();
      if (found.status === 'published') {
        assignment = found;
      } else {
        assignment = null;
      }
    } else if (courseId) {
      const response = await fetch(`/assignments?course_id=${encodeURIComponent(courseId)}&status=published`);
      if (response.ok) {
        const assignments = await response.json();
        const pub = assignments.filter((a) => a.status === 'published');
        assignment = pub[0] || null;
        assignmentId = assignment?.assignment_id || '';
      }
    }

    if (!assignment && !courseId) {
      try {
        const coursesRes = await fetch('/courses');
        if (coursesRes.ok) {
          const coursesList = await coursesRes.json();
          const courses = Array.isArray(coursesList) ? coursesList : coursesList.courses || [];
          for (const c of courses) {
            const cid = c.course_id || c.id;
            if (!cid) continue;
            const res = await fetch(`/assignments?course_id=${encodeURIComponent(cid)}&status=published`);
            if (res.ok) {
              const list = await res.json();
              const pubList = list.filter((a) => a.status === 'published');
              if (pubList.length > 0) {
                assignment = pubList[0];
                assignmentId = assignment.assignment_id;
                courseId = cid;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Auto-discovering published assignment:', err);
      }
    }

    if (!assignment && !courseId) {
      try {
        const directRes = await fetch('/assignments');
        if (directRes.ok) {
          const allList = await directRes.json();
          const pubList = allList.filter((a) => a.status === 'published');
          if (pubList.length > 0) {
            assignment = pubList[0];
            assignmentId = assignment.assignment_id;
          }
        }
      } catch (err) {
        console.warn('Direct assignment fallback fetch:', err);
      }
    }

    if (!assignment) return;

    studentId = getStudentId();
    const key = sessionStorageKey(assignmentId, studentId);
    const persistedSessionId = localStorage.getItem(key);
    const persistedAccessToken = persistedSessionId
      ? localStorage.getItem(sessionAccessTokenStorageKey(persistedSessionId))
      : '';

    if (persistedSessionId && persistedAccessToken) {
      const existing = await fetch(`/events/session/${persistedSessionId}`, {
        headers: { 'X-Fiosra-Session-Token': persistedAccessToken },
      });
      if (existing.ok) {
        const session = (await existing.json()).session;
        if (['active', 'submitted'].includes(session.status) && session.assignment_id === assignmentId) {
          sessionId = persistedSessionId;
          sessionAccessToken = persistedAccessToken;
          sessionStatus = session.status;
          submittedRevision = session.submitted_document_revision ?? null;
          submittedAt = session.submitted_at || '';
        } else {
          localStorage.removeItem(key);
        }
      } else {
        localStorage.removeItem(key);
      }
    }

    if (!sessionId) {
      const response = await fetch('/events/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          assignment_id: assignmentId,
          current_question_id: assignment.question_id,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'A reasoning session could not be started.'));
      const created = await response.json();
      sessionId = created.session_id;
      sessionAccessToken = created.access_token;
      sessionStatus = created.status;
      localStorage.setItem(key, sessionId);
      localStorage.setItem(sessionAccessTokenStorageKey(sessionId), sessionAccessToken);
    }

    await loadDocument();
    await loadProbes();
    await loadSessionEvents();
  }

  async function syncDocument(patch) {
    const response = await fetch(`/learning-documents/sessions/${sessionId}`, {
      method: 'PUT',
      headers: sessionHeaders(),
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const details = await responseErrorDetails(response, 'This document could not be saved.');
      const saveError = new Error(learnerErrorSummary(details, { draftPreserved: true }));
      saveError.fiosraError = details;
      throw saveError;
    }
    learningDocument = await response.json();
    return learningDocument;
  }

  async function offerConceptProbes(request) {
    if (!sessionId || sessionStatus !== 'active') return;
    try {
      const response = await fetch(`/learning-documents/sessions/${sessionId}/probes/evaluate`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Writing help is unavailable right now.'));
      const result = await response.json();
      probes = result.pending || [];
      evidenceSummary = result.evidence_summary || evidenceSummary;
      if (!activeProbeId && probes[0]) activeProbeId = probes[0].probe_id;
      if (result.availability_notice) probeNotice = result.availability_notice;
    } catch (err) {
      // Saving has already completed; an optional background offer must never interrupt writing.
      console.warn('Offering concept-aware Socratic question:', err);
    }
  }

  function toggleTutorPanel() {
    isTutorPanelOpen = !isTutorPanelOpen;
    if (isTutorPanelOpen) {
      const current = activeProbe();
      if (current) activeProbeId = current.probe_id;
      probeNotice = '';
    }
  }

  function documentExcerpt() {
    return (learningDocument?.blocks || [])
      .map((block) => block.plaintext || '')
      .join('\n')
      .slice(-12000);
  }

  async function requestCompletionSupport(actionId) {
    if (!assignmentId) return;
    isSupportBusy = true;
    probeNotice = '';
    try {
      const response = await fetch(`/assignments/${assignmentId}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: actionId, document_excerpt: documentExcerpt() }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Writing support is unavailable right now.'));
      supportResult = await response.json();
      isTutorPanelOpen = true;
    } catch (err) {
      probeNotice = err.message || 'Writing support is unavailable right now.';
    } finally {
      isSupportBusy = false;
    }
  }

  function sourceReferenceForBlock(blockId) {
    return (learningDocument?.source_references || []).filter((reference) =>
      reference.linked_block_ids?.includes(blockId)
    );
  }

  function openAssignedSource(source) {
    if (!source?.source_url) {
      sourceActionNotice = 'This assigned source has no external link. Use the excerpt and citation supplied in the evidence pack.';
      sourceActionError = null;
      return;
    }
    window.open(source.source_url, '_blank', 'noopener,noreferrer');
  }

  async function writeWithSource(source) {
    if (!sessionId || !source || sessionStatus !== 'active') return;
    sourceActionBusy = true;
    sourceActionError = null;
    sourceActionNotice = '';
    try {
      const response = await fetch(`/learning-documents/sessions/${sessionId}/source-references`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify({ source_id: source.source_id }),
      });
      if (!response.ok) {
        sourceActionError = await responseErrorDetails(response, 'This source could not be added to your writing context.');
        sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
        return;
      }
      learningDocument = await response.json();
      selectedSourceId = source.source_id;
      activeWorkspaceTab = 'canvas';
      sourceActionNotice = `Writing with ${source.title}. This reference does not change your draft.`;
    } catch (err) {
      sourceActionError = { code: 'NETWORK_UNAVAILABLE', retryable: true };
      sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
    } finally {
      sourceActionBusy = false;
    }
  }

  async function linkSourceToBlock(source, blockId) {
    if (!sessionId || !source || !blockId || sessionStatus !== 'active') return;
    sourceActionBusy = true;
    sourceActionError = null;
    try {
      const response = await fetch(
        `/learning-documents/sessions/${sessionId}/source-references/${encodeURIComponent(source.source_id)}/links`,
        {
          method: 'POST',
          headers: sessionHeaders(),
          body: JSON.stringify({ block_id: blockId }),
        },
      );
      if (!response.ok) {
        sourceActionError = await responseErrorDetails(response, 'This source could not be linked to the claim.');
        sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
        return;
      }
      learningDocument = await response.json();
      selectedSourceId = source.source_id;
      sourceActionNotice = `${source.title} is linked beside this claim for your review.`;
      sourceLookupResults = { ...sourceLookupResults, [blockId]: null };
    } catch (err) {
      sourceActionError = { code: 'NETWORK_UNAVAILABLE', retryable: true };
      sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
    } finally {
      sourceActionBusy = false;
    }
  }

  async function useLocatedEvidenceForClaim(source, blockId) {
    if (!sessionId || !source || !blockId || sessionStatus !== 'active') return;
    sourceActionBusy = true;
    sourceActionError = null;
    try {
      const alreadySelected = (learningDocument?.source_references || [])
        .some((reference) => reference.source_id === source.source_id);
      if (!alreadySelected) {
        const addResponse = await fetch(`/learning-documents/sessions/${sessionId}/source-references`, {
          method: 'POST',
          headers: sessionHeaders(),
          body: JSON.stringify({ source_id: source.source_id }),
        });
        if (!addResponse.ok) {
          sourceActionError = await responseErrorDetails(addResponse, 'This source could not be selected.');
          sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
          return;
        }
        learningDocument = await addResponse.json();
      }
      const linkResponse = await fetch(
        `/learning-documents/sessions/${sessionId}/source-references/${encodeURIComponent(source.source_id)}/links`,
        {
          method: 'POST',
          headers: sessionHeaders(),
          body: JSON.stringify({ block_id: blockId }),
        },
      );
      if (!linkResponse.ok) {
        sourceActionError = await responseErrorDetails(linkResponse, 'This source could not be linked to the claim.');
        sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
        return;
      }
      learningDocument = await linkResponse.json();
      selectedSourceId = source.source_id;
      sourceActionNotice = `${source.title} is linked beside this claim for your review.`;
      sourceLookupResults = { ...sourceLookupResults, [blockId]: null };
    } catch (err) {
      sourceActionError = { code: 'NETWORK_UNAVAILABLE', retryable: true };
      sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
    } finally {
      sourceActionBusy = false;
    }
  }

  async function findAssignedEvidence(blockId, claimText) {
    if (!sessionId || !blockId || !claimText) return;
    sourceActionBusy = true;
    sourceActionError = null;
    try {
      const response = await fetch(`/learning-documents/sessions/${sessionId}/assigned-evidence`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify({ block_id: blockId, claim_text: claimText }),
      });
      if (!response.ok) {
        sourceActionError = await responseErrorDetails(response, 'Assigned evidence could not be located right now.');
        sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
        return;
      }
      sourceLookupResults = { ...sourceLookupResults, [blockId]: await response.json() };
    } catch (err) {
      sourceActionError = { code: 'NETWORK_UNAVAILABLE', retryable: true };
      sourceActionNotice = learnerErrorSummary(sourceActionError, { draftPreserved: true });
    } finally {
      sourceActionBusy = false;
    }
  }

  async function changeProbe(probeId, action, body = null) {
    isProbeBusy = true;
    probeNotice = '';
    try {
      const response = await fetch(`/learning-documents/sessions/${sessionId}/probes/${probeId}/${action}`, {
        method: 'POST',
        headers: sessionHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(await responseError(response, 'This question could not be updated.'));
      const result = await response.json();
      probeNotice = result.message;
      probeResponse = '';
      await loadProbes();
      await loadSessionEvents();
      activeProbeId = probes[0]?.probe_id || '';
      if (!probes.length) isTutorPanelOpen = false;
    } catch (err) {
      probeNotice = err.message || 'This question could not be updated.';
    } finally {
      isProbeBusy = false;
    }
  }

  async function submitProbeResponse() {
    const probe = activeProbe();
    if (!probe || probeResponse.trim().length < 10) {
      probeNotice = 'Write at least a short explanation before saving your response.';
      return;
    }
    await changeProbe(probe.probe_id, 'responses', { response_text: probeResponse.trim() });
  }

  async function handleInlineProbeResponse(probeId, responseText) {
    const existing = probes.find((p) => p.probe_id === probeId);
    if (existing) {
      await changeProbe(probeId, 'responses', { response_text: responseText });
    } else {
      if (sessionId) {
        try {
          await fetch(`/events/session/${sessionId}`, {
            method: 'POST',
            headers: sessionHeaders(),
            body: JSON.stringify({
              event_type: 'socratic_inquiry_answered',
              payload: { block_id: probeId, response_text: responseText, pressure: oraclePressure },
            }),
          });
        } catch (e) {
          console.warn('Logging inline inquiry answer:', e);
        }
        await loadSessionEvents();
        await loadProbes();
      }
    }
  }

  async function handleChallengeIdea(blockId, text, moveType = 'challenge') {
    if (!sessionId) return;
    try {
      await fetch(`/events/session/${sessionId}`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify({
          event_type: 'socratic_move_triggered',
          payload: { block_id: blockId, move_type: moveType, text: text.slice(0, 200), pressure: oraclePressure },
        }),
      });
      await loadSessionEvents();
    } catch (e) {
      console.warn('Logging Socratic move:', e);
    }
  }

  function handlePressureChange() {
    const msgs = {
      silent: 'Oracle is in Silent Observer mode: Questions only on request.',
      socratic: 'Oracle is in Socratic Inquirer mode: Balanced inquiries into warrants and causal mechanisms.',
      challenger: 'Oracle is in Adversarial Challenger mode: Actively pushing counter-hypotheses.',
      ruthless: 'Oracle is in Ruthless Pressure mode: Stress-testing every unexamined premise and closure leap.',
    };
    probeNotice = msgs[oraclePressure] || 'Oracle mode updated.';
    setTimeout(() => { if (probeNotice === msgs[oraclePressure]) probeNotice = ''; }, 6000);
  }

  function insertSourceFromSidebar(source) {
    if (editorRef?.insertSourceQuote) {
      editorRef.insertSourceQuote(source);
    }
  }

  function addSectionFromSidebar(type) {
    if (editorRef?.insertWritingFrame) {
      editorRef.insertWritingFrame(type);
    }
  }

  function handleHeadingJump(pos) {
    if (editorRef?.scrollToHeading) {
      editorRef.scrollToHeading(pos);
    }
  }

  async function submitSession() {
    if (!sessionId || sessionStatus !== 'active' || isSubmitting) return;
    const documentRevision = learningDocument?.document_revision;
    if (typeof documentRevision !== 'number') {
      submissionError = {
        code: 'SUBMISSION_BLOCKED',
        message: 'Your document must finish loading before it can be submitted.',
        retryable: false,
      };
      return;
    }
    if (!pendingSubmissionKey) pendingSubmissionKey = crypto.randomUUID();
    isSubmitting = true;
    submissionError = null;
    submissionNotice = 'Submitting your saved revision…';
    try {
      const res = await fetch(`/events/session/${sessionId}/submit`, {
        method: 'POST',
        headers: {
          ...sessionHeaders(),
          'Idempotency-Key': pendingSubmissionKey,
        },
        body: JSON.stringify({ document_revision: documentRevision }),
      });
      if (!res.ok) {
        submissionError = await responseErrorDetails(res, 'Your milestone could not be submitted.');
        submissionNotice = learnerErrorSummary(submissionError, { draftPreserved: true });
        return;
      }
      const submitted = await res.json();
      sessionStatus = 'submitted';
      submittedRevision = submitted.document_revision;
      submittedAt = submitted.submitted_at;
      submissionNotice = submitted.idempotent_replay
        ? `This revision was already submitted ${new Date(submitted.submitted_at).toLocaleString()}.`
        : `Submitted ${new Date(submitted.submitted_at).toLocaleString()}.`;
      pendingSubmissionKey = '';
      await loadSessionEvents();
    } catch (e) {
      submissionError = {
        code: 'NETWORK_UNAVAILABLE',
        message: 'The submission service is temporarily unavailable.',
        retryable: true,
      };
      submissionNotice = learnerErrorSummary(submissionError, { draftPreserved: true });
    } finally {
      isSubmitting = false;
    }
  }

  let filteredSources = $derived(
    publicSources.filter((s) => {
      if (!sourceSearchQuery) return true;
      const q = sourceSearchQuery.toLowerCase();
      return (s.title || '').toLowerCase().includes(q) || (s.excerpt || '').toLowerCase().includes(q);
    })
  );

  onMount(async () => {
    try {
      await loadAssignment();
    } catch (err) {
      error = err.message || 'The reasoning workspace could not be initialized.';
    } finally {
      isLoading = false;
    }
  });

</script>

<svelte:window onkeydown={(e) => {
  if (e.key === 'Escape') {
    if (isTutorPanelOpen) isTutorPanelOpen = false;
  }
}} />

{#if isLoading}
  <main class="loading-view">
    <div class="spinner"></div>
    <p>Opening your reasoning canvas…</p>
  </main>
{:else if error && !assignment}
  <main class="empty-view">
    <h1>Workspace unavailable</h1>
    <p>{error}</p>
    <div style="display: flex; gap: 12px; margin-top: 14px;">
      {#if courseId}
        <a class="btn btn-secondary" href={`#/student/home?course_id=${encodeURIComponent(courseId)}`}>View Course Map</a>
      {/if}
      <a class="btn btn-primary" href="#/student/portal">Return to Courses</a>
    </div>
  </main>
{:else if !assignment}
  <main class="empty-view">
    <h1>{courseId ? 'No published assignment in this course yet' : 'No active assignment selected'}</h1>
    <p>
      {courseId 
        ? 'Your instructor has not published an active reasoning assignment for this course yet.' 
        : 'Open an active milestone from your enrolled courses to start a protected reasoning session.'}
    </p>
    <div style="display: flex; gap: 12px; margin-top: 14px;">
      {#if courseId}
        <a class="btn btn-secondary" href={`#/student/home?course_id=${encodeURIComponent(courseId)}`}>View Course Map</a>
      {/if}
      <a class="btn btn-primary" href="#/student/portal">Browse Available Courses</a>
    </div>
  </main>
{:else}
  <div class="workspace-viewport">
    <!-- Top Control Bar with Segmented Horizontal Navigation -->
    <header class="workspace-topbar">
      <div class="topbar-left">
        <div class="assignment-headline">
          <span class="eyebrow">{published?.domain || 'Reasoning Milestone'}</span>
          <h1>{published?.title || 'Assignment'}</h1>
        </div>
      </div>

      <!-- Center: 3 Primary Horizontal Workspace Tabs -->
      <nav class="workspace-horizontal-tabs" role="tablist" aria-label="Workspace Navigation">
        <button 
          type="button"
          class="tab-btn" 
          class:active={activeWorkspaceTab === 'materials'}
          onclick={() => activeWorkspaceTab = 'materials'}
          role="tab"
          aria-selected={activeWorkspaceTab === 'materials'}
        >
          <span class="tab-icon">📖</span>
          <span class="tab-label">Assignment & Materials</span>
          <span class="tab-pill">{publicSources.length} sources</span>
        </button>

        <button 
          type="button"
          class="tab-btn" 
          class:active={activeWorkspaceTab === 'canvas'}
          onclick={() => activeWorkspaceTab = 'canvas'}
          role="tab"
          aria-selected={activeWorkspaceTab === 'canvas'}
        >
          <span class="tab-icon">✍️</span>
          <span class="tab-label">Reasoning Canvas</span>
          <span class="tab-pill canvas-pill">{allDocumentBlocks.length > 0 ? `${allDocumentBlocks.length} blocks` : 'Draft'}</span>
        </button>

        <button 
          type="button"
          class="tab-btn" 
          class:active={activeWorkspaceTab === 'trace'}
          onclick={() => activeWorkspaceTab = 'trace'}
          role="tab"
          aria-selected={activeWorkspaceTab === 'trace'}
        >
          <span class="tab-icon">🎓</span>
          <span class="tab-label">Engagement Trace</span>
          {#if probes.length > 0}
            <span class="tab-pill alert-pill">{probes.length} probes</span>
          {:else}
            <span class="tab-pill">Portfolio</span>
          {/if}
        </button>
      </nav>

      <div class="topbar-right">
        <!-- Single entry point for learner-controlled writing help. -->
        <button 
          type="button" 
          class="socratic-enquirer-btn" 
          class:active={isDrawerOpen}
          onclick={toggleSocraticDrawer}
          title="Open writing help"
          aria-label="Open writing help"
        >
          <span class="enquirer-icon-wrap">
            <span class="enquirer-symbol">◌</span>
            {#if probes.length > 0 && !isDrawerOpen}
              <span class="enquirer-pulse-dot"></span>
            {/if}
          </span>
          <span class="enquirer-label">{probes.length > 0 && !isDrawerOpen ? 'Fiosra · question ready' : 'Ask Fiosra'}</span>
        </button>

        <span class:submitted={sessionStatus !== 'active'} class="session-badge">{sessionStatus}</span>
      </div>
    </header>

    <!-- Workspace Content Body with 3 Horizontal Tabs -->
    <div class="workspace-content-body">
      <!-- ============================================================ -->
      <!-- TAB 1: ASSIGNMENT, PRIMARY SOURCES & PUBLIC RUBRICS          -->
      <!-- ============================================================ -->
      {#if activeWorkspaceTab === 'materials'}
        <div class="materials-tab-viewport">
          <div class="materials-grid-container">
            <!-- Left / Main Column: Brief, Task Scope & Primary Sources -->
            <div class="materials-main-col">
              <!-- Task Prompt & Purpose Card -->
              <section class="materials-card hero-prompt-card">
                <span class="card-eyebrow">Milestone Brief & Task</span>
                <h2 class="task-prompt-heading">{published?.task?.prompt || 'No prompt specified.'}</h2>
                {#if published?.purpose}
                  <div class="purpose-callout">
                    <strong>Why this matters:</strong>
                    <p>{published.purpose}</p>
                  </div>
                {/if}
                <div class="scope-tags-row">
                  <div class="scope-tag">
                    <span class="tag-label">Deliverable:</span>
                    <strong>{published?.task?.deliverable || 'Argumentative Essay'}</strong>
                  </div>
                  <div class="scope-tag">
                    <span class="tag-label">Permitted Scope:</span>
                    <strong>{published?.task?.scope || 'Course scope'}</strong>
                  </div>
                </div>
              </section>

              <!-- Primary Source Pack (Deep Reader) -->
              <section class="materials-card sources-section-card">
                <div class="sources-header-bar">
                  <div>
                    <span class="card-eyebrow">Grounding Evidence Pack</span>
                    <h3>Primary Source Readings ({publicSources.length})</h3>
                  </div>
                  <input
                    type="search"
                    class="sources-search-box"
                    placeholder="Search source titles or text..."
                    bind:value={sourceSearchQuery}
                  />
                </div>

                <div class="sources-deck-grid">
                  {#each filteredSources as source}
                    <article class="source-reader-item">
                      <div class="source-reader-header">
                        <span class="source-type-pill">{source.resource_type || 'Primary Source'}</span>
                        <h4>{source.title}</h4>
                      </div>
                      <div class="source-excerpt-content">
                        <p>{source.excerpt}</p>
                      </div>
                      <div class="source-reader-footer">
                        <div class="relevance-guidance-box">
                          <strong>Why assigned:</strong> {source.relevance_guidance}
                        </div>
                        {#if source.citation}
                          <p class="source-citation">{source.citation}</p>
                        {/if}
                        <button
                          type="button"
                          class="btn-cite-to-canvas"
                          onclick={() => writeWithSource(source)}
                          disabled={sourceActionBusy || sessionStatus !== 'active'}
                          title="Select this source as writing context"
                        >
                          {activeSourceReference?.source_id === source.source_id ? 'Writing with this source' : 'Write with Source ✍️'}
                        </button>
                      </div>
                    </article>
                  {:else}
                    <p class="empty-sources-msg">No sources match your search query.</p>
                  {/each}
                </div>
              </section>
            </div>

            <!-- Right Column: Learning Goals, Rubric & Checklist -->
            <div class="materials-side-col">
              <!-- Milestone Goals -->
              {#if published?.learning_goals?.length}
                <section class="materials-card">
                  <span class="card-eyebrow">Learning Goals</span>
                  <ul class="materials-goals-list">
                    {#each published.learning_goals as goal}
                      <li>✓ {goal}</li>
                    {/each}
                  </ul>
                </section>
              {/if}

              <!-- Public Rubric Criteria -->
              <section class="materials-card rubric-overview-card">
                <span class="card-eyebrow">Assessment Rubric</span>
                <h3>Evaluation Criteria ({published?.public_rubric?.length || 0})</h3>
                <div class="rubric-items-stack">
                  {#each published?.public_rubric || [] as criterion}
                    <article class="rubric-overview-item">
                      <div class="rubric-item-header">
                        <strong>{criterion.title}</strong>
                        {#if criterion.weight}
                          <span class="rubric-weight-chip">{criterion.weight}%</span>
                        {/if}
                      </div>
                      <p class="rubric-item-desc">{criterion.description}</p>
                      <div class="rubric-levels-mini-grid">
                        {#each criterion.levels as level}
                          <div class="level-mini-box">
                            <span class="level-title">{level.label}</span>
                            <small>{level.description}</small>
                          </div>
                        {/each}
                      </div>
                      <p class="rubric-self-review">
                        <em>Self-review prompt: {criterion.self_review_prompt}</em>
                      </p>
                    </article>
                  {/each}
                </div>
              </section>

              <!-- Completion Checklist & Integrity Notice -->
              <section class="materials-card checklist-card">
                <span class="card-eyebrow">Readiness Checklist</span>
                <ul class="checklist-items-stack">
                  {#each published?.completion_checklist || [] as check}
                    <li>◻ {check}</li>
                  {/each}
                </ul>
                <div class="integrity-notice-box">
                  <small>🔒 {published?.integrity_notice || 'Your educator evaluates the final submission.'}</small>
                </div>
              </section>
            </div>
          </div>
        </div>
      {/if}

      <!-- ============================================================ -->
      <!-- TAB 2: REASONING CANVAS (Always preserved in DOM)            -->
      <!-- ============================================================ -->
      <div class="canvas-tab-wrapper" class:tab-hidden={activeWorkspaceTab !== 'canvas'}>
        <main class="canvas-main-area">
          {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
          {#if sourceActionNotice}
            <p class:source-action-error={Boolean(sourceActionError)} class="source-action-notice" role="status">
              {sourceActionNotice}
              {#if sourceActionError?.correlationId}
                <span>Support ID: {sourceActionError.correlationId}</span>
              {/if}
            </p>
          {/if}
          {#if activeSourceReference}
            <aside class="writing-source-context" aria-label="Active assigned source context">
              <div class="writing-source-copy">
                <span>Writing with source</span>
                <strong>{activeSourceReference.title}</strong>
                <p>{activeSourceReference.excerpt}</p>
                {#if activeSourceReference.citation}<small>{activeSourceReference.citation}</small>{/if}
              </div>
              <div class="writing-source-actions">
                <button type="button" onclick={() => openAssignedSource(activeSourceReference)}>Open source</button>
                <button type="button" onclick={() => activeWorkspaceTab = 'materials'}>Change</button>
              </div>
            </aside>
          {/if}
          {#if probeNotice}
            <div class="probe-alert-bar">
              💡 {probeNotice}
            </div>
          {/if}

          {#if learningDocument}
            <LongFormDocumentEditor
              bind:this={editorRef}
              {learningDocument}
              {assignment}
              {sessionId}
              {sessionAccessToken}
              disabled={sessionStatus !== 'active'}
              onSync={syncDocument}
              onSynced={loadSessionEvents}
              onStableDocument={offerConceptProbes}
              proactiveProbes={probes}
              onProbeAction={(probeId, action) => changeProbe(probeId, action)}
              onOpenSources={() => { activeWorkspaceTab = 'materials'; }}
              onHeadingsChange={(h) => documentHeadings = h}
              onBlocksChange={(b) => liveBlocks = b}
              oraclePressure={oraclePressure}
              onChallengeIdea={handleChallengeIdea}
              onDrawerStateChange={(open) => isDrawerOpen = open}
              onPressureChange={(p) => oraclePressure = p}
            />
          {/if}
        </main>
      </div>

      <!-- ============================================================ -->
      <!-- TAB 3: ENGAGEMENT TRACE & REASONING PORTFOLIO               -->
      <!-- ============================================================ -->
      {#if activeWorkspaceTab === 'trace'}
        <div class="trace-tab-viewport">
          <div class="trace-dashboard-container">
            <!-- Top Metric Banner -->
            <div class="trace-metrics-banner">
              <div class="trace-stat-tile">
                <span class="stat-num claims">{graphMetrics.claims}</span>
                <span class="stat-lbl">Claims Drafted</span>
              </div>
              <div class="trace-stat-tile">
                <span class="stat-num evidence">{graphMetrics.evidence}</span>
                <span class="stat-lbl">Evidence Grounded</span>
              </div>
              <div class="trace-stat-tile">
                <span class="stat-num warrants">{graphMetrics.warrants}</span>
                <span class="stat-lbl">Causal Warrants</span>
              </div>
              <div class="trace-stat-tile">
                <span class="stat-num assumptions">{graphMetrics.assumptions}</span>
                <span class="stat-lbl">Implicit Assumptions</span>
              </div>
            </div>

            <!-- Two-Column Trace Grid -->
            <div class="trace-two-col-grid">
              <!-- Left Column: Living Reasoning Graph Tree -->
              <div class="trace-panel-card graph-map-card">
                <header class="panel-card-header">
                  <div>
                    <span class="card-eyebrow">Living Argument Architecture</span>
                    <h3>Reasoning Graph & Claim Tree</h3>
                  </div>
                </header>

                <div class="trace-graph-tree-body">
                  {#if graphSections.length === 0}
                    <div class="empty-trace-state">
                      <p>Start writing in the Reasoning Canvas to see your living argument tree assemble in real time.</p>
                      <button type="button" class="btn btn-secondary" onclick={() => activeWorkspaceTab = 'canvas'}>
                        Open Canvas ✍️
                      </button>
                    </div>
                  {:else}
                    <div class="graph-root-node">
                      <div class="node-badge-chip root">Central Thesis</div>
                      <h5>{published?.task?.prompt || published?.title || 'Thesis'}</h5>
                    </div>

                    {#each graphSections as section, sIdx}
                      <div class="graph-section-group">
                        <div class="section-branch-header">
                          <span class="branch-connector">├─ Section {sIdx + 1}:</span>
                          <span class="sec-title">{section.heading.text}</span>
                        </div>
                        <div class="section-children-tree">
                          {#each section.blocks as item}
                            <div class="graph-claim-node {item.semanticType}" class:has-probe={item.hasProbe}>
                              <div class="claim-node-top">
                                <span class="claim-badge-icon">{item.icon}</span>
                                <span class="claim-type-label">{item.label}</span>
                                {#if item.hasProbe}
                                  <span class="claim-status-tag probe">◌ Socratic Tension</span>
                                {:else if item.semanticType === 'evidence'}
                                  <span class="claim-status-tag grounded">✓ Grounding</span>
                                {:else if item.hasPremature}
                                  <span class="claim-status-tag premature">🔴 Premature Leap</span>
                                {:else if item.semanticType === 'claim'}
                                  <span class="claim-status-tag ungrounded">? Needs Warrant</span>
                                {/if}
                              </div>
                              <p class="claim-excerpt">"{item.text || 'Untitled block'}"</p>
                              {#if sourceReferenceForBlock(item.block_id).length}
                                <div class="claim-source-links" aria-label="Sources linked by the learner">
                                  {#each sourceReferenceForBlock(item.block_id) as reference}
                                    <button type="button" onclick={() => openAssignedSource(reference)}>
                                      ↗ {reference.title}
                                    </button>
                                  {/each}
                                </div>
                              {/if}
                              <div class="claim-node-actions">
                                <button 
                                  type="button" 
                                  class="node-jump-btn"
                                  onclick={() => {
                                    activeWorkspaceTab = 'canvas';
                                    setTimeout(() => { if (editorRef?.scrollToBlock) editorRef.scrollToBlock(item.block_id); }, 60);
                                  }}
                                  title="Jump to this block in canvas"
                                >
                                  Jump to Canvas ↗
                                </button>
                                <button 
                                  type="button" 
                                  class="node-probe-btn"
                                  onclick={() => {
                                    activeWorkspaceTab = 'canvas';
                                    setTimeout(() => { if (editorRef?.expandBlockProbe) editorRef.expandBlockProbe(item.block_id); }, 60);
                                  }}
                                  title="Examine Socratic inquiry on this block"
                                >
                                  ◌ Examine ⚡
                                </button>
                                {#if sessionStatus === 'active'}
                                  <button
                                    type="button"
                                    class="node-source-btn"
                                    onclick={() => findAssignedEvidence(item.block_id, item.text)}
                                    disabled={sourceActionBusy}
                                    title="Find relevant passages from assigned materials"
                                  >
                                    Find assigned evidence
                                  </button>
                                {/if}
                              </div>
                              {#if sourceLookupResults[item.block_id]}
                                <div class="assigned-evidence-results" role="status">
                                  <p>{sourceLookupResults[item.block_id].message}</p>
                                  {#each sourceLookupResults[item.block_id].candidates as candidate}
                                    <article>
                                      <strong>{candidate.title}</strong>
                                      <p>{candidate.excerpt}</p>
                                      {#if candidate.matched_terms?.length}
                                        <small>Matched terms: {candidate.matched_terms.join(', ')}</small>
                                      {/if}
                                      <div>
                                        <button type="button" onclick={() => openAssignedSource(candidate)}>Open source</button>
                                        <button
                                          type="button"
                                          onclick={() => useLocatedEvidenceForClaim(candidate, item.block_id)}
                                          disabled={sourceActionBusy}
                                        >
                                          Link beside this claim
                                        </button>
                                      </div>
                                    </article>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                          {:else}
                            <p class="empty-leaf-note">No claims drafted in this section yet.</p>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>

              <!-- Right Column: Socratic Inquiry Dossier & Milestone Submission -->
              <div class="trace-panel-card trace-dossier-card">
                <header class="panel-card-header">
                  <div>
                    <span class="card-eyebrow">Epistemic Audit & Dossier</span>
                    <h3>Socratic Inquiries & Justifications</h3>
                  </div>
                </header>

                <div class="trace-dossier-body">
                  <section class="readiness-self-review" aria-label="Rubric-linked self-review">
                    <div class="readiness-header">
                      <div>
                        <span class="card-eyebrow">Before you submit</span>
                        <h4>Rubric-linked self-review</h4>
                      </div>
                      <span>{readinessSummary.met}/{readinessSummary.total} signals present</span>
                    </div>
                    <p>This is not a grade. It only shows which public rubric signals are visible in the current saved draft.</p>
                    <ul>
                      {#each readinessItems as item}
                        <li class:met={item.met}>
                          <span>{item.met ? '✓' : '○'}</span>
                          <div>
                            <strong>{item.criterion.title}</strong>
                            {#if !item.met}<small>{item.nextStep}</small>{/if}
                          </div>
                        </li>
                      {/each}
                    </ul>
                  </section>

                  <!-- Milestone Submission Action Tile -->
                  <div class="milestone-submission-banner">
                    <div class="submission-meta">
                      <span class="sub-badge" class:submitted={sessionStatus === 'submitted'}>
                        {sessionStatus === 'submitted' ? '✓ Submitted for Review' : '● In Progress (Draft)'}
                      </span>
                      <h4>Reasoning Milestone Verification</h4>
                      <p>Once you are satisfied that your claims are grounded with warrants and evidence, submit this session for educator evaluation.</p>
                    </div>
                    {#if sessionStatus === 'submitted'}
                      <div class="submission-complete-pill" role="status">
                        <span>
                          Milestone submitted for educator review
                          {#if submittedRevision !== null} at revision {submittedRevision}{/if}
                          {#if submittedAt} on {new Date(submittedAt).toLocaleString()}{/if}.
                        </span>
                      </div>
                    {:else}
                      <div class="submission-action-stack">
                        {#if submissionNotice}
                          <p class:submission-error={Boolean(submissionError)} class="submission-status-note" role="status">
                            {submissionNotice}
                            {#if submissionError?.correlationId}
                              <span class="submission-correlation">Support ID: {submissionError.correlationId}</span>
                            {/if}
                          </p>
                        {/if}
                        <button
                          type="button"
                          class="btn-submit-milestone"
                          onclick={submitSession}
                          disabled={isSubmitting || sessionStatus !== 'active'}
                        >
                          {isSubmitting ? 'Submitting saved revision…' : submissionError?.retryable ? 'Retry Submission' : 'Submit Milestone for Evaluation'}
                        </button>
                      </div>
                    {/if}
                  </div>

                  <!-- Dossier Events List -->
                  <h4 class="dossier-section-title">Dialectic Inquiry History ({sessionEvents.filter(e => e.event_type?.includes('socratic') || e.event_type?.includes('probe')).length})</h4>
                  
                  <div class="dossier-events-stack">
                    {#each sessionEvents.filter(e => e.event_type?.includes('socratic') || e.event_type?.includes('probe') || e.event_type === 'milestone_submitted') as evt}
                      <div class="dossier-event-item">
                        <div class="event-header-row">
                          <span class="event-type-pill {evt.event_type}">{evt.event_type.replace(/_/g, ' ')}</span>
                          <span class="event-time">{evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : ''}</span>
                        </div>
                        {#if evt.payload?.text}
                          <p class="event-text"><em>"{evt.payload.text}"</em></p>
                        {/if}
                        {#if evt.payload?.response_text}
                          <div class="event-student-note">
                            <strong>Student Note:</strong> {evt.payload.response_text}
                          </div>
                        {/if}
                        {#if evt.payload?.move_type}
                          <span class="event-move-tag">Move: {evt.payload.move_type}</span>
                        {/if}
                      </div>
                    {:else}
                      <div class="empty-dossier-state">
                        <p>No Socratic inquiries recorded yet. As you engage with the Oracle and answer probes, your epistemic reasoning history will be collected here.</p>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Optional Flyout Support Panel (Toggleable from Top Bar) -->
      {#if isTutorPanelOpen}
        <aside class="socratic-tutor-column flyout-mode" aria-label="Optional writing support">
          <header class="tutor-header">
            <div>
              <span class="eyebrow">Optional support</span>
              <h3>Writing support</h3>
            </div>
            <button class="close-panel-btn" onclick={() => isTutorPanelOpen = false} title="Close Panel (Esc)">✕</button>
          </header>

          <div class="tutor-body">
            {#if published?.support_menu?.length}
              <div class="completion-support-menu">
                <span class="card-eyebrow">Choose what would help now</span>
                {#each published.support_menu as item}
                  <button class="completion-support-action" disabled={isSupportBusy} onclick={() => requestCompletionSupport(item.action_id)}>
                    <strong>{item.title}</strong><small>{item.description}</small>
                  </button>
                {/each}
              </div>
            {/if}

            {#if supportResult}
              <div class="support-result-card">
                <div class="probe-meta"><span class="section-tag">Next useful step</span></div>
                <h4>{supportResult.title}</h4>
                <p>{supportResult.guidance}</p>
                <ol>{#each supportResult.next_steps as step}<li>{step}</li>{/each}</ol>
                <button class="defer-btn" onclick={() => supportResult = null}>Choose another support option</button>
              </div>
            {:else if currentProbe}
              <div class="probe-card">
                <div class="probe-meta">
                  <span class="section-tag">{currentProbe.section_label || 'Active paragraph'}</span>
                  <span class="focus-pill">{currentProbe.focus_type.replace(/_/g, ' ')}</span>
                </div>

                <p class="probe-question">{currentProbe.question}</p>

                <div class="probe-pedagogy-tip">
                  <p>Use this optional question only if it helps you develop or revise your response. Your educator evaluates the final work.</p>
                </div>

                <label for="probe-input" class="probe-input-label">Your working note</label>
                <textarea 
                  id="probe-input"
                  bind:value={probeResponse}
                  disabled={isProbeBusy}
                  placeholder="Write a note that helps you continue your own draft."
                  class="probe-textarea"
                ></textarea>

                {#if probeNotice}<p class="probe-status-msg" role="status">{probeNotice}</p>{/if}

                <div class="probe-actions">
                  <button class="save-evidence-btn" onclick={submitProbeResponse} disabled={isProbeBusy || probeResponse.trim().length < 10}>
                    {isProbeBusy ? 'Saving…' : 'Save note'}
                  </button>
                  <button class="defer-btn" onclick={() => changeProbe(currentProbe.probe_id, 'defer')} disabled={isProbeBusy}>
                    Later
                  </button>
                  <button class="dismiss-btn" onclick={() => changeProbe(currentProbe.probe_id, 'dismiss')} disabled={isProbeBusy}>
                    Dismiss
                  </button>
                </div>
              </div>
            {:else}
              <div class="empty-probe-state">
                <h4>No Pending Probes</h4>
                <p>Use the assignment, materials, and rubric to continue your draft. Optional support will be available when it can help you take a next step.</p>
                {#if evidenceSummary.evidence_submitted}
                  <span class="evidence-badge">✓ {evidenceSummary.evidence_submitted} evidence response{evidenceSummary.evidence_submitted === 1 ? '' : 's'} recorded</span>
                {/if}
              </div>
            {/if}
          </div>
        </aside>
      {/if}
    </div>
  </div>
{/if}

<style>
  .workspace-viewport {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 56px);
    background: var(--color-obsidian);
    overflow: hidden;
  }

  /* Top Control Bar */
  .workspace-topbar {
    background: var(--color-graphite);
    border-bottom: 1px solid var(--color-graphite-border);
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    flex-shrink: 0;
    z-index: 10;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .sidebar-toggle-btn {
    background: var(--color-bone-muted);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    color: var(--color-slate-light);
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sidebar-toggle-btn:hover {
    background: var(--color-graphite-hover);
    color: var(--color-heading);
  }

  .sidebar-toggle-btn.active {
    background: rgba(217, 119, 6, 0.12);
    border-color: var(--color-horizon-blue);
    color: var(--color-horizon-blue);
  }

  .assignment-headline {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .eyebrow {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--color-horizon-blue);
  }

  .assignment-headline h1 {
    margin: 0;
    font-family: var(--font-brand);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-heading);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .tutor-toggle-btn {
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: var(--radius-sm);
    color: #8b5cf6;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tutor-toggle-btn:hover, .tutor-toggle-btn.active {
    background: rgba(139, 92, 246, 0.2);
    border-color: #8b5cf6;
  }

  .concept-inquiry-notice {
    align-self: center;
    background: transparent;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    color: var(--color-slate-light);
    cursor: pointer;
    font-size: 11px;
    margin: 8px 0 0;
    padding: 7px 10px;
  }

  .concept-inquiry-notice:hover {
    color: var(--color-heading);
  }

  .probe-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8b5cf6;
  }

  .probe-dot.has-probes {
    animation: pulseGlow 2s infinite;
  }

  .probe-count-pill {
    background: #8b5cf6;
    color: #fff;
    border-radius: 99px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 800;
  }

  .session-badge {
    background: var(--color-signal-green-bg);
    border: 1px solid rgba(5, 150, 105, 0.25);
    border-radius: 99px;
    color: var(--color-signal-green);
    font-size: 10px;
    font-weight: 700;
    padding: 3px 9px;
    text-transform: capitalize;
  }

  .session-badge.submitted {
    background: var(--color-amber-bg);
    color: var(--color-amber);
    border-color: rgba(217, 119, 6, 0.25);
  }

  /* Horizontal Tabs in Top Control Bar */
  .workspace-horizontal-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--pill-bg, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--pill-border, rgba(0, 0, 0, 0.08));
    border-radius: 99px;
    padding: 3px 5px;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-slate-light);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    text-decoration: none;
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: var(--color-heading);
    background: var(--pill-hover, rgba(0, 0, 0, 0.05));
  }

  .tab-btn.active {
    color: var(--color-heading);
    background: var(--color-bone-surface, #ffffff);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1));
    font-weight: 700;
  }

  .tab-icon {
    font-size: 13px;
  }

  .tab-label {
    letter-spacing: 0.1px;
  }

  .tab-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 99px;
    background: var(--pill-bg, rgba(0, 0, 0, 0.06));
    color: var(--color-slate-muted);
  }

  .tab-btn.active .tab-pill {
    background: rgba(139, 92, 246, 0.15);
    color: #7c3aed;
  }

  .tab-pill.canvas-pill {
    background: rgba(59, 130, 246, 0.15);
    color: #93c5fd;
  }

  .tab-pill.alert-pill {
    background: rgba(245, 158, 11, 0.25);
    color: #fcd34d;
  }

  /* Workspace Content Body Container */
  .workspace-content-body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Canvas Tab Wrapper (Always mounted to preserve cursor/undo/state) */
  .canvas-tab-wrapper {
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .canvas-tab-wrapper.tab-hidden {
    display: none !important;
  }

  .canvas-main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .error-banner {
    margin: 12px 24px 0;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: var(--radius-sm);
    color: #fca5a5;
    font-size: 12px;
  }

  .probe-alert-bar {
    margin: 12px 24px 0;
    padding: 10px 16px;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.4);
    border-radius: var(--radius-sm);
    color: #c4b5fd;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .probe-alert-bar:hover {
    background: rgba(139, 92, 246, 0.25);
  }

  .source-action-notice {
    margin: 12px 24px 0;
    color: var(--color-slate-light);
    font-size: 12px;
  }

  .source-action-notice.source-action-error {
    color: #fbbf24;
  }

  .source-action-notice span {
    display: block;
    margin-top: 2px;
    color: var(--color-slate-muted);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
  }

  .writing-source-context {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin: 12px 24px 0;
    padding: 11px 14px;
    background: rgba(59, 130, 246, 0.09);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: 8px;
  }

  .writing-source-copy > span {
    display: block;
    color: #93c5fd;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .writing-source-copy strong {
    display: block;
    margin-top: 2px;
    color: var(--color-heading);
    font-size: 12px;
  }

  .writing-source-copy p {
    margin: 4px 0 0;
    color: var(--color-slate-light);
    font-size: 11px;
    line-height: 1.4;
  }

  .writing-source-copy small {
    display: block;
    margin-top: 4px;
    color: var(--color-slate-muted);
    font-size: 10px;
  }

  .writing-source-actions {
    display: flex;
    gap: 10px;
    flex: 0 0 auto;
  }

  .writing-source-actions button,
  .claim-source-links button,
  .assigned-evidence-results button {
    border: 0;
    background: transparent;
    color: #93c5fd;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* ============================================================ */
  /* TAB 1: MATERIALS & ASSIGNMENT VIEWPORT                       */
  /* ============================================================ */
  .materials-tab-viewport {
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: 28px 36px;
    background: var(--color-obsidian);
  }

  .materials-grid-container {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 28px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  .materials-main-col, .materials-side-col {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .materials-card {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: 12px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .hero-prompt-card {
    border-top: 3px solid var(--color-horizon-blue);
  }

  .task-prompt-heading {
    margin: 0;
    font-family: var(--font-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-heading);
    line-height: 1.45;
  }

  .purpose-callout {
    background: rgba(59, 130, 246, 0.08);
    border-left: 3px solid #3b82f6;
    padding: 12px 16px;
    border-radius: var(--radius-xs);
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-slate-light);
  }

  .purpose-callout strong {
    color: #93c5fd;
    display: block;
    margin-bottom: 4px;
  }

  .purpose-callout p {
    margin: 0;
  }

  .scope-tags-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .scope-tag {
    background: var(--color-bone-muted);
    border: 1px solid var(--color-graphite-border);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .scope-tag .tag-label {
    color: var(--color-slate-muted);
  }

  .scope-tag strong {
    color: var(--color-heading);
  }

  /* Sources Deck in Materials */
  .sources-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .sources-header-bar h3 {
    margin: 2px 0 0;
    font-size: 16px;
    color: var(--color-heading);
  }

  .sources-search-box {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--color-graphite-border);
    border-radius: 8px;
    padding: 8px 14px;
    color: var(--color-heading);
    font-size: 12.5px;
    width: 260px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .sources-search-box:focus {
    border-color: var(--color-horizon-blue);
  }

  .sources-deck-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 18px;
  }

  .source-reader-item {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-graphite-border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: all 0.15s ease;
  }

  .source-reader-item:hover {
    border-color: rgba(59, 130, 246, 0.4);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .source-reader-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .source-reader-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-heading);
    line-height: 1.35;
  }

  .source-type-pill {
    align-self: flex-start;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.12);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .source-excerpt-content {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-slate-light);
    max-height: 180px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.25);
    padding: 12px;
    border-radius: 6px;
    font-style: italic;
  }

  .source-excerpt-content p {
    margin: 0;
  }

  .source-reader-footer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: auto;
  }

  .relevance-guidance-box {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--color-slate-muted);
  }

  .relevance-guidance-box strong {
    color: #93c5fd;
  }

  .source-citation {
    margin: 0;
    color: var(--color-slate-muted);
    font-size: 10px;
    line-height: 1.4;
  }

  .btn-cite-to-canvas {
    align-self: flex-start;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cite-to-canvas:hover {
    background: rgba(59, 130, 246, 0.22);
    border-color: #3b82f6;
    color: #fff;
  }

  .empty-sources-msg {
    color: var(--color-slate-muted);
    font-size: 13px;
    text-align: center;
    padding: 24px;
    grid-column: 1 / -1;
  }

  /* Side Column: Goals, Rubric & Checklist */
  .materials-goals-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12.5px;
    color: var(--color-slate-light);
  }

  .materials-goals-list li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    line-height: 1.45;
  }

  .rubric-overview-card h3 {
    margin: 0;
    font-size: 15px;
    color: var(--color-heading);
  }

  .rubric-items-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .rubric-overview-item {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-graphite-border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rubric-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rubric-item-header strong {
    font-size: 12.5px;
    color: var(--color-heading);
  }

  .rubric-weight-chip {
    font-size: 10px;
    font-weight: 800;
    color: var(--color-horizon-blue);
    background: rgba(217, 119, 6, 0.12);
    padding: 1px 6px;
    border-radius: 99px;
  }

  .rubric-item-desc {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--color-slate-light);
  }

  .rubric-levels-mini-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .level-mini-box {
    background: var(--color-bone-muted);
    border-left: 2px solid var(--color-horizon-blue);
    padding: 5px 8px;
    border-radius: 2px;
  }

  .level-title {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--color-heading);
    display: block;
  }

  .level-mini-box small {
    font-size: 10px;
    color: var(--color-slate-muted);
    line-height: 1.35;
    display: block;
  }

  .rubric-self-review {
    margin: 0;
    font-size: 10.5px;
    color: #93c5fd;
    line-height: 1.4;
  }

  .checklist-items-stack {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--color-slate-light);
  }

  .integrity-notice-box {
    padding-top: 10px;
    border-top: 1px dashed var(--color-graphite-border);
    color: var(--color-slate-muted);
  }

  /* TAB 3: TRACE & PORTFOLIO VIEWPORT */
  .trace-tab-viewport {
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: 28px 36px;
    background: var(--color-obsidian);
  }

  .trace-dashboard-container {
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .trace-metrics-banner {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
  }

  .trace-stat-tile {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: 10px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .stat-num {
    font-size: 26px;
    font-weight: 800;
    font-family: var(--font-mono, monospace);
    line-height: 1.1;
  }

  .stat-num.claims { color: #93c5fd; }
  .stat-num.evidence { color: #6ee7b7; }
  .stat-num.warrants { color: #c4b5fd; }
  .stat-num.assumptions { color: #fcd34d; }
  .stat-num.probes { color: #f87171; }

  .stat-lbl {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-slate-muted);
  }

  .trace-two-col-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: flex-start;
  }

  .trace-panel-card {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: 12px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .panel-card-header h3 {
    margin: 2px 0 0;
    font-size: 16px;
    color: var(--color-heading);
  }

  .trace-graph-tree-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: 600px;
    overflow-y: auto;
    padding-right: 6px;
  }

  .empty-trace-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--color-slate-muted);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .trace-dossier-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-height: 600px;
    overflow-y: auto;
    padding-right: 6px;
  }

  .readiness-self-review {
    padding: 15px;
    background: rgba(59, 130, 246, 0.06);
    border: 1px solid rgba(59, 130, 246, 0.22);
    border-radius: 10px;
  }

  .readiness-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .readiness-header h4 {
    margin: 3px 0 0;
    color: var(--color-heading);
    font-size: 14px;
  }

  .readiness-header > span {
    color: #93c5fd;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    white-space: nowrap;
  }

  .readiness-self-review > p {
    margin: 7px 0 10px;
    color: var(--color-slate-muted);
    font-size: 10.5px;
    line-height: 1.4;
  }

  .readiness-self-review ul {
    display: flex;
    flex-direction: column;
    gap: 7px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .readiness-self-review li {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    color: var(--color-slate-light);
    font-size: 11px;
  }

  .readiness-self-review li > span {
    color: #fbbf24;
    font-weight: 800;
  }

  .readiness-self-review li.met > span {
    color: #6ee7b7;
  }

  .readiness-self-review li strong,
  .readiness-self-review li small {
    display: block;
  }

  .readiness-self-review li small {
    margin-top: 2px;
    color: var(--color-slate-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .milestone-submission-banner {
    background: linear-gradient(135deg, rgba(30, 27, 75, 0.7), rgba(17, 24, 39, 0.85));
    border: 1px solid rgba(139, 92, 246, 0.4);
    border-radius: 10px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .submission-meta h4 {
    margin: 6px 0 4px;
    font-size: 15px;
    color: var(--color-heading);
  }

  .submission-meta p {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-slate-light);
  }

  .sub-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 99px;
    background: rgba(245, 158, 11, 0.18);
    color: #fcd34d;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .sub-badge.submitted {
    background: rgba(16, 185, 129, 0.18);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.4);
  }

  .submission-complete-pill {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .submission-action-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .submission-status-note {
    margin: 0;
    color: var(--color-slate-light);
    font-size: 12px;
    line-height: 1.4;
  }

  .submission-status-note.submission-error {
    color: #fbbf24;
  }

  .submission-correlation {
    display: block;
    margin-top: 3px;
    color: var(--color-slate-muted);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .btn-submit-milestone {
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    border: 1px solid #8b5cf6;
    color: #fff;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    align-self: flex-start;
  }

  .btn-submit-milestone:hover:not(:disabled) {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
  }

  .btn-submit-milestone:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dossier-section-title {
    margin: 0;
    font-size: 13px;
    color: var(--color-heading);
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 8px;
  }

  .dossier-events-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .dossier-event-item {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-graphite-border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .event-type-pill {
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 2px 7px;
    border-radius: 99px;
    background: rgba(139, 92, 246, 0.18);
    color: #c4b5fd;
  }

  .event-time {
    font-size: 10px;
    color: var(--color-slate-muted);
  }

  .event-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-slate-light);
  }

  .event-student-note {
    background: rgba(139, 92, 246, 0.1);
    border-left: 2px solid #8b5cf6;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 11.5px;
    line-height: 1.45;
    color: #e2e8f0;
  }

  .event-move-tag {
    font-size: 10px;
    color: #93c5fd;
    font-weight: 600;
  }

  .empty-dossier-state {
    text-align: center;
    padding: 24px;
    color: var(--color-slate-muted);
    font-size: 12px;
  }

  /* Optional Flyout Mode for Socratic Writing Support Panel */
  .socratic-tutor-column.flyout-mode {
    position: fixed;
    top: 52px;
    right: 0;
    bottom: 0;
    width: 380px;
    background: var(--color-graphite);
    border-left: 1px solid var(--color-graphite-border);
    box-shadow: -6px 0 28px rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.2s ease-out;
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .tutor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .tutor-header h3 {
    margin: 0;
    font-size: 15px;
    color: var(--color-heading);
  }

  .close-panel-btn {
    background: transparent;
    border: none;
    color: var(--color-slate-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-panel-btn:hover {
    color: var(--color-heading);
    background: var(--color-graphite-hover);
  }

  .tutor-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .probe-card {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--color-graphite-border);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .probe-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-tag {
    font-size: 10px;
    font-weight: 700;
    color: var(--color-horizon-blue);
  }

  .focus-pill {
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    background: rgba(139, 92, 246, 0.2);
    color: #c4b5fd;
    padding: 1px 6px;
    border-radius: 99px;
  }

  .probe-question {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    color: var(--color-heading);
  }

  .probe-pedagogy-tip {
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--color-slate-muted);
  }

  .probe-pedagogy-tip p {
    margin: 0;
  }

  .probe-input-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-slate-light);
  }

  .probe-textarea {
    width: 100%;
    min-height: 80px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--color-graphite-border);
    border-radius: 6px;
    padding: 10px;
    color: var(--color-heading);
    font-size: 12px;
    resize: vertical;
    outline: none;
    font-family: inherit;
  }

  .probe-textarea:focus {
    border-color: #8b5cf6;
  }

  .probe-actions {
    display: flex;
    gap: 8px;
  }

  .save-evidence-btn {
    flex: 1;
    background: #8b5cf6;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .defer-btn, .dismiss-btn {
    background: transparent;
    border: 1px solid var(--color-graphite-border);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 11.5px;
    color: var(--color-slate-muted);
    cursor: pointer;
  }

  .defer-btn:hover, .dismiss-btn:hover {
    color: var(--color-heading);
    background: var(--color-graphite-hover);
  }

  .empty-probe-state {
    text-align: center;
    padding: 24px 12px;
    color: var(--color-slate-muted);
    font-size: 12px;
  }

  .empty-probe-state h4 {
    margin: 0 0 6px;
    font-size: 14px;
    color: var(--color-heading);
  }

  .evidence-badge {
    display: inline-block;
    margin-top: 10px;
    padding: 4px 10px;
    border-radius: 99px;
    background: rgba(16, 185, 129, 0.15);
    color: #6ee7b7;
    font-size: 11px;
    font-weight: 700;
  }

  .empty-state {
    text-align: center;
    padding: 16px 0;
    color: var(--color-slate-muted);
    font-size: 11px;
  }

  .loading-view, .empty-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 56px);
    background: var(--color-obsidian);
    color: var(--color-slate-light);
    padding: 24px;
    text-align: center;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(217, 119, 6, 0.2);
    border-top-color: var(--color-horizon-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .scope-text { color: var(--color-slate-light); font-size: 11px; line-height: 1.45; margin: 0; }
  .scope-text strong { color: var(--color-heading); }
  .goal-list { color: var(--color-slate-light); display: flex; flex-direction: column; font-size: 11px; gap: 6px; line-height: 1.45; margin: 0; padding-left: 17px; }
  .source-guidance { color: var(--color-slate-muted); font-size: 10px; line-height: 1.45; margin: 0; }
  .source-link { color: var(--color-horizon-blue); display: inline-block; font-size: 10px; font-weight: 700; margin-top: 7px; text-decoration: none; }
  .rubric-list { display: flex; flex-direction: column; gap: 10px; }
  .rubric-card { background: var(--color-bone-surface, var(--color-graphite)); border: 1px solid var(--color-graphite-border); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 7px; padding: 11px; }
  .rubric-heading { align-items: center; display: flex; justify-content: space-between; }
  .rubric-heading strong { color: var(--color-heading); font-size: 12px; }
  .rubric-heading span { color: var(--color-horizon-blue); font-family: var(--font-mono); font-size: 10px; font-weight: 700; }
  .rubric-card > p { color: var(--color-slate-light); font-size: 11px; line-height: 1.45; margin: 0; }
  .rubric-levels { display: flex; flex-direction: column; gap: 5px; }
  .rubric-levels > div { background: var(--color-bone-muted); border-left: 2px solid var(--color-horizon-blue); padding: 6px 7px; }
  .rubric-levels strong { color: var(--color-heading); display: block; font-size: 10px; }
  .rubric-levels small { color: var(--color-slate-light); display: block; font-size: 10px; line-height: 1.4; margin-top: 2px; }
  .rubric-card .self-review { color: #93c5fd; font-size: 10px; }
  .completion-support-menu { border-bottom: 1px solid var(--color-graphite-border); display: flex; flex-direction: column; gap: 7px; padding: 0 0 14px; }
  .completion-support-action { background: var(--color-bone-surface, var(--color-graphite)); border: 1px solid var(--color-graphite-border); border-radius: var(--radius-sm); color: var(--color-slate-light); cursor: pointer; padding: 9px 10px; text-align: left; }
  .completion-support-action:hover { border-color: var(--color-horizon-blue); background: rgba(59,130,246,.08); }
  .completion-support-action:disabled { cursor: wait; opacity: .65; }
  .completion-support-action strong { color: var(--color-heading); display: block; font-size: 11px; }
  .completion-support-action small { color: var(--color-slate-muted); display: block; font-size: 10px; line-height: 1.4; margin-top: 3px; }
  .support-result-card { background: rgba(59,130,246,.07); border: 1px solid rgba(96,165,250,.25); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 9px; padding: 12px; }
  .support-result-card h4 { color: var(--color-heading); font-size: 14px; margin: 0; }
  .support-result-card p,.support-result-card li { color: var(--color-slate-light); font-size: 11px; line-height: 1.5; margin: 0; }
  .support-result-card ol { display: flex; flex-direction: column; gap: 5px; margin: 0; padding-left: 17px; }

  /* Socratic Enquirer Tactile Trigger Button (Not a dropdown) */
  .socratic-enquirer-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: var(--radius-sm, 6px);
    padding: 5px 12px;
    font-family: var(--font-ui, sans-serif);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-heading, #121418);
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }
  .socratic-enquirer-btn:hover {
    background: var(--color-graphite-hover, #f8f9fa);
    border-color: var(--color-aurora, #0284c7);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.12);
  }
  .socratic-enquirer-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.09), rgba(99, 102, 241, 0.09));
    border-color: var(--color-aurora, #0284c7);
    color: var(--color-aurora, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
  }
  .enquirer-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .enquirer-symbol {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--color-aurora, #0284c7);
    transition: transform 0.2s ease;
  }
  .socratic-enquirer-btn:hover .enquirer-symbol {
    transform: scale(1.15);
  }
  .enquirer-pulse-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }
  .enquirer-label {
    letter-spacing: -0.01em;
  }
  .enquirer-mode-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: capitalize;
    background: rgba(2, 132, 199, 0.09);
    color: var(--color-aurora, #0284c7);
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid rgba(2, 132, 199, 0.2);
  }
  .socratic-enquirer-btn.active .enquirer-mode-pill {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border-color: var(--color-aurora, #0284c7);
  }

  /* Reasoning Graph & Claim Tree Panel */
  .graph-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 2px 0;
  }
  .graph-header-card {
    background: linear-gradient(135deg, rgba(30, 27, 75, 0.8), rgba(17, 24, 39, 0.9));
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: var(--radius-sm);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .graph-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .graph-icon {
    font-size: 20px;
  }
  .graph-title-row h6 {
    margin: 0 0 2px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  .graph-title-row p {
    margin: 0;
    font-size: 11px;
    color: var(--color-slate-muted);
  }
  .graph-stat-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .g-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--color-slate-light);
  }
  .g-pill.claims { color: #93c5fd; border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.1); }
  .g-pill.evidence { color: #6ee7b7; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.1); }
  .g-pill.warrants { color: #c4b5fd; border-color: rgba(139, 92, 246, 0.4); background: rgba(139, 92, 246, 0.1); }
  .g-pill.assumptions { color: #fcd34d; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.1); }
  .g-pill.probes { color: #a78bfa; border-color: #8b5cf6; background: rgba(139, 92, 246, 0.2); font-weight: 800; }

  .graph-tree-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .empty-graph-box {
    background: var(--color-bone-muted);
    border: 1px dashed var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 16px;
    text-align: center;
    color: var(--color-slate-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .graph-root-node {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    border-left: 3px solid var(--color-horizon-blue);
  }
  .node-badge-chip.root {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--color-horizon-blue);
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .graph-root-node h5 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-heading);
    line-height: 1.4;
  }

  .graph-section-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 6px;
    border-left: 1px dashed rgba(139, 92, 246, 0.3);
    margin-left: 8px;
  }
  .section-branch-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .branch-connector {
    color: rgba(139, 92, 246, 0.6);
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .section-node-btn {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }
  .section-node-btn:hover {
    border-color: var(--color-horizon-blue);
    background: var(--color-graphite-hover);
  }
  .sec-num {
    font-size: 10px;
    font-weight: 800;
    color: var(--color-horizon-blue);
  }
  .sec-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-heading);
  }

  .section-children-tree {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 14px;
  }
  .graph-claim-node {
    background: var(--color-bone-surface, var(--color-graphite));
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .graph-claim-node:hover {
    border-color: rgba(139, 92, 246, 0.5);
    background: var(--color-graphite-hover);
  }
  .graph-claim-node.claim { border-left: 3px solid #3b82f6; }
  .graph-claim-node.evidence { border-left: 3px solid #10b981; }
  .graph-claim-node.reasoning { border-left: 3px solid #8b5cf6; }
  .graph-claim-node.assumption { border-left: 3px solid #f59e0b; }
  .graph-claim-node.counter { border-left: 3px solid #ec4899; }
  .graph-claim-node.conclusion { border-left: 3px solid #14b8a6; }
  .graph-claim-node.has-probe {
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.08);
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
  }

  .claim-node-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .claim-badge-icon { font-size: 13px; }
  .claim-type-label { font-size: 10.5px; font-weight: 700; color: var(--color-heading); }
  .claim-status-tag {
    font-size: 9px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .claim-status-tag.probe {
    background: rgba(139, 92, 246, 0.25);
    color: #c4b5fd;
    border: 1px solid rgba(139, 92, 246, 0.5);
  }
  .claim-status-tag.grounded {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
  }
  .claim-status-tag.premature {
    background: rgba(239, 68, 68, 0.25);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.4);
  }
  .claim-status-tag.ungrounded {
    background: rgba(245, 158, 11, 0.15);
    color: #fcd34d;
  }

  .claim-excerpt {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-slate-light);
    font-style: italic;
  }
  .claim-source-links {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 3px;
  }
  .claim-node-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .node-jump-btn, .node-probe-btn, .node-source-btn {
    background: transparent;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--color-slate-muted);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .node-jump-btn:hover {
    color: var(--color-heading);
    border-color: var(--color-horizon-blue);
  }
  .node-probe-btn:hover {
    color: #c4b5fd;
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.15);
  }
  .node-source-btn:hover {
    color: #6ee7b7;
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.12);
  }
  .assigned-evidence-results {
    margin-top: 8px;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 8px;
  }
  .assigned-evidence-results > p {
    margin: 0 0 7px;
    color: var(--color-slate-muted);
    font-size: 10px;
    line-height: 1.4;
  }
  .assigned-evidence-results article {
    margin-top: 6px;
    padding: 7px 8px;
    background: rgba(16, 185, 129, 0.07);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 5px;
  }
  .assigned-evidence-results article strong {
    color: #a7f3d0;
    font-size: 10px;
  }
  .assigned-evidence-results article p {
    margin: 3px 0;
    color: var(--color-slate-light);
    font-size: 10px;
    line-height: 1.35;
  }
  .assigned-evidence-results article small {
    color: var(--color-slate-muted);
    font-size: 9px;
  }
  .assigned-evidence-results article > div {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }
  .empty-sec-leaf {
    font-size: 10px;
    color: var(--color-slate-muted);
    padding: 4px 0;
  }

  @media (max-width: 1024px) {
    .workspace-grid {
      grid-template-columns: 280px 1fr;
    }
    .workspace-grid.tutor-open {
      grid-template-columns: 280px 1fr 320px;
    }
  }

  @media (max-width: 800px) {
    .workspace-grid {
      grid-template-columns: 1fr;
    }
    .workspace-grid.tutor-open {
      grid-template-columns: 1fr;
    }
    .workspace-sidebar {
      display: none;
    }
    .socratic-tutor-column {
      position: fixed;
      inset: 52px 0 0 0;
      z-index: 50;
    }
  }
</style>
