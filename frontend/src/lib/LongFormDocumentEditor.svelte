<script>
  import { onDestroy, onMount } from 'svelte';
  import { Editor, Extension } from '@tiptap/core';
  import { Plugin } from '@tiptap/pm/state';
  import { Decoration, DecorationSet } from '@tiptap/pm/view';
  import StarterKit from '@tiptap/starter-kit';
  import { learnerErrorSummary, responseErrorDetails } from './api-error.js';
  import {
    clearDocumentRecovery,
    loadDocumentRecovery,
    saveDocumentRecovery,
  } from './document-recovery.js';

  let {
    learningDocument = null,
    assignment = null,
    disabled = false,
    sessionId = '',
    sessionAccessToken = '',
    onSync = async () => null,
    onSynced = () => null,
    onStableDocument = async () => null,
    proactiveProbes = [],
    onProbeAction = async () => null,
    onOpenSources = () => null,
    onHeadingsChange = () => null,
    onBlocksChange = () => null,
    oraclePressure = 'socratic',
    onProbeResponse = async () => null,
    onChallengeIdea = async () => null,
    onDrawerStateChange = () => null,
    onPressureChange = () => null,
  } = $props();

  const blockTypes = {
    heading: 'heading',
    paragraph: 'paragraph',
    blockquote: 'blockquote',
    bulletList: 'bullet_list',
    orderedList: 'ordered_list',
  };
  const supportedTopLevelTypes = new Set(Object.keys(blockTypes));

  export const EPISTEMIC_CONFIG = {
    claim: { label: 'Claim', icon: '🔵', desc: 'Defensible assertion requiring warrant' },
    evidence: { label: 'Evidence', icon: '🟢', desc: 'Direct primary source observation or empirical citation' },
    reasoning: { label: 'Causal Reasoning', icon: '🟣', desc: 'Causal mechanism or explanatory warrant' },
    assumption: { label: 'Assumption', icon: '🟡', desc: 'Implicit presupposition taken for granted' },
    premature_closure: { label: 'Premature Closure', icon: '🔴', desc: 'Conclusion leap asserted without sufficient backing' },
  };

  // State
  let editorElement;
  let editor = null;
  let editorState = $state({ editor: null });
  let baseRevision = $state(0);
  let baseline = {};
  let isSaving = $state(false);
  let isDirty = $state(false);
  let saveError = $state('');
  let saveErrorDetails = $state(null);
  let recoverySnapshot = $state(null);
  let lastConfirmedSaveAt = $state('');
  let wordCount = $state(0);
  let readingTimeMin = $derived(Math.max(1, Math.ceil(wordCount / 200)));
  let saveTimer;
  let classifyTimer;
  let probeTimer;
  let loadedDocumentId = '';

  let documentHeadings = $state([]);
  let isEpistemicLens = $state(true); // Default ON for subtle continuous truth guidance
  // Learner-controlled assistant drawer state.
  let activeSentence = $state(null);
  let chatMessages = $state([]);
  let chatInputText = $state('');
  let showSlashTools = $state(false);
  let selectedSlashToolIndex = $state(-1);
  let activeSlashTool = $state('');
  let isOracleThinking = $state(false);
  let isOracleSatisfied = $state(false);
  let oracleSatisfactionReason = $state('');
  let suggestedRevision = $state(null);
  let epistemicProgress = $state(0.4);
  let activeMoveType = $state('challenge');
  let chatMessagesContainer = $state(null);
  export function toggleSocraticDrawer() {
    if (activeSentence) {
      closeSentenceChat();
    } else if (proactiveProbes.length) {
      openProactiveProbe(proactiveProbes[0]);
    } else {
      openGeneralInquiry();
    }
  }

  function openGeneralInquiry() {
    const promptText = assignment?.published?.task?.prompt || assignment?.task?.prompt || 'This assignment';
    activeSentence = {
      text: promptText,
      epistemic_type: 'reasoning',
      surrounding_context: assignment?.purpose || '',
      is_general_inquiry: true,
    };
    isOracleSatisfied = false;
    oracleSatisfactionReason = '';
    suggestedRevision = null;
    epistemicProgress = 0.0;
    activeMoveType = 'socratic';
    chatInputText = '';
    // Student initiates the conversation cleanly (no unprompted Oracle greeting)
    chatMessages = [];
    if (onDrawerStateChange) onDrawerStateChange(true);
    triggerDecorationsUpdate();
  }

  function updateChatInput(event) {
    chatInputText = event.currentTarget.value;
    showSlashTools = !activeSlashTool && chatInputText.startsWith('/');
    if (!showSlashTools) selectedSlashToolIndex = -1;
  }

  function selectSlashTool(tool) {
    activeSlashTool = tool;
    chatInputText = '';
    showSlashTools = false;
    selectedSlashToolIndex = -1;
  }

  function clearSlashTool() {
    activeSlashTool = '';
    showSlashTools = false;
    selectedSlashToolIndex = -1;
  }

  // Sentence-level epistemic registry: key = sentence text or fingerprint -> classification
  let sentenceMap = $state({});

  // Derived metrics across all identified sentences
  let epistemicMetrics = $derived.by(() => {
    let c = 0, e = 0, r = 0, a = 0, p = 0;
    for (const item of Object.values(sentenceMap)) {
      if (item.epistemic_type === 'claim') c++;
      else if (item.epistemic_type === 'evidence') e++;
      else if (item.epistemic_type === 'reasoning') r++;
      else if (item.epistemic_type === 'assumption') a++;
      else if (item.epistemic_type === 'premature_closure') p++;
    }
    return { claim: c, evidence: e, reasoning: r, assumption: a, premature: p };
  });

  // Multi-Page Canvas & Outline Navigation State
  let currentPageIndex = $state(1);
  let pagesMap = $state({ 1: [] });
  let totalPages = $derived(Math.max(1, Object.keys(pagesMap).length));
  let isOutlineOpen = $state(true);

  // Canvas Width / Zoom State (narrow | wide | max) - strictly preserves A4 aspect ratio (210/297)
  let canvasWidthMode = $state(
    (typeof localStorage !== 'undefined' && localStorage.getItem('fiosra_canvas_width_mode')) || 'wide'
  );

  function setCanvasWidthMode(mode) {
    if (['narrow', 'wide', 'max'].includes(mode)) {
      canvasWidthMode = mode;
      try {
        localStorage.setItem('fiosra_canvas_width_mode', mode);
      } catch {}
    }
  }

  function saveCurrentPageEdits() {
    if (!editor) return;
    pagesMap[currentPageIndex] = currentEditorBlocks(currentPageIndex);
  }

  function goToPage(targetPage) {
    if (targetPage === currentPageIndex || targetPage < 1 || targetPage > totalPages) return;
    saveCurrentPageEdits();
    currentPageIndex = targetPage;
    const targetBlocks = pagesMap[targetPage] || [];
    editor.commands.setContent(documentContentFromBlocks(targetBlocks), { emitUpdate: false });
    editor.chain().focus('start').run();
    updateEditorMetrics();
    triggerDecorationsUpdate();
  }

  function prevPage() {
    if (currentPageIndex > 1) goToPage(currentPageIndex - 1);
  }

  function nextPage() {
    if (currentPageIndex < totalPages) goToPage(currentPageIndex + 1);
  }

  function addNewBlankPage() {
    if (disabled) return;
    saveCurrentPageEdits();
    const nextP = totalPages + 1;
    const newHeadingId = crypto.randomUUID();
    const newParaId = crypto.randomUUID();
    pagesMap[nextP] = [
      {
        block_id: newHeadingId,
        block_type: 'heading',
        content: {
          type: 'heading',
          attrs: { level: 2, blockId: newHeadingId, authorType: 'student', sectionId: `page_${nextP}`, pageNumber: nextP },
          content: [{ type: 'text', text: `Section ${nextP}` }]
        },
        plaintext: `Section ${nextP}`,
        position: 1,
        section_id: `page_${nextP}`,
        author_type: 'student'
      },
      {
        block_id: newParaId,
        block_type: 'paragraph',
        content: {
          type: 'paragraph',
          attrs: { blockId: newParaId, authorType: 'student', sectionId: `page_${nextP}`, pageNumber: nextP },
          content: []
        },
        plaintext: '',
        position: 2,
        section_id: `page_${nextP}`,
        author_type: 'student'
      }
    ];
    goToPage(nextP);
    scheduleSync();
  }

  function deletePage(pageToDelete) {
    if (disabled || totalPages <= 1) return;
    saveCurrentPageEdits();
    const newMap = {};
    let newIdx = 1;
    const sortedKeys = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);
    for (const p of sortedKeys) {
      if (p === pageToDelete) continue;
      newMap[newIdx] = (pagesMap[p] || []).map((b) => ({
        ...b,
        section_id: `page_${newIdx}`,
        content: {
          ...b.content,
          attrs: { ...(b.content?.attrs || {}), sectionId: `page_${newIdx}`, pageNumber: newIdx }
        }
      }));
      newIdx++;
    }
    pagesMap = newMap;
    const targetPage = Math.min(currentPageIndex, Object.keys(pagesMap).length);
    currentPageIndex = targetPage;
    editor.commands.setContent(documentContentFromBlocks(pagesMap[targetPage] || []), { emitUpdate: false });
    updateEditorMetrics();
    scheduleSync();
  }

  function jumpToOutlineHeading(item) {
    if (item.page !== currentPageIndex) {
      goToPage(item.page);
    }
    setTimeout(() => {
      scrollToBlock(item.blockId);
    }, 100);
  }

  function createBlockId() {
    return crypto.randomUUID();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // --- Sentence Segmentation & Fast Local Epistemic Classifier ---
  function localSentenceClassify(text, priorEvidenceSeen = false) {
    const t = text.trim();
    const tLow = t.toLowerCase();

    const isEvidence = /(?:source|evidence|report|study|data|observed|according to|citation)\b/i.test(tLow) || /[“"”].+?[“"”]/.test(t);
    const isCausal = /(?:because|leads? to|results? in|causes?|mechanism|due to|explains? why|therefore enables)\b/i.test(tLow);
    const isAssumption = /(?:assume|presume|suppose|inherently|naturally|obviously|inevitable|must be)\b/i.test(tLow);
    const isPremature = /(?:therefore|thus|hence|in conclusion|consequently|clearly proves?)\b/i.test(tLow) && !priorEvidenceSeen;

    if (isEvidence) {
      return {
        epistemic_type: 'evidence',
        confidence: 0.95,
        source_grounded: true,
        oracle_probe: 'Which specific details in this source directly verify your inference?',
      };
    }
    if (isPremature) {
      return {
        epistemic_type: 'premature_closure',
        confidence: 0.92,
        oracle_probe: 'You reached a conclusion, but what established evidence in your document has already justified this leap?',
      };
    }
    if (isAssumption) {
      return {
        epistemic_type: 'assumption',
        confidence: 0.88,
        oracle_probe: 'What unstated premise must hold true for this assertion, and what happens if it is invalid?',
      };
    }
    if (isCausal) {
      return {
        epistemic_type: 'reasoning',
        confidence: 0.90,
        oracle_probe: 'What mechanism connects the condition you describe to that outcome?',
      };
    }
    return {
      epistemic_type: 'claim',
      confidence: 0.85,
      oracle_probe: 'What empirical detail in an approved source could you point to before making this claim?',
    };
  }

  function splitIntoSentences(text, baseOffset) {
    if (!text || text.trim().length < 10) return [];
    if (!/[a-zA-Z]{3,}/.test(text)) return [];
    const results = [];
    const regex = /[^.!?]+(?:[.!?]+["'”’]?|\s*$)/g;
    let match;
    let priorEvidence = false;

    while ((match = regex.exec(text)) !== null) {
      const sentenceText = match[0];
      const trimmed = sentenceText.trim();
      if (trimmed.length >= 10 && /[a-zA-Z]{3,}/.test(trimmed)) {
        const leadingWhitespace = sentenceText.indexOf(trimmed);
        const from = baseOffset + match.index + leadingWhitespace;
        const to = from + trimmed.length;

        // Check cache or run fast local classifier
        let classification = sentenceMap[trimmed];
        if (!classification) {
          classification = localSentenceClassify(trimmed, priorEvidence);
          sentenceMap[trimmed] = classification;
        }
        if (classification.epistemic_type === 'evidence') priorEvidence = true;

        results.push({
          from,
          to,
          text: trimmed,
          ...classification,
        });
      }
    }
    return results;
  }

  // --- Backend LLM Epistemic Refinement ---
  async function requestLLMEpistemicClassification(paragraphText) {
    if (!sessionId || !paragraphText || paragraphText.trim().length < 20) return;
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(sessionAccessToken ? { 'X-Fiosra-Session-Token': sessionAccessToken } : {}),
      };
      const response = await fetch(`/learning-documents/sessions/${sessionId}/probes/epistemic-classify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: paragraphText.trim(),
          oracle_pressure: oraclePressure,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.sentences?.length) {
        for (const item of data.sentences) {
          if (item.sentence && item.epistemic_type) {
            sentenceMap[item.sentence.trim()] = {
              epistemic_type: item.epistemic_type,
              confidence: item.confidence || 0.9,
              oracle_probe: item.oracle_probe,
              source_grounded: Boolean(item.source_grounded),
            };
          }
        }
        triggerDecorationsUpdate();
        broadcastBlocks();
      }
    } catch (err) {
      console.warn('LLM epistemic classification background notice:', err);
    }
  }

  // --- On-Demand Socratic Dialectic Agent Inquiry ---
  async function requestSentenceInquiry(sentenceText, moveType = 'challenge', epistemicType = 'claim') {
    if (!sessionId || !sentenceText) return;
    isOracleThinking = true;
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(sessionAccessToken ? { 'X-Fiosra-Session-Token': sessionAccessToken } : {}),
      };
      const response = await fetch(`/learning-documents/sessions/${sessionId}/probes/sentence-inquire`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sentence: sentenceText.trim(),
          epistemic_type: epistemicType,
          move_type: moveType,
          oracle_pressure: oraclePressure,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (activeSentence && activeSentence.text === sentenceText) {
        activeSentence.oracle_probe = data.oracle_probe;
        activeSentence.epistemic_type = data.epistemic_type || epistemicType;
        activeSentence.targeted_vulnerability = data.targeted_vulnerability;
        activeSentence.socratic_moves = data.socratic_moves || [];
        activeMoveType = moveType;
      }
      if (sentenceMap[sentenceText]) {
        sentenceMap[sentenceText].oracle_probe = data.oracle_probe;
        sentenceMap[sentenceText].targeted_vulnerability = data.targeted_vulnerability;
        sentenceMap[sentenceText].socratic_moves = data.socratic_moves;
      }
    } catch (err) {
      console.warn('Sentence inquiry notice:', err);
    } finally {
      isOracleThinking = false;
    }
  }

  function scheduleLLMClassification() {
    clearTimeout(classifyTimer);
    classifyTimer = setTimeout(() => {
      // Drafting remains local and uninterrupted. The deterministic labels can
      // suggest an inquiry opportunity, but no model call or visible probe is
      // created until a learner opens the Enquirer and asks for assistance.
      triggerDecorationsUpdate();
    }, 1200);
  }

  function scheduleConceptProbeOffer(synced) {
    clearTimeout(probeTimer);
    const changedBlockIds = synced?.changed_block_ids || [];
    if (!synced?.document_revision || changedBlockIds.length === 0) return;
    // This quiet period means a question is offered after the learner pauses, not while they type.
    probeTimer = setTimeout(() => {
      onStableDocument({
        document_revision: synced.document_revision,
        changed_block_ids: changedBlockIds,
      });
    }, 5500);
  }

  function triggerDecorationsUpdate() {
    if (!editor?.view) return;
    editor.view.dispatch(editor.state.tr.setMeta('fiosra_inline_decorations_refresh', Date.now()));
  }

  function openSentenceChat(item, domElement) {
    if (activeSentence && activeSentence.text === item.text) return;

    activeSentence = { ...item };
    isOracleSatisfied = false;
    oracleSatisfactionReason = '';
    suggestedRevision = null;
    epistemicProgress = 0.0;
    const initialCategory = item.targeted_vulnerability ? 'assumptions' : 'challenge';
    activeMoveType = initialCategory;
    chatInputText = '';
    // Student initiates the conversation cleanly
    chatMessages = [];

    if (onDrawerStateChange) onDrawerStateChange(true);
    triggerDecorationsUpdate();

    // Smoothly scroll the sentence into view if needed
    if (domElement) {
      setTimeout(() => {
        domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  function closeSentenceChat() {
    activeSentence = null;
    chatMessages = [];
    chatInputText = '';
    isOracleSatisfied = false;
    suggestedRevision = null;
    if (onDrawerStateChange) onDrawerStateChange(false);
    triggerDecorationsUpdate();
  }

  function openProactiveProbe(probe) {
    if (!probe?.question) return;
    activeSentence = {
      text: probe.claim_text || 'Your saved claim',
      epistemic_type: 'claim',
      surrounding_context: '',
      proactive_probe_id: probe.probe_id,
      concept_label: probe.concept_label,
    };
    chatMessages = [{ role: 'oracle', content: probe.question, category: probe.focus_type }];
    isOracleSatisfied = false;
    suggestedRevision = null;
    epistemicProgress = 0.0;
    activeMoveType = probe.focus_type || 'challenge';
    if (onDrawerStateChange) onDrawerStateChange(true);
  }

  async function deferActiveProbe() {
    if (!activeSentence?.proactive_probe_id) return;
    await onProbeAction(activeSentence.proactive_probe_id, 'defer');
    closeSentenceChat();
  }

  export function openConceptProbe(probeId) {
    const probe = proactiveProbes.find((item) => item.probe_id === probeId);
    if (probe) openProactiveProbe(probe);
  }


  // --- ProseMirror Plugins ---
  const BlockIdentity = Extension.create({
    name: 'fiosraBlockIdentity',
    addGlobalAttributes() {
      return [{
        types: Object.keys(blockTypes),
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
          },
          sectionId: { default: null },
          authorType: { default: 'student' },
          isPageBreak: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-page-break') === 'true',
            renderHTML: (attributes) => attributes.isPageBreak ? { 'data-page-break': 'true', class: 'document-page-break' } : {},
          },
          pageNumber: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-page-number') ? parseInt(element.getAttribute('data-page-number')) : null,
            renderHTML: (attributes) => attributes.pageNumber ? { 'data-page-number': attributes.pageNumber } : {},
          },
        },
      }];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            const tr = newState.tr;
            const seenBlockIds = new Set();
            newState.doc.forEach((node, offset) => {
              if (!supportedTopLevelTypes.has(node.type.name)) return;
              const duplicated = node.attrs.blockId && seenBlockIds.has(node.attrs.blockId);
              if (!node.attrs.blockId || duplicated) {
                tr.setNodeMarkup(offset, undefined, {
                  ...node.attrs,
                  blockId: crypto.randomUUID(),
                  authorType: 'student',
                });
              }
              if (node.attrs.blockId) seenBlockIds.add(node.attrs.blockId);
            });
            return tr.docChanged ? tr : null;
          },
        }),
      ];
    },
  });

  // Native ProseMirror Inline Epistemic Sentence Decorator (No Bulky Widgets)
  const EpistemicInlineHighlighter = Extension.create({
    name: 'fiosraEpistemicInlineHighlighter',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              const decos = [];
              state.doc.descendants((node, pos) => {
                if ((node.type.name === 'paragraph' || node.type.name === 'blockquote') && node.isTextblock) {
                  const text = node.textContent;
                  const sentences = splitIntoSentences(text, pos + 1);
                  for (const s of sentences) {
                    if (s.from < s.to) {
                      const isActive = activeSentence && activeSentence.text === s.text;
                      decos.push(
                        Decoration.inline(s.from, s.to, {
                          class: `epistemic-sentence ${s.epistemic_type} ${isActive ? 'is-active-sentence' : ''}`,
                          'data-epistemic-type': s.epistemic_type,
                          title: `${EPISTEMIC_CONFIG[s.epistemic_type]?.label || s.epistemic_type}: Click to engage Socratic Oracle`,
                        })
                      );
                    }
                  }
                }
              });
              return DecorationSet.create(state.doc, decos);
            },
            handleClick(view, pos, event) {
              const target = event.target.closest('.epistemic-sentence');
              if (target) {
                const text = target.textContent.trim();
                const classification = sentenceMap[text] || localSentenceClassify(text);
                openSentenceChat({ text, ...classification }, target);
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });

  function normalizedNode(node, index) {
    const safeType = supportedTopLevelTypes.has(node?.type) ? node.type : 'paragraph';
    const attrs = { ...(node?.attrs || {}) };
    attrs.blockId = attrs.blockId || createBlockId();
    attrs.authorType = attrs.authorType === 'student_edited_assistance'
      ? 'student_edited_assistance'
      : 'student';
    if (safeType === 'heading' && ![1, 2, 3].includes(attrs.level)) attrs.level = 2;
    return {
      ...clone(node || { type: safeType }),
      type: safeType,
      attrs,
      content: node?.content || [],
      position: index + 1,
    };
  }

  function partitionStateBlocks(blocks) {
    const map = {};
    let currentP = 1;
    map[currentP] = [];

    for (const block of blocks || []) {
      let targetP = null;
      if (block.section_id && block.section_id.startsWith('page_')) {
        const num = parseInt(block.section_id.replace('page_', ''), 10);
        if (!isNaN(num) && num >= 1) targetP = num;
      } else if (block.content?.attrs?.pageNumber) {
        const num = Number(block.content.attrs.pageNumber);
        if (!isNaN(num) && num >= 1) targetP = num;
      } else if (block.content?.attrs?.isPageBreak) {
        currentP++;
        targetP = currentP;
      }

      if (targetP !== null) {
        currentP = targetP;
      }

      if (!map[currentP]) {
        map[currentP] = [];
      }

      const cleanedBlock = clone(block);
      if (cleanedBlock.content?.attrs?.isPageBreak) {
        delete cleanedBlock.content.attrs.isPageBreak;
      }
      cleanedBlock.section_id = `page_${currentP}`;
      map[currentP].push(cleanedBlock);
    }

    if (Object.keys(map).length === 0 || !map[1] || map[1].length === 0) {
      if (!map[1]) map[1] = [];
    }
    return map;
  }

  function documentContentFromBlocks(blocks) {
    const contentList = (blocks || []).map((block) => {
      const content = clone(block.content || { type: block.block_type || 'paragraph' });
      content.attrs = {
        ...(content.attrs || {}),
        blockId: block.block_id || createBlockId(),
        sectionId: block.section_id || null,
        authorType: block.author_type || 'student',
      };
      if (content.attrs?.isPageBreak) {
        delete content.attrs.isPageBreak;
      }
      return content;
    });
    return { type: 'doc', content: contentList.length ? contentList : [{ type: 'paragraph' }] };
  }

  function syncBaseline(state) {
    baseline = Object.fromEntries(
      (state?.blocks || []).map((block) => [
        block.block_id,
        JSON.stringify({
          block_id: block.block_id,
          block_type: block.block_type,
          content: block.content,
          position: block.position,
          section_id: block.section_id || null,
          author_type: block.author_type || 'student',
        }),
      ]),
    );
    baseRevision = state?.document_revision || 0;
    wordCount = (state?.blocks || [])
      .map((block) => block.plaintext || '')
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    extractHeadings();
    broadcastBlocks();
  }

  function extractHeadings() {
    const headings = [];
    const pageNumbers = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);
    for (const p of pageNumbers) {
      const pBlocks = (p === currentPageIndex && editor) ? currentEditorBlocks(p) : (pagesMap[p] || []);
      for (const b of pBlocks) {
        if (b.block_type === 'heading' || b.content?.type === 'heading') {
          headings.push({
            page: p,
            level: b.content?.attrs?.level || 2,
            text: b.plaintext || b.content?.content?.[0]?.text || 'Untitled section',
            blockId: b.block_id,
          });
        }
      }
    }
    documentHeadings = headings;
    onHeadingsChange(headings);
  }

  function broadcastBlocks() {
    if (!editor) return;
    const blocks = currentBlocks();
    onBlocksChange(blocks);
  }

  export function scrollToHeading(pos) {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
  }

  export function scrollToBlock(blockId) {
    let targetPage = null;
    const pageNumbers = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);
    for (const p of pageNumbers) {
      const pBlocks = (p === currentPageIndex && editor) ? currentEditorBlocks(p) : (pagesMap[p] || []);
      if (pBlocks.some((b) => b.block_id === blockId)) {
        targetPage = p;
        break;
      }
    }

    if (targetPage && targetPage !== currentPageIndex) {
      goToPage(targetPage);
    }

    setTimeout(() => {
      if (!editorElement) return;
      const el = editorElement.querySelector(`[data-block-id="${blockId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('sentence-pulse-highlight');
        setTimeout(() => el.classList.remove('sentence-pulse-highlight'), 1800);
      }
    }, 100);
  }

  export function expandBlockProbe(blockId) {
    if (!editorElement) return;
    const blockEl = editorElement.querySelector(`[data-block-id="${blockId}"]`);
    if (blockEl) {
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const sentenceEl = blockEl.querySelector('.epistemic-sentence') || blockEl;
      const text = (sentenceEl.textContent || blockEl.textContent || '').trim();
      const classification = sentenceMap[text] || {
        epistemic_type: 'claim',
        oracle_probe: 'What foundational evidence grounds this claim?',
        socratic_moves: ['Cite source evidence', 'State causal mechanism', 'Identify counter-thesis'],
      };
      openSentenceChat({ text, ...classification }, sentenceEl);
    }
  }

  async function loadRecoverySnapshot(state) {
    if (!state?.document_id || !sessionId) return;
    try {
      const snapshot = await loadDocumentRecovery(sessionId, state.document_id);
      if (snapshot?.blocks?.length) {
        recoverySnapshot = snapshot;
      }
    } catch (error) {
      console.warn('Local document recovery could not be loaded:', error);
    }
  }

  async function preserveLocalRecovery(blocks) {
    if (!learningDocument?.document_id || !sessionId) return;
    try {
      recoverySnapshot = await saveDocumentRecovery({
        sessionId,
        documentId: learningDocument.document_id,
        baseRevision,
        blocks,
      });
    } catch (error) {
      console.warn('Local document recovery could not be stored:', error);
    }
  }

  async function removeLocalRecovery() {
    if (!learningDocument?.document_id || !sessionId) return;
    try {
      await clearDocumentRecovery(sessionId, learningDocument.document_id);
      recoverySnapshot = null;
    } catch (error) {
      console.warn('Local document recovery could not be cleared:', error);
    }
  }

  function restoreLocalRecovery() {
    if (!recoverySnapshot?.blocks?.length || !editor) return;
    pagesMap = partitionStateBlocks(recoverySnapshot.blocks);
    currentPageIndex = 1;
    editor.commands.setContent(documentContentFromBlocks(pagesMap[1] || []), { emitUpdate: false });
    updateEditorMetrics();
    isDirty = true;
    saveErrorDetails = {
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
      correlationId: null,
    };
    saveError = 'Stored on this device — retry needed before your local changes are saved online.';
  }

  async function discardLocalRecovery() {
    await removeLocalRecovery();
    saveError = '';
    saveErrorDetails = null;
  }

  function initialiseEditor(state) {
    if (!editor || !state) return;
    loadedDocumentId = state.document_id;
    pagesMap = partitionStateBlocks(state.blocks);
    currentPageIndex = 1;
    const page1Blocks = pagesMap[1] || [];
    editor.commands.setContent(documentContentFromBlocks(page1Blocks), { emitUpdate: false });
    syncBaseline(state);
    isDirty = false;
    saveError = '';
    saveErrorDetails = null;
    lastConfirmedSaveAt = new Date().toISOString();
    void loadRecoverySnapshot(state);
    scheduleLLMClassification();
  }

  function currentEditorBlocks(pageIdx) {
    if (!editor) return [];
    const p = pageIdx || currentPageIndex;
    const rawNodes = editor.getJSON().content || [];
    return rawNodes
      .map(normalizedNode)
      .map((node, index) => {
        let text = '';
        try {
          const pmNode = editor.state.doc.maybeChild(index);
          text = pmNode ? pmNode.textContent : '';
        } catch {
          text = '';
        }
        return {
          block_id: node.attrs.blockId,
          block_type: blockTypes[node.type] || 'paragraph',
          content: {
            type: node.type,
            attrs: {
              ...node.attrs,
              sectionId: `page_${p}`,
              pageNumber: p,
            },
            ...(node.content?.length ? { content: node.content } : {}),
          },
          plaintext: text,
          position: index + 1,
          section_id: `page_${p}`,
          author_type: node.attrs.authorType || 'student',
        };
      });
  }

  export function currentBlocks() {
    if (!editor) return [];
    pagesMap[currentPageIndex] = currentEditorBlocks(currentPageIndex);

    const allBlocks = [];
    let globalPos = 1;
    const pageNumbers = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);
    for (const p of pageNumbers) {
      const pBlocks = pagesMap[p] || [];
      for (const b of pBlocks) {
        allBlocks.push({
          ...b,
          position: globalPos++,
          section_id: `page_${p}`,
          content: {
            ...b.content,
            attrs: {
              ...(b.content?.attrs || {}),
              sectionId: `page_${p}`,
              pageNumber: p,
            },
          },
        });
      }
    }
    return allBlocks;
  }

  function blockSignature(block) {
    return JSON.stringify({
      block_id: block.block_id,
      block_type: block.block_type,
      content: {
        ...block.content,
        attrs: {
          ...(block.content?.attrs || {}),
          blockId: block.block_id,
          sectionId: block.section_id || null,
        },
      },
      position: block.position,
      section_id: block.section_id || null,
      author_type: block.author_type || 'student',
    });
  }

  function updateEditorMetrics() {
    saveCurrentPageEdits();
    pruneStaleSentenceClassifications();
    let totalWords = 0;
    const pageNumbers = Object.keys(pagesMap).map(Number);
    for (const p of pageNumbers) {
      const pBlocks = (p === currentPageIndex && editor) ? currentEditorBlocks(p) : (pagesMap[p] || []);
      for (const b of pBlocks) {
        if (b.plaintext) {
          totalWords += b.plaintext.trim().split(/\s+/).filter(Boolean).length;
        }
      }
    }
    wordCount = totalWords;
    extractHeadings();
    broadcastBlocks();
  }

  function pruneStaleSentenceClassifications() {
    const liveSentences = new Set();
    const sentencePattern = /[^.!?]+(?:[.!?]+["'”’]?|\s*$)/g;

    for (const blocks of Object.values(pagesMap)) {
      for (const block of blocks || []) {
        const content = (block.plaintext || '').trim();
        if (!content) continue;
        for (const match of content.matchAll(sentencePattern)) {
          const sentence = match[0].trim();
          if (sentence.length >= 10) liveSentences.add(sentence);
        }
      }
    }

    for (const sentence of Object.keys(sentenceMap)) {
      if (!liveSentences.has(sentence)) delete sentenceMap[sentence];
    }
  }

  function scheduleSync() {
    if (disabled || !editor) return;
    isDirty = true;
    saveError = '';
    updateEditorMetrics();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => syncNow(), 900);
    scheduleLLMClassification();
  }

  export async function syncNow() {
    clearTimeout(saveTimer);
    if (!editor || disabled || isSaving || !isDirty) return;
    const blocks = currentBlocks();
    const next = Object.fromEntries(blocks.map((block) => [block.block_id, blockSignature(block)]));
    const changedBlocks = blocks.filter((block) => baseline[block.block_id] !== next[block.block_id]);
    const deletedBlockIds = Object.keys(baseline).filter((blockId) => !next[blockId]);
    if (!changedBlocks.length && !deletedBlockIds.length) {
      isDirty = false;
      return;
    }
    // Clean upserts to strictly conform to DocumentBlockInput (no extra fields like plaintext)
    const upserts = changedBlocks.map((b) => ({
      block_id: b.block_id,
      block_type: b.block_type,
      content: {
        ...b.content,
        attrs: {
          ...(b.content?.attrs || {}),
          blockId: b.block_id,
          sectionId: b.section_id || null,
        },
      },
      position: b.position,
      section_id: b.section_id || null,
      author_type: b.author_type || 'student',
    }));
    isSaving = true;
    saveError = '';
    saveErrorDetails = null;
    await preserveLocalRecovery(blocks);
    try {
      const synced = await onSync({
        base_revision: baseRevision,
        upserts,
        deleted_block_ids: deletedBlockIds,
      });
      if (!synced) return;
      syncBaseline(synced);
      isDirty = false;
      lastConfirmedSaveAt = new Date().toISOString();
      await removeLocalRecovery();
      onSynced(synced);
      scheduleConceptProbeOffer(synced);
    } catch (error) {
      saveErrorDetails = error?.fiosraError || {
        code: 'NETWORK_UNAVAILABLE',
        retryable: true,
        correlationId: null,
      };
      saveError = error?.message || learnerErrorSummary(saveErrorDetails, { draftPreserved: true });
    } finally {
      isSaving = false;
    }
  }

  function setBlock(type, attrs = {}) {
    editor?.chain().focus().setNode(type, attrs).run();
  }

  function toggleMark(mark) {
    if (!editor || disabled) return;
    if (mark === 'bold') editor.chain().focus().toggleBold().run();
    if (mark === 'italic') editor.chain().focus().toggleItalic().run();
  }

  // --- Learner-controlled assistant actions ---
  async function sendStudentMessage(explicitText = null) {
    const raw = typeof explicitText === 'string' ? explicitText : chatInputText;
    const text = [activeSlashTool, raw.trim()].filter(Boolean).join(' ');
    if (!text || isOracleThinking || !activeSentence) return;

    chatInputText = '';
    chatMessages = [...chatMessages, { role: 'student', content: text }];
    isOracleThinking = true;

    if (text.startsWith('/mode')) {
      const modeArg = text.replace('/mode', '').trim().toLowerCase();
      if (modeArg && ['socratic', 'adversarial', 'brainstorm', 'structural', 'hint', 'assumptions'].includes(modeArg)) {
        oraclePressure = modeArg;
        if (onPressureChange) onPressureChange(modeArg);
      }
    }

    // Scroll chat feed
    setTimeout(() => {
      if (chatMessagesContainer) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
    }, 50);

    try {
      const validMoveTypes = new Set(['challenge', 'why_ladder', 'assumptions', 'source', 'counterfactual', 'creative', 'socratic']);
      const safeMoveType = validMoveTypes.has(activeMoveType) ? activeMoveType : 'challenge';

      const headers = {
        'Content-Type': 'application/json',
        ...(sessionAccessToken ? { 'X-Fiosra-Session-Token': sessionAccessToken } : {}),
      };
      const url = sessionAccessToken 
        ? `/learning-documents/sessions/${sessionId}/probes/dialectical-turn?access_token=${encodeURIComponent(sessionAccessToken)}`
        : `/learning-documents/sessions/${sessionId}/probes/dialectical-turn`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sentence: activeSentence.text,
          epistemic_type: activeSentence.epistemic_type || 'claim',
          history: chatMessages.slice(0, -1),
          student_reply: text,
          surrounding_context: activeSentence.surrounding_context || '',
          move_type: safeMoveType,
          oracle_pressure: oraclePressure,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const nextCategory = data.current_probe_category || activeMoveType;
        activeMoveType = nextCategory;
        const interactiveActions = [...(data.interactive_actions || [])];
        if (data.helper_action?.blocks?.length) {
          interactiveActions.push({
            action_type: 'apply_canvas_action',
            label: data.helper_action.summary || 'Add this to the canvas',
            icon: '＋',
            payload: { helper_action: data.helper_action },
          });
        }
        chatMessages = [
          ...chatMessages,
          {
            role: 'oracle',
            content: data.oracle_reply,
            category: nextCategory,
            interactive_actions: interactiveActions,
            outline_options: data.outline_options || [],
          }
        ];
        isOracleSatisfied = Boolean(data.is_satisfied);
        oracleSatisfactionReason = data.satisfaction_reason || '';
        suggestedRevision = data.suggested_revision || null;
        epistemicProgress = typeof data.epistemic_progress === 'number' ? data.epistemic_progress : (data.is_satisfied ? 1.0 : epistemicProgress);
        if (data.socratic_moves?.length) {
          activeSentence.socratic_moves = data.socratic_moves;
        }

        // Notify parent workspace trace
        if (onProbeResponse) {
          onProbeResponse(activeSentence.text, text);
        }
      } else {
        const details = await responseErrorDetails(response, 'Fiosra is temporarily unavailable. Your draft has not changed.');
        chatMessages = [
          ...chatMessages,
          {
            role: 'oracle',
            content: learnerErrorSummary(details, { draftPreserved: true }),
            category: 'socratic',
            error: details,
            interactive_actions: details.retryable
              ? [{ action_type: 'retry_assistance', label: 'Retry', icon: '↻', payload: {} }]
              : []
          }
        ];
      }
    } catch (err) {
      console.error('Error in dialectical turn:', err);
      const details = {
        code: 'NETWORK_UNAVAILABLE',
        retryable: true,
        correlationId: null,
      };
      chatMessages = [
        ...chatMessages,
          {
            role: 'oracle',
            content: learnerErrorSummary(details, { draftPreserved: true }),
            category: 'socratic',
            error: details,
            interactive_actions: [{ action_type: 'retry_assistance', label: 'Retry', icon: '↻', payload: {} }]
        }
      ];
    } finally {
      isOracleThinking = false;
      setTimeout(() => {
        if (chatMessagesContainer) {
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
      }, 50);
    }
  }

  function retryLastStudentMessage() {
    if (isOracleThinking) return;
    const studentIndex = [...chatMessages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === 'student')?.index;
    if (studentIndex === undefined) return;
    const previous = chatMessages[studentIndex];
    chatMessages = chatMessages.slice(0, studentIndex);
    void sendStudentMessage(previous.content);
  }

  function handleInteractiveAction(action) {
    if (!action || action.applied) return;
    const actionType = action.action_type || action.action;
    if (actionType === 'retry_assistance') {
      retryLastStudentMessage();
    } else if (actionType === 'apply_canvas_action' && action.payload?.helper_action) {
      applyHelperCanvasAction(action.payload.helper_action);
    } else if (actionType === 'open_sources' || actionType === 'cite_source') {
      onOpenSources();
    } else if (actionType === 'scaffold_sections' || actionType === 'scaffold_section') {
      const payload = action.payload || {};
      const targetPage = currentPageIndex || 1;
      const pageSecId = `page_${targetPage}`;
      const title = payload.title || payload.section_title || 'New section';
      const headingId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'b_' + Date.now();
      const paraId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'p_' + Date.now();

      const blocks = [
        {
          block_id: headingId,
          block_type: 'heading',
          section_id: pageSecId,
          author_type: 'student',
          content: {
            type: 'heading',
            attrs: {
              level: 2,
              blockId: headingId,
              authorType: 'student',
              sectionId: pageSecId,
              pageNumber: targetPage,
            },
            content: [{ type: 'text', text: title }]
          }
        },
        {
          block_id: paraId,
          block_type: 'paragraph',
          section_id: pageSecId,
          author_type: 'student',
          content: {
            type: 'paragraph',
            attrs: {
              blockId: paraId,
              authorType: 'student',
              sectionId: pageSecId,
              pageNumber: targetPage,
            },
            ...(payload.writing_prompt
              ? { content: [{ type: 'text', text: payload.writing_prompt }] }
              : {}),
          }
        }
      ];

      applyHelperCanvasAction({
        action: 'scaffold_sections',
        target_page: targetPage,
        blocks: blocks
      });
    } else if (actionType === 'explore_prompt') {
      const prompt = action.payload?.prompt;
      if (prompt) {
        sendStudentMessage(prompt);
      }
    }
    action.applied = true;
    chatMessages = [...chatMessages];
  }

  function proposedSectionTitles(action) {
    const blocks = action?.payload?.helper_action?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .filter((block) => block?.block_type === 'heading')
      .map((block) => block?.content?.content?.[0]?.text?.trim())
      .filter(Boolean);
  }

  function applyOutlineOption(option) {
    if (option?.applied) return;
    const sectionTitles = Array.isArray(option?.section_titles) ? option.section_titles : [];
    if (sectionTitles.length !== 3) return;
    const targetPage = currentPageIndex || 1;
    const sectionId = `page_${targetPage}`;
    const blocks = sectionTitles.flatMap((title, index) => {
      const timestamp = Date.now() + index;
      const headingId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `heading_${timestamp}`;
      const paragraphId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `paragraph_${timestamp}`;
      return [
        {
          block_id: headingId,
          block_type: 'heading',
          section_id: sectionId,
          author_type: 'student',
          content: {
            type: 'heading',
            attrs: { level: 2, blockId: headingId, authorType: 'student', sectionId, pageNumber: targetPage },
            content: [{ type: 'text', text: title }],
          },
        },
        {
          block_id: paragraphId,
          block_type: 'paragraph',
          section_id: sectionId,
          author_type: 'student',
          content: {
            type: 'paragraph',
            attrs: { blockId: paragraphId, authorType: 'student', sectionId, pageNumber: targetPage },
          },
        },
      ];
    });
    applyHelperCanvasAction({
      action: 'scaffold_sections',
      target_page: targetPage,
      blocks,
    });
    option.applied = true;
    chatMessages = [...chatMessages];
  }

  // Canvas changes run only after the learner accepts an attached action.
  function applyHelperCanvasAction(helperAction) {
    if (!helperAction || !Array.isArray(helperAction.blocks) || helperAction.blocks.length === 0) return;
    saveCurrentPageEdits();

    const targetPage = Number(helperAction.target_page) || 1;
    if (!pagesMap[targetPage]) {
      pagesMap[targetPage] = [];
    }

    const currentBlocksForPage = pagesMap[targetPage] || [];

    if (helperAction.action === 'scaffold_sections') {
      // Filter out empty initial placeholder block if present
      const filteredExisting = currentBlocksForPage.filter(b => {
        const txt = (b.plaintext || b.content?.content?.[0]?.text || '').trim();
        return txt && !txt.includes('Start writing your response');
      });

      const startPos = filteredExisting.length + 1;
      const formattedNew = helperAction.blocks.map((b, i) => ({
        ...b,
        position: startPos + i,
        section_id: `page_${targetPage}`,
        author_type: 'student_edited_assistance',
        content: {
          ...b.content,
          attrs: {
            ...(b.content?.attrs || {}),
            sectionId: `page_${targetPage}`,
            pageNumber: targetPage,
          }
        }
      }));

      pagesMap[targetPage] = [...filteredExisting, ...formattedNew];

      if (currentPageIndex === targetPage && editor) {
        editor.commands.setContent(documentContentFromBlocks(pagesMap[targetPage]), { emitUpdate: false });
      } else {
        goToPage(targetPage);
      }

      extractHeadings();
      broadcastBlocks();
      isDirty = true;
      syncNow();

      // Highlight the first new section heading briefly
      setTimeout(() => {
        if (!editorElement) return;
        const firstNewId = formattedNew[0]?.block_id;
        if (firstNewId) {
          const el = editorElement.querySelector(`[data-block-id="${firstNewId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('sentence-pulse-highlight');
            setTimeout(() => el.classList.remove('sentence-pulse-highlight'), 2500);
          }
        }
      }, 150);

    } else if (helperAction.action === 'insert_claim') {
      const targetSec = (helperAction.target_section || '').toLowerCase();
      let insertIdx = currentBlocksForPage.length;

      if (targetSec) {
        for (let i = 0; i < currentBlocksForPage.length; i++) {
          const b = currentBlocksForPage[i];
          const text = (b.plaintext || b.content?.content?.[0]?.text || '').toLowerCase();
          if ((b.block_type === 'heading' || b.content?.type === 'heading') && (text.includes(targetSec) || targetSec.includes(text))) {
            insertIdx = i + 1;
            while (
              insertIdx < currentBlocksForPage.length && 
              currentBlocksForPage[insertIdx].block_type !== 'heading' && 
              currentBlocksForPage[insertIdx].content?.type !== 'heading'
            ) {
              insertIdx++;
            }
            break;
          }
        }
      }

      const formattedClaimBlocks = helperAction.blocks.map((b, i) => ({
        ...b,
        position: insertIdx + i + 1,
        section_id: `page_${targetPage}`,
        author_type: 'student_edited_assistance',
        content: {
          ...b.content,
          attrs: {
            ...(b.content?.attrs || {}),
            sectionId: `page_${targetPage}`,
            pageNumber: targetPage,
          }
        }
      }));

      const updated = [...currentBlocksForPage];
      updated.splice(insertIdx, 0, ...formattedClaimBlocks);
      pagesMap[targetPage] = updated.map((b, idx) => ({ ...b, position: idx + 1 }));

      if (currentPageIndex === targetPage && editor) {
        editor.commands.setContent(documentContentFromBlocks(pagesMap[targetPage]), { emitUpdate: false });
      } else {
        goToPage(targetPage);
      }

      extractHeadings();
      broadcastBlocks();
      isDirty = true;
      syncNow();

      // Highlight the new claim block
      setTimeout(() => {
        if (!editorElement) return;
        const claimId = formattedClaimBlocks[0]?.block_id;
        if (claimId) {
          const el = editorElement.querySelector(`[data-block-id="${claimId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('sentence-pulse-highlight');
            setTimeout(() => el.classList.remove('sentence-pulse-highlight'), 2500);
          }
        }
      }, 150);
    }
  }

  async function nudgeOracleCategory(moveType) {
    if (!activeSentence || isOracleThinking) return;
    activeMoveType = moveType;
    if (moveType === 'source') {
      onOpenSources();
    }
    onChallengeIdea(activeSentence.text, activeSentence.text, moveType);

    // If initial probe only, update tailored probe under this lens
    if (chatMessages.length <= 1) {
      await requestSentenceInquiry(activeSentence.text, moveType, activeSentence.epistemic_type || 'claim');
      return;
    }

    // In an ongoing dialogue, naturally introduce a probe under this lens without resetting history
    isOracleThinking = true;
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(sessionAccessToken ? { 'X-Fiosra-Session-Token': sessionAccessToken } : {}),
      };
      const response = await fetch(`/learning-documents/sessions/${sessionId}/probes/sentence-inquire`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sentence: activeSentence.text.trim(),
          epistemic_type: activeSentence.epistemic_type || 'claim',
          move_type: moveType,
          oracle_pressure: oraclePressure,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        chatMessages = [
          ...chatMessages,
          {
            role: 'oracle',
            content: data.oracle_probe,
            category: moveType,
          }
        ];
      }
    } catch (err) {
      console.warn('Notice nudging oracle lens:', err);
    } finally {
      isOracleThinking = false;
      setTimeout(() => {
        if (chatMessagesContainer) {
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
      }, 50);
    }
  }

  function applySuggestedRevision() {
    if (!editor?.view || !activeSentence || !suggestedRevision) return;
    const oldText = activeSentence.text;
    const newText = suggestedRevision;
    const { state, dispatch } = editor.view;
    let replaced = false;

    state.doc.descendants((node, pos) => {
      if (replaced) return false;
      if (node.isText) {
        const idx = node.text.indexOf(oldText);
        if (idx !== -1) {
          const from = pos + idx;
          const to = from + oldText.length;
          const tr = state.tr.replaceWith(from, to, state.schema.text(newText));
          dispatch(tr);
          replaced = true;
          return false;
        }
      }
    });

    if (replaced) {
      activeSentence.text = newText;
      suggestedRevision = null;
      triggerDecorationsUpdate();
      scheduleLLMClassification();
    }
  }

  onMount(() => {
    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: false,
          horizontalRule: false,
          link: false,
        }),
        BlockIdentity,
        EpistemicInlineHighlighter,
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      editorProps: {
        attributes: {
          class: 'notion-minimal-prosemirror',
          'aria-label': 'Notion-style long-form reasoning canvas',
        },
      },
      onUpdate: () => {
        editorState = { editor };
        scheduleSync();
        triggerDecorationsUpdate();
      },
      onTransaction: () => {
        editorState = { editor };
        extractHeadings();
      },
    });
    editorState = { editor };
    if (learningDocument) initialiseEditor(learningDocument);
  });

  $effect(() => {
    if (editor && learningDocument && learningDocument.document_id !== loadedDocumentId) {
      initialiseEditor(learningDocument);
    }
  });

  onDestroy(() => {
    clearTimeout(saveTimer);
    clearTimeout(classifyTimer);
    clearTimeout(probeTimer);
    editor?.destroy();
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeSentenceChat(); }} />

<div class="canvas-split-container" class:has-chat-open={Boolean(activeSentence)} class:has-outline-open={isOutlineOpen}>
  <!-- Left Document Outline Navigation Panel -->
  {#if isOutlineOpen}
    <aside class="document-outline-sidebar" aria-label="Document Outline">
      <div class="outline-header">
        <div class="outline-title-row">
          <span class="outline-heading-label">Document Outline</span>
          <button 
            type="button" 
            class="outline-collapse-btn" 
            onclick={() => isOutlineOpen = false}
            title="Collapse outline"
          >
            ✕
          </button>
        </div>
        <div class="outline-meta-sub">
          <span>{totalPages} {totalPages === 1 ? 'Page' : 'Pages'}</span>
          <span>•</span>
          <span>{documentHeadings.length} {documentHeadings.length === 1 ? 'Heading' : 'Headings'}</span>
        </div>
      </div>

      <div class="outline-tree-container">
        {#each Object.keys(pagesMap).map(Number).sort((a, b) => a - b) as p}
          {@const pHeadings = documentHeadings.filter(h => h.page === p)}
          <div class="outline-page-group" class:is-current-page={p === currentPageIndex}>
            <button 
              type="button" 
              class="outline-page-item" 
              class:active={p === currentPageIndex}
              onclick={() => goToPage(p)}
              title="Go to Page {p}"
            >
              <div class="outline-page-item-left">
                <span class="page-sheet-icon">📄</span>
                <span class="page-name">Page {p}</span>
              </div>
              <span class="page-item-badge">{pHeadings.length} sec</span>
            </button>

            {#if pHeadings.length > 0}
              <div class="outline-headings-list">
                {#each pHeadings as h}
                  <button 
                    type="button" 
                    class="outline-heading-item level-{h.level}"
                    onclick={() => jumpToOutlineHeading(h)}
                    title="Jump to {h.text}"
                  >
                    <span class="heading-tag">H{h.level}</span>
                    <span class="heading-text">{h.text}</span>
                  </button>
                {/each}
              </div>
            {:else}
              <div class="outline-empty-page-hint">
                <span>(No headings)</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </aside>
  {/if}

  <!-- Main Canvas Pane (Pushes to left when chat drawer is open) -->
  <main class="editor-main-pane">
    <section 
      class="minimal-notion-shell" 
      class:canvas-narrow={canvasWidthMode === 'narrow'}
      class:canvas-wide={canvasWidthMode === 'wide'}
      class:canvas-max={canvasWidthMode === 'max'}
      aria-label="Paginated A4 Socratic Canvas"
    >
      <!-- Minimalist Top Navigation & Status -->
      <header class="minimal-toolbar">
        <div class="toolbar-left">
          <button 
            type="button" 
            class="tool-btn outline-toggle-btn"
            class:active={isOutlineOpen}
            onclick={() => isOutlineOpen = !isOutlineOpen}
            title="Toggle document outline & sections"
          >
            <span class="outline-icon">☰</span>
            <span>Outline</span>
          </button>

          <div class="v-divider"></div>

          <button 
            type="button"
            class="tool-btn" 
            class:active={editorState.editor?.isActive('paragraph')} 
            onclick={() => setBlock('paragraph')} 
            disabled={disabled}
          >
            Text
          </button>
          <button 
            type="button" 
            class="tool-btn" 
            class:active={editorState.editor?.isActive('heading', { level: 1 })} 
            onclick={() => editorState.editor?.chain().focus().toggleHeading({ level: 1 }).run()} 
            disabled={disabled}
          >
            H1
          </button>
          <button 
            type="button" 
            class="tool-btn" 
            class:active={editorState.editor?.isActive('heading', { level: 2 })} 
            onclick={() => editorState.editor?.chain().focus().toggleHeading({ level: 2 }).run()} 
            disabled={disabled}
          >
            H2
          </button>
          <button 
            type="button" 
            class="tool-btn font-bold" 
            class:active={editorState.editor?.isActive('bold')} 
            onclick={() => toggleMark('bold')} 
            disabled={disabled}
          >
            B
          </button>
          <button 
            type="button" 
            class="tool-btn font-italic" 
            class:active={editorState.editor?.isActive('italic')} 
            onclick={() => toggleMark('italic')} 
            disabled={disabled}
          >
            I
          </button>
          <button 
            type="button" 
            class="tool-btn" 
            class:active={editorState.editor?.isActive('blockquote')} 
            onclick={() => editorState.editor?.chain().focus().toggleBlockquote().run()} 
            disabled={disabled}
          >
            “Quote”
          </button>
        </div>

        <div class="toolbar-center">
          <!-- Minimalist High-Visibility Truth Highlights Toggle -->
          <button 
            type="button"
            class="truth-highlights-toggle"
            class:active={isEpistemicLens}
            onclick={() => isEpistemicLens = !isEpistemicLens}
            title="Toggle sentence-level epistemic highlighting & analysis"
            aria-pressed={isEpistemicLens}
          >
            <span class="truth-toggle-ring">
              <span class="truth-toggle-pip"></span>
            </span>
            <span class="truth-toggle-text">Truth Highlights</span>
            <span class="truth-toggle-pill">{isEpistemicLens ? 'ON' : 'OFF'}</span>
          </button>

          <!-- Epistemic Live Sentence Counters -->
          {#if isEpistemicLens}
            <div class="epistemic-sentence-strip">
              <span class="strip-pill claim" title="🔵 Claims">
                🔵 <strong>{epistemicMetrics.claim}</strong>
              </span>
              <span class="strip-pill evidence" title="🟢 Grounded Evidence">
                🟢 <strong>{epistemicMetrics.evidence}</strong>
              </span>
              <span class="strip-pill reasoning" title="🟣 Causal Reasoning">
                🟣 <strong>{epistemicMetrics.reasoning}</strong>
              </span>
              <span class="strip-pill assumption" title="🟡 Assumptions">
                🟡 <strong>{epistemicMetrics.assumption}</strong>
              </span>
              {#if epistemicMetrics.premature > 0}
                <span class="strip-pill premature" title="🔴 Premature Closures (Unsupported Leaps)">
                  🔴 <strong>{epistemicMetrics.premature}</strong> Leaps
                </span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="toolbar-right">
          <!-- Canvas Width (Zoom) Selector - Strictly Preserves A4 -->
          <div class="canvas-zoom-control">
            <span class="zoom-icon" aria-hidden="true">⤢</span>
            <select 
              id="canvas-width-dropdown"
              class="canvas-zoom-select"
              value={canvasWidthMode}
              onchange={(e) => setCanvasWidthMode(e.currentTarget.value)}
              title="Canvas Width (Narrow / Wide / Max)"
              aria-label="Canvas Width"
            >
              <option value="narrow">Narrow</option>
              <option value="wide">Wide</option>
              <option value="max">Max</option>
            </select>
          </div>

          <div class="v-divider"></div>

          <div class="save-status-text" aria-live="polite">
            {#if saveError}
              <span class="save-status-message">⚠️ {saveError}</span>
              {#if saveErrorDetails?.retryable}
                <button type="button" class="save-status-action" onclick={syncNow} disabled={isSaving}>Retry save</button>
              {/if}
              {#if saveErrorDetails?.correlationId}
                <small class="save-status-correlation">Support ID: {saveErrorDetails.correlationId}</small>
              {/if}
            {:else if isSaving}
              <span>Saving…</span>
            {:else if isDirty}
              <span>Autosaving…</span>
            {:else}
              <span>✓ Saved{lastConfirmedSaveAt ? ' just now' : ''}</span>
            {/if}
          </div>
        </div>
      </header>

      {#if recoverySnapshot && !isDirty}
        <aside class="document-recovery-banner" role="status">
          <div>
            <strong>Unsaved local draft found</strong>
            <p>
              A copy from {new Date(recoverySnapshot.savedAt).toLocaleString()} is stored on this device.
              Restore it only if it is the version you want to save.
            </p>
          </div>
          <div class="document-recovery-actions">
            <button type="button" class="recovery-restore-btn" onclick={restoreLocalRecovery}>Restore local draft</button>
            <button type="button" class="recovery-discard-btn" onclick={discardLocalRecovery}>Discard copy</button>
          </div>
        </aside>
      {/if}

      <!-- Clean, Distraction-Free Notion-Style Page (Expansive A4 / Letter Canvas) -->
      <div class="document-page" class:epistemic-active={isEpistemicLens}>
        <div class="document-page-header">
          <span class="page-watermark">
            Page {currentPageIndex} of {totalPages}
            <span class="page-watermark-dim">• {canvasWidthMode.toUpperCase()}</span>
          </span>
        </div>
        <div bind:this={editorElement} class="notion-editor-container"></div>
      </div>

      <!-- Bottom Pagination Bar -->
      <div class="canvas-pagination-bar" aria-label="Page Navigation">
        <div class="pagination-controls">
          <button 
            type="button" 
            class="page-nav-btn prev-btn" 
            onclick={prevPage}
            disabled={currentPageIndex <= 1}
            title="Previous page"
          >
            ‹ Prev
          </button>

          <div class="page-numbers-group">
            {#each Object.keys(pagesMap).map(Number).sort((a, b) => a - b) as p}
              <button 
                type="button" 
                class="page-number-pill" 
                class:active={p === currentPageIndex}
                onclick={() => goToPage(p)}
                title="Page {p}"
              >
                {p}
              </button>
            {/each}
          </div>

          <button 
            type="button" 
            class="page-nav-btn next-btn" 
            onclick={nextPage}
            disabled={currentPageIndex >= totalPages}
            title="Next page"
          >
            Next ›
          </button>

          <div class="pagination-divider"></div>

          <button 
            type="button" 
            class="pagination-add-page-btn" 
            onclick={addNewBlankPage}
            disabled={disabled}
            title="Open a new blank page"
          >
            <span class="plus-sign">＋</span>
            <span>Add Page</span>
          </button>

          {#if totalPages > 1}
            <button 
              type="button" 
              class="pagination-delete-page-btn" 
              onclick={() => deletePage(currentPageIndex)}
              disabled={disabled}
              title="Delete current page ({currentPageIndex})"
            >
              <span>Delete Page</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Minimal Bottom Status Info -->
      <footer class="minimal-footer">
        <span>{wordCount.toLocaleString()} words</span>
        <span>•</span>
        <span>{readingTimeMin} min read</span>
        <span>•</span>
        <span>{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
        <span>•</span>
        <span>{documentHeadings.length} {documentHeadings.length === 1 ? 'section' : 'sections'}</span>
      </footer>
    </section>
  </main>

  <!-- Assistant drawer pushes the editor left. -->
  {#if activeSentence}
    <aside class="socratic-chat-drawer" aria-label="Writing help">
      <div class="drawer-header">
        <div class="drawer-header-title">
          <span class="oracle-name">Ask Fiosra</span>
        </div>
        <button type="button" class="drawer-close-btn" onclick={closeSentenceChat} title="Close drawer (Esc)">
          ✕
        </button>
      </div>

      <!-- Active Sentence Quote Card -->
      {#if activeSentence.is_general_inquiry}
          <div class="drawer-quote-card general-inquiry">
          <details class="assignment-context">
            <summary>Assignment brief</summary>
            <blockquote class="sentence-text-quote general">
              "{activeSentence.text}"
            </blockquote>
          </details>
          </div>
      {:else}
        <div class="drawer-quote-card {activeSentence.epistemic_type || 'claim'}">
          <div class="quote-meta-row">
            <span class="epistemic-badge {activeSentence.epistemic_type || 'claim'}">
              <span>{EPISTEMIC_CONFIG[activeSentence.epistemic_type]?.icon || '🔵'}</span>
              <strong>{EPISTEMIC_CONFIG[activeSentence.epistemic_type]?.label || 'Claim'}</strong>
            </span>
            {#if activeSentence.targeted_vulnerability}
              <span class="vulnerability-tag">
                ⚠️ {activeSentence.targeted_vulnerability}
              </span>
            {/if}
          </div>
          {#if activeSentence.concept_label}
            <p class="concept-context">Exploring: {activeSentence.concept_label}</p>
          {/if}
          <blockquote class="sentence-text-quote">
            "{activeSentence.text}"
          </blockquote>

          <!-- Minimalist Conversation Progress Indicator -->
          <div class="conversation-progress-box">
            <div class="progress-info-row">
              <span class="progress-title">Conversation Progress</span>
              <span class="progress-fraction">{Math.round(epistemicProgress * 100)}%</span>
            </div>
            <div class="progress-track-minimal">
              <div 
                class="progress-fill-minimal" 
                style="width: {Math.max(10, Math.min(100, Math.round(epistemicProgress * 100)))}%"
              ></div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Multi-Turn Chat Feed -->
      <div class="chat-messages-stream" bind:this={chatMessagesContainer}>
        {#if chatMessages.length === 0}
          <div class="empty-inquiry-starter">
            <p class="starter-subtitle">
              Ask about a source, an idea, or how to organise your next step. Fiosra will not change your draft unless you choose an offered action.
            </p>
          </div>
        {/if}

        {#each chatMessages as msg}
          <div class="chat-bubble-row {msg.role}">
            <div class="chat-bubble {msg.role}">
              <div class="bubble-meta-header">
                <span class="bubble-author">{msg.role === 'oracle' ? 'Fiosra' : 'You'}</span>
              </div>
              <p class="bubble-text">{msg.content}</p>
              {#if msg.error?.correlationId}
                <small class="assistant-error-correlation">Support ID: {msg.error.correlationId}</small>
              {/if}

              {#if msg.role === 'oracle' && msg === chatMessages[0] && activeSentence.proactive_probe_id}
                <button type="button" class="defer-probe-link" onclick={deferActiveProbe}>Continue drafting for now</button>
              {/if}

              {#if msg.role === 'oracle' && msg.outline_options && msg.outline_options.length > 0}
                <div class="outline-options" aria-label="Suggested assignment structures">
                  {#each msg.outline_options as option}
                    <article class="outline-option">
                      <strong>{option.title}</strong>
                      <p>{option.reasoning_focus}</p>
                      <ol>
                        {#each option.section_titles as sectionTitle}
                          <li>{sectionTitle}</li>
                        {/each}
                      </ol>
                      <button type="button" onclick={() => applyOutlineOption(option)} disabled={option.applied}>
                        {option.applied ? 'Added to canvas' : 'Use this structure'}
                      </button>
                    </article>
                  {/each}
                </div>
              {/if}

              {#if msg.role === 'oracle' && msg.interactive_actions && msg.interactive_actions.length > 0}
                <div class="interactive-actions-bar">
                  {#each msg.interactive_actions as action}
                    {#if action.action_type === 'apply_canvas_action' && proposedSectionTitles(action).length > 0}
                      <div class="canvas-proposal-preview">
                        <span>Proposed sections</span>
                        <ol>
                          {#each proposedSectionTitles(action) as sectionTitle}
                            <li>{sectionTitle}</li>
                          {/each}
                        </ol>
                      </div>
                    {/if}
                    <button
                      type="button"
                      class="bubble-action-btn"
                      onclick={() => handleInteractiveAction(action)}
                      disabled={action.applied}
                    >
                      <span class="action-btn-icon">{action.icon || '✦'}</span>
                      <span class="action-btn-label">{action.applied ? 'Added to canvas' : action.label}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if isOracleThinking}
          <div class="chat-bubble-row oracle">
            <div class="chat-bubble oracle thinking">
              <span class="thinking-spinner">◌</span>
              <em>Thinking…</em>
            </div>
          </div>
        {/if}

        <!-- Minimal Refinement Suggestion (No Celebration) -->
        {#if suggestedRevision}
          <div class="minimal-refinement-box">
            <div class="minimal-refinement-header">
              <span class="refinement-icon">💡</span>
              <span class="refinement-label">Suggested Fortification</span>
            </div>
            <p class="refinement-text">"{suggestedRevision}"</p>
            <button 
              type="button" 
              class="refinement-apply-btn"
              onclick={applySuggestedRevision}
            >
              Apply to canvas
            </button>
          </div>
        {/if}
      </div>

      <!-- Chat Input Footer -->
      <footer class="drawer-input-footer">
        {#if showSlashTools}
          <div class="slash-command-menu" role="listbox" aria-label="Writing help tools">
            <button
              type="button"
              class="slash-menu-item"
              class:selected={selectedSlashToolIndex === 0}
              role="option"
              aria-selected={selectedSlashToolIndex === 0}
              onclick={() => selectSlashTool('/brainstorm')}
            >
              <span class="slash-menu-command">/brainstorm</span>
              <span class="slash-menu-description">Explore analytical directions</span>
            </button>
          </div>
        {/if}
        <div class="input-controls-row">
          <div class="composer-input-shell" class:has-active-tool={Boolean(activeSlashTool)}>
            {#if activeSlashTool}
              <span class="active-tool-capsule">
                <span>{activeSlashTool}</span>
                <button
                  type="button"
                  class="active-tool-close"
                  onclick={clearSlashTool}
                  aria-label="Remove {activeSlashTool} tool"
                  title="Remove tool"
                >
                  ×
                </button>
              </span>
            {/if}
            <textarea
              bind:value={chatInputText}
              oninput={updateChatInput}
              onkeydown={(e) => {
              if (showSlashTools && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                selectedSlashToolIndex = 0;
                return;
              }
              if (showSlashTools && e.key === 'Enter' && selectedSlashToolIndex === 0) {
                e.preventDefault();
                selectSlashTool('/brainstorm');
                return;
              }
              if (activeSlashTool && e.key === 'Backspace' && !chatInputText) {
                e.preventDefault();
                clearSlashTool();
                return;
              }
              if (e.key === 'Escape') {
                showSlashTools = false;
                selectedSlashToolIndex = -1;
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                showSlashTools = false;
                sendStudentMessage();
              }
            }}
              placeholder="Ask about a source, structure, or next step…"
              rows="2"
              class="drawer-textarea"
              disabled={isOracleThinking}
            ></textarea>
            <button
              type="button"
              class="drawer-send-btn"
              onclick={() => sendStudentMessage()}
              disabled={isOracleThinking || (!activeSlashTool && chatInputText.trim().length === 0)}
              aria-label="Send message"
              title="Send message (Enter)"
            >
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
      </footer>
    </aside>
  {/if}
</div>

<style>
  /* -------------------------------------------------------------
     Notion-Style Minimal Shell & Typography
     ------------------------------------------------------------- */
  .minimal-notion-shell {
    margin: 0 auto;
    --canvas-width: 980px;
    --canvas-min-height: 1386px;
    --canvas-font-size: 17px;
    --canvas-padding: clamp(52px, 6vw, 76px) clamp(40px, 5.5vw, 64px);
    max-width: min(var(--canvas-width, 980px), 100%);
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: max-width 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .minimal-notion-shell.canvas-narrow {
    --canvas-width: 800px;
    --canvas-min-height: 1131px;
    --canvas-font-size: 15.5px;
    --canvas-padding: clamp(44px, 5vw, 64px) clamp(34px, 4.5vw, 54px);
  }

  .minimal-notion-shell.canvas-wide {
    --canvas-width: 980px;
    --canvas-min-height: 1386px;
    --canvas-font-size: 17px;
    --canvas-padding: clamp(52px, 6vw, 76px) clamp(40px, 5.5vw, 64px);
  }

  .minimal-notion-shell.canvas-max {
    --canvas-width: 1200px;
    --canvas-min-height: 1697px;
    --canvas-font-size: 18.5px;
    --canvas-padding: clamp(62px, 7vw, 88px) clamp(50px, 6.5vw, 78px);
  }

  .canvas-zoom-control {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: var(--radius-xs, 4px);
    padding: 2px 6px 2px 7px;
    transition: all 0.15s ease;
  }

  .canvas-zoom-control:hover,
  .canvas-zoom-control:focus-within {
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.08);
  }

  .zoom-icon {
    font-size: 13px;
    color: var(--color-slate-muted, #646a78);
    user-select: none;
    line-height: 1;
  }

  .canvas-zoom-select {
    background: transparent;
    border: none;
    outline: none;
    font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-heading, #121418);
    cursor: pointer;
    padding: 2px 2px 2px 0;
  }

  .canvas-zoom-select option {
    background: #ffffff;
    color: #121418;
    font-size: 12px;
  }

  .minimal-toolbar {
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: var(--radius-md, 8px);
    padding: 6px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .v-divider {
    width: 1px;
    height: 16px;
    background: var(--color-graphite-border, #e2e4dc);
    margin: 0 4px;
  }

  .tool-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-xs, 4px);
    color: var(--color-slate-light, #474d5a);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .tool-btn:hover:not(:disabled) {
    background: var(--color-graphite-hover, #e8eae3);
    color: var(--color-heading, #121418);
  }

  .tool-btn.active {
    background: rgba(2, 132, 199, 0.12);
    border-color: rgba(2, 132, 199, 0.3);
    color: var(--color-aurora, #0284c7);
  }

  .add-page-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-heading, #121418);
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
  }

  .add-page-btn:hover:not(:disabled) {
    background: var(--color-graphite-hover, #e8eae3);
    border-color: var(--color-aurora, #0284c7);
    color: var(--color-aurora, #0284c7);
  }

  .page-count-badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-slate-muted, #646a78);
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.04);
    white-space: nowrap;
  }

  .toolbar-center {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* Clean, High-Contrast Truth Highlights Toggle */
  .truth-highlights-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    color: var(--color-slate-light, #474d5a);
  }

  .truth-highlights-toggle:hover {
    background: var(--color-graphite-hover, #e8eae3);
    border-color: var(--color-aurora, #0284c7);
    color: var(--color-heading, #121418);
  }

  .truth-highlights-toggle.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
    box-shadow: none;
  }

  .truth-toggle-ring {
    width: 10px;
    height: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .truth-toggle-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #94a3b8;
    transition: all 0.15s ease;
  }

  .truth-highlights-toggle.active .truth-toggle-pip {
    background: #2563eb;
  }

  .truth-toggle-pill {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-slate-muted, #646a78);
    transition: all 0.15s ease;
  }

  .truth-highlights-toggle.active .truth-toggle-pill {
    background: #dbeafe;
    color: #1e40af;
  }

  .epistemic-sentence-strip {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .strip-pill {
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: var(--color-slate-muted, #646a78);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .strip-pill strong {
    color: var(--color-heading, #121418);
  }

  .strip-pill.premature strong {
    color: #dc2626;
  }

  .save-status-text {
    font-size: 11px;
    color: var(--color-slate-muted, #646a78);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
    text-align: right;
    max-width: 390px;
  }

  .save-status-message {
    color: #b45309;
  }

  .save-status-action,
  .recovery-restore-btn,
  .recovery-discard-btn {
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .save-status-action,
  .recovery-restore-btn {
    color: #1d4ed8;
    font-weight: 700;
  }

  .save-status-action:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .save-status-correlation {
    color: var(--color-slate-muted, #646a78);
    font-family: var(--font-mono, monospace);
  }

  .document-recovery-banner {
    width: min(var(--canvas-width, 820px), 100%);
    margin: 0 auto 12px;
    border: 1px solid #f0c36d;
    background: #fffbeb;
    border-radius: 8px;
    padding: 12px 14px;
    color: #78350f;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .document-recovery-banner strong {
    font-size: 12px;
  }

  .document-recovery-banner p {
    margin: 3px 0 0;
    font-size: 11px;
    line-height: 1.35;
  }

  .document-recovery-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 12px;
    font-size: 11px;
  }

  .recovery-discard-btn {
    color: #78350f;
  }

  /* Pristine Document Page (Strict A4 Aspect Ratio 210/297 with Dynamic Zoom) */
  .document-page {
    position: relative;
    background: var(--color-bone-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    width: 100%;
    max-width: var(--canvas-width, 820px);
    min-height: var(--canvas-min-height, 1160px);
    aspect-ratio: 210 / 297;
    padding: var(--canvas-padding, clamp(48px, 6vw, 72px) clamp(36px, 5vw, 64px));
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
  }

  .document-page-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
    user-select: none;
  }

  .page-watermark {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-slate-muted, #94a3b8);
  }

  .page-watermark-dim {
    opacity: 0.7;
    font-weight: 500;
    margin-left: 4px;
  }

  /* Bottom Pagination Bar */
  .canvas-pagination-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 20px 0 10px;
    user-select: none;
  }

  .pagination-controls {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 30px;
    padding: 4px 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .page-nav-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 20px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-heading, #121418);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .page-nav-btn:hover:not(:disabled) {
    background: var(--color-graphite-hover, #e8eae3);
    border-color: var(--color-graphite-border, #cbd5e1);
  }

  .page-nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .page-numbers-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .page-number-pill {
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border-radius: 14px;
    background: transparent;
    border: 1px solid transparent;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-slate-light, #474d5a);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease;
  }

  .page-number-pill:hover:not(.active) {
    background: var(--color-graphite-hover, #e8eae3);
    color: var(--color-heading, #121418);
  }

  .page-number-pill.active {
    background: #2563eb;
    color: #ffffff;
    border-color: #1d4ed8;
    box-shadow: 0 1px 4px rgba(37, 99, 235, 0.35);
  }

  .pagination-divider {
    width: 1px;
    height: 18px;
    background: var(--color-graphite-border, #cbd5e1);
    margin: 0 4px;
  }

  .pagination-add-page-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 20px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-heading, #121418);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .pagination-add-page-btn:hover:not(:disabled) {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
  }

  .pagination-delete-page-btn {
    display: inline-flex;
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 20px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #dc2626;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .pagination-delete-page-btn:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .notion-editor-container :global(.notion-minimal-prosemirror) {
    color: var(--color-slate-bright);
    font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: var(--canvas-font-size, 16.5px);
    line-height: 1.8;
    min-height: calc(var(--canvas-min-height, 1160px) - 180px);
    outline: none;
    transition: font-size 0.2s ease;
  }

  .notion-editor-container :global(.notion-minimal-prosemirror p) {
    margin: 0 0 1.25em;
    color: var(--color-slate-bright);
  }

  .notion-editor-container :global(.notion-minimal-prosemirror h1) {
    color: var(--color-heading);
    font-size: 1.85em;
    font-weight: 800;
    letter-spacing: -0.4px;
    margin: 1.6em 0 0.5em;
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 8px;
  }

  .notion-editor-container :global(.notion-minimal-prosemirror h2) {
    color: var(--color-heading);
    font-size: 1.4em;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin: 1.4em 0 0.4em;
  }

  .notion-editor-container :global(.notion-minimal-prosemirror blockquote) {
    border-left: 3px solid #3b82f6;
    margin: 1.2em 0;
    padding: 8px 18px;
    color: var(--color-slate-light);
    font-style: italic;
    background: rgba(59, 130, 246, 0.04);
    border-radius: 0 6px 6px 0;
  }

  .notion-editor-container :global(.notion-minimal-prosemirror p.is-editor-empty:first-child::before) {
    color: var(--color-slate-subtle);
    content: 'Start writing, or open the Enquirer to plan your next step.';
    float: left;
    height: 0;
    pointer-events: none;
    font-style: italic;
  }

  /* -------------------------------------------------------------
     Sentence-Level Epistemic Highlighting (Native Inline Spans)
     ------------------------------------------------------------- */
  .document-page.epistemic-active :global(.epistemic-sentence) {
    transition: all 0.15s ease;
    border-radius: 2px;
    padding: 1px 2px;
    margin: 0 1px;
    cursor: pointer;
  }

  /* 🔵 Claims: Defensible assertions under test */
  .document-page.epistemic-active :global(.epistemic-sentence.claim) {
    border-bottom: 2px solid rgba(59, 130, 246, 0.55);
  }
  .document-page.epistemic-active :global(.epistemic-sentence.claim:hover) {
    background: rgba(59, 130, 246, 0.1);
    border-bottom-color: #3b82f6;
  }

  /* 🟢 Grounded Evidence: Primary source data / citations */
  .document-page.epistemic-active :global(.epistemic-sentence.evidence) {
    border-bottom: 2px solid rgba(16, 185, 129, 0.65);
    background: rgba(16, 185, 129, 0.06);
  }
  .document-page.epistemic-active :global(.epistemic-sentence.evidence:hover) {
    background: rgba(16, 185, 129, 0.12);
    border-bottom-color: #10b981;
  }

  /* 🟣 Causal Reasoning: Warrants & connective mechanisms */
  .document-page.epistemic-active :global(.epistemic-sentence.reasoning) {
    border-bottom: 2px solid rgba(139, 92, 246, 0.6);
  }
  .document-page.epistemic-active :global(.epistemic-sentence.reasoning:hover) {
    background: rgba(139, 92, 246, 0.1);
    border-bottom-color: #8b5cf6;
  }

  /* 🟡 Assumptions: Presuppositions taken for granted */
  .document-page.epistemic-active :global(.epistemic-sentence.assumption) {
    border-bottom: 2px solid rgba(245, 158, 11, 0.65);
    background: rgba(245, 158, 11, 0.05);
  }
  .document-page.epistemic-active :global(.epistemic-sentence.assumption:hover) {
    background: rgba(245, 158, 11, 0.12);
    border-bottom-color: #f59e0b;
  }

  /* 🔴 Premature Closures: Unsupported conclusion leaps */
  .document-page.epistemic-active :global(.epistemic-sentence.premature_closure) {
    border-bottom: 2px dashed #ef4444;
    background: rgba(239, 68, 68, 0.07);
  }
  .document-page.epistemic-active :global(.epistemic-sentence.premature_closure:hover) {
    background: rgba(239, 68, 68, 0.14);
  }

  :global(.sentence-pulse-highlight) {
    animation: pulseSentence 1.5s ease-out;
  }

  @keyframes pulseSentence {
    0% { background: rgba(139, 92, 246, 0.35); }
    100% { background: transparent; }
  }

  /* -------------------------------------------------------------
     Split-Pane Layout: Editor (Left) & Socratic Oracle Chat Drawer (Right)
     ------------------------------------------------------------- */
  .canvas-split-container {
    display: flex;
    width: 100%;
    height: calc(100vh - 110px);
    overflow: hidden;
    position: relative;
    transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* -------------------------------------------------------------
     Left Document Outline Navigation Sidebar
     ------------------------------------------------------------- */
  .document-outline-sidebar {
    width: 250px;
    min-width: 220px;
    max-width: 280px;
    height: 100%;
    background: var(--color-bone-muted, #f8f9f5);
    border-right: 1px solid var(--color-graphite-border, #e2e4dc);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    z-index: 10;
    animation: slideInLeft 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .outline-header {
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-graphite, #ffffff);
  }

  .outline-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .outline-heading-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-heading, #121418);
  }

  .outline-collapse-btn {
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--color-slate-muted, #646a78);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .outline-collapse-btn:hover {
    background: var(--color-graphite-hover, #e8eae3);
    color: var(--color-heading, #121418);
  }

  .outline-meta-sub {
    margin-top: 4px;
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--color-slate-muted, #646a78);
  }

  .outline-tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .outline-page-group {
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 6px;
    overflow: hidden;
    transition: all 0.15s ease;
  }

  .outline-page-group.is-current-page {
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
  }

  .outline-page-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .outline-page-item:hover {
    background: var(--color-bone-muted, #f4f5f0);
  }

  .outline-page-item.active {
    background: #eff6ff;
  }

  .outline-page-item-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .page-sheet-icon {
    font-size: 13px;
  }

  .page-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-heading, #121418);
  }

  .outline-page-item.active .page-name {
    color: #1d4ed8;
  }

  .page-item-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-slate-muted, #646a78);
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 5px;
    border-radius: 4px;
  }

  .outline-headings-list {
    display: flex;
    flex-direction: column;
    padding: 4px 6px 8px;
    gap: 2px;
    border-top: 1px solid var(--color-graphite-border, #f1f2ed);
  }

  .outline-heading-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .outline-heading-item:hover {
    background: var(--color-bone-muted, #f1f2ed);
  }

  .outline-heading-item.level-1 {
    padding-left: 6px;
  }

  .outline-heading-item.level-2 {
    padding-left: 14px;
  }

  .outline-heading-item.level-3 {
    padding-left: 22px;
  }

  .heading-tag {
    font-size: 9px;
    font-weight: 700;
    color: var(--color-slate-muted, #646a78);
    background: rgba(0, 0, 0, 0.04);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .heading-text {
    font-size: 11.5px;
    color: var(--color-slate-light, #474d5a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .outline-heading-item:hover .heading-text {
    color: var(--color-heading, #121418);
  }

  .outline-empty-page-hint {
    padding: 6px 10px;
    font-size: 11px;
    font-style: italic;
    color: var(--color-slate-muted, #94a3b8);
  }

  .outline-footer {
    padding: 10px;
    border-top: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-graphite, #ffffff);
  }

  .outline-add-page-btn {
    width: 100%;
    padding: 7px 10px;
    background: var(--color-bone-surface, #f8fafc);
    border: 1px dashed var(--color-graphite-border, #cbd5e1);
    border-radius: 6px;
    color: var(--color-heading, #121418);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .outline-add-page-btn:hover:not(:disabled) {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
  }

  .outline-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
  }

  .outline-toggle-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
  }

  .editor-main-pane {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: 16px 20px 80px;
    transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .canvas-split-container.has-chat-open .editor-main-pane {
    padding-right: 16px;
  }

  /* -------------------------------------------------------------
     Socratic Oracle Dialectic Chat Drawer
     ------------------------------------------------------------- */
  .socratic-chat-drawer {
    width: 440px;
    min-width: 400px;
    max-width: 480px;
    height: 100%;
    background: var(--color-graphite, #ffffff);
    border-left: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.08));
    display: flex;
    flex-direction: column;
    z-index: 25;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
    animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.08));
    background: var(--color-bone-muted, rgba(0, 0, 0, 0.02));
  }

  .drawer-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .drawer-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .oracle-symbol {
    font-size: 14px;
    font-weight: 800;
    color: var(--color-aurora, #0284c7);
  }

  .mode-badge-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.22);
    border-radius: 99px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--color-aurora, #0284c7);
    cursor: pointer;
    text-transform: capitalize;
    transition: all 0.15s ease;
  }
  .mode-badge-btn:hover {
    background: rgba(2, 132, 199, 0.18);
    transform: translateY(-0.5px);
  }
  .mode-dot {
    font-size: 8px;
  }

  .oracle-status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d97706;
    box-shadow: 0 0 8px rgba(217, 119, 6, 0.6);
    animation: pulseGlow 2s infinite ease-in-out;
  }

  .oracle-status-indicator.is-satisfied .status-pulse-dot {
    background: #10b981;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 0.6; transform: scale(0.95); }
    50% { opacity: 1; transform: scale(1.1); }
  }

  .oracle-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-heading, #1e293b);
    letter-spacing: -0.01em;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-pill.probing {
    background: rgba(217, 119, 6, 0.12);
    color: #d97706;
    border: 1px solid rgba(217, 119, 6, 0.3);
  }

  .status-pill.satisfied {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .drawer-close-btn {
    background: transparent;
    border: none;
    color: var(--color-slate-muted, #94a3b8);
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .drawer-close-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-heading, #1e293b);
  }

  /* Active Sentence Quote Card */
  .drawer-quote-card {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.08));
    background: var(--color-bone-surface, #f8fafc);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .quote-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .epistemic-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .epistemic-badge.claim { background: rgba(59, 130, 246, 0.12); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.25); }
  .epistemic-badge.evidence { background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.25); }
  .epistemic-badge.reasoning { background: rgba(139, 92, 246, 0.12); color: #7c3aed; border: 1px solid rgba(139, 92, 246, 0.25); }
  .epistemic-badge.assumption { background: rgba(217, 119, 6, 0.12); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.25); }
  .epistemic-badge.premature_closure { background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25); }

  .vulnerability-tag {
    font-size: 10px;
    color: var(--color-slate-light, #64748b);
    background: rgba(0, 0, 0, 0.04);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .sentence-text-quote {
    margin: 0;
    font-family: var(--font-serif, Georgia, serif);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--color-heading, #1e293b);
    font-style: italic;
    border-left: 2px solid var(--color-horizon-blue, #2563eb);
    padding-left: 10px;
  }

  .epistemic-progress-track {
    height: 4px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 4px;
  }

  .epistemic-progress-bar {
    height: 100%;
    background: #f59e0b;
    border-radius: 99px;
    transition: width 0.3s ease;
  }

  .epistemic-progress-bar.satisfied-bar {
    background: #10b981;
  }

  /* Chat Messages Stream */
  .chat-messages-stream {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .chat-bubble-row {
    display: flex;
    width: 100%;
  }

  .chat-bubble-row.oracle {
    justify-content: flex-start;
  }

  .chat-bubble-row.student {
    justify-content: flex-end;
  }

  .chat-bubble {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .chat-bubble.oracle {
    background: var(--color-bone-surface, #f8fafc);
    border: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.08));
    color: var(--color-heading, #1e293b);
  }

  .concept-context {
    color: var(--color-slate-muted, #94a3b8);
    font-size: 11px;
    margin: 0;
  }

  .defer-probe-link {
    background: transparent;
    border: 0;
    color: var(--color-slate-muted, #94a3b8);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    margin-top: 8px;
    padding: 0;
  }

  .defer-probe-link:hover {
    color: var(--color-heading, #1e293b);
    text-decoration: underline;
  }

  .chat-bubble.student {
    background: rgba(37, 99, 235, 0.08);
    border: 1px solid rgba(37, 99, 235, 0.2);
    color: var(--color-heading, #1e293b);
  }

  /* Minimalist Conversation Progress Indicator */
  .conversation-progress-box {
    margin: 10px 0 2px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .progress-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 500;
    color: var(--color-slate-light, #64748b);
  }

  .progress-track-minimal {
    height: 4px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 99px;
    overflow: hidden;
  }

  .progress-fill-minimal {
    height: 100%;
    background: #10b981;
    border-radius: 99px;
    transition: width 0.4s ease;
  }

  .bubble-meta-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .probe-category-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: var(--color-slate-light, #64748b);
    background: rgba(0, 0, 0, 0.04);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .probe-category-icon {
    font-size: 10.5px;
  }

  .bubble-author {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  .bubble-text {
    margin: 0;
    white-space: pre-wrap;
  }

  .assistant-error-correlation {
    display: block;
    margin-top: 6px;
    color: var(--color-slate-muted, #64748b);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
  }

  .interactive-actions-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(124, 58, 237, 0.12);
  }

  .canvas-proposal-preview {
    width: 100%;
    color: var(--color-slate-light);
    font-size: 11px;
    line-height: 1.45;
  }

  .canvas-proposal-preview > span {
    color: var(--color-slate-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .canvas-proposal-preview ol {
    margin: 5px 0 1px;
    padding-left: 18px;
  }

  .bubble-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    background: #ffffff;
    border: 1px solid rgba(124, 58, 237, 0.28);
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: #6d28d9;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: all 0.15s ease;
  }

  .bubble-action-btn:hover {
    background: #f5f3ff;
    border-color: #7c3aed;
    color: #5b21b6;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(109, 40, 217, 0.12);
  }

  .bubble-action-btn:active {
    transform: translateY(0);
  }

  .action-btn-icon {
    font-size: 12px;
    line-height: 1;
  }

  .action-btn-label {
    letter-spacing: -0.01em;
  }

  .chat-bubble.thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-slate-muted, #64748b);
  }

  .thinking-spinner {
    display: inline-block;
    animation: spin 1s infinite linear;
    font-weight: bold;
    color: #7c3aed;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Minimal Refinement Box (No Celebration) */
  .minimal-refinement-box {
    background: var(--color-bone-surface, #f8fafc);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .minimal-refinement-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #059669;
  }

  .refinement-text {
    margin: 0;
    font-family: var(--font-serif, Georgia, serif);
    font-size: 12.5px;
    font-style: italic;
    color: var(--color-heading, #1e293b);
    line-height: 1.45;
  }

  .refinement-apply-btn {
    align-self: flex-start;
    background: #10b981;
    border: 1px solid #059669;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .refinement-apply-btn:hover {
    background: #059669;
  }

  /* Drawer Input Footer */
  .drawer-input-footer {
    padding: 12px 14px;
    border-top: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.08));
    background: var(--color-bone-muted, rgba(0, 0, 0, 0.02));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-controls-row {
    display: block;
  }

  .composer-input-shell {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  .composer-input-shell .drawer-textarea {
    width: 100%;
    padding-right: 48px;
  }

  .composer-input-shell.has-active-tool .drawer-textarea {
    padding-left: 104px;
  }

  .active-tool-capsule {
    align-items: center;
    background: rgba(124, 58, 237, 0.10);
    border: 1px solid rgba(124, 58, 237, 0.24);
    border-radius: 5px;
    color: #6d28d9;
    display: inline-flex;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11.5px;
    font-weight: 600;
    gap: 5px;
    line-height: 1;
    left: 7px;
    padding: 7px 5px 7px 8px;
    position: absolute;
    top: 7px;
    white-space: nowrap;
    z-index: 1;
  }

  .active-tool-close {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 3px;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    font-size: 16px;
    height: 16px;
    justify-content: center;
    line-height: 1;
    padding: 0;
    width: 16px;
  }

  .active-tool-close:hover {
    background: rgba(124, 58, 237, 0.15);
  }

  .drawer-textarea {
    flex: 1;
    background: var(--color-bone-surface, #f8fafc);
    border: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.12));
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--color-heading, #1e293b);
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.4;
    resize: none;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  .drawer-textarea:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.18);
  }

  .drawer-send-btn {
    align-items: center;
    background: var(--color-bone-surface, #f8fafc);
    border: 0;
    border-radius: 4px;
    bottom: 7px;
    color: var(--color-heading, #1e293b);
    display: inline-flex;
    font-size: 17px;
    font-weight: 500;
    height: 34px;
    justify-content: center;
    padding: 0;
    position: absolute;
    right: 7px;
    width: 34px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
    z-index: 2;
  }

  .drawer-send-btn:hover:not(:disabled) {
    background: rgba(124, 58, 237, 0.10);
    color: #6d28d9;
  }

  .drawer-send-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .input-hints-row {
    display: flex;
    justify-content: flex-end;
    color: var(--color-slate-muted, #94a3b8);
    font-size: 10px;
  }

  /* Quick Epistemic Action Pills */
  .quick-epistemic-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 0 6px;
    scrollbar-width: none;
  }
  .quick-epistemic-pills::-webkit-scrollbar {
    display: none;
  }
  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-bone-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.1));
    border-radius: 99px;
    padding: 3px 9px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-heading, #334155);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.14s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }
  .pill-btn:hover {
    background: #f1f5f9;
    border-color: #0284c7;
    color: #0284c7;
    transform: translateY(-0.5px);
  }
  .pill-icon {
    font-size: 11px;
  }

  /* Floating Slash Command Menu */
  .slash-command-menu {
    position: relative;
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.12));
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.10);
    margin-bottom: 6px;
    overflow: hidden;
    z-index: 50;
    display: flex;
    flex-direction: column;
  }
  .slash-menu-header {
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-slate-muted, #94a3b8);
    background: var(--color-bone-muted, #f8fafc);
    border-bottom: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.06));
  }
  .slash-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 10px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
    border-bottom: 1px solid rgba(0, 0, 0, 0.03);
  }
  .slash-menu-item:hover,
  .slash-menu-item.selected {
    background: rgba(124, 58, 237, 0.07);
  }
  .slash-menu-command {
    color: var(--color-heading, #1e293b);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
  }
  .slash-menu-description {
    color: var(--color-slate-muted, #64748b);
    font-size: 11px;
  }
  .slash-menu-item .item-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }
  .slash-menu-item .item-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .slash-menu-item .item-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slash-menu-item .item-cmd {
    font-size: 12px;
    font-family: monospace;
    color: #0284c7;
  }
  .slash-menu-item .item-label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-heading, #1e293b);
  }
  .slash-menu-item .item-desc {
    font-size: 10.5px;
    color: var(--color-slate-muted, #64748b);
  }
  .item-param-hint {
    font-size: 11px;
    font-family: monospace;
    color: #64748b;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 4px;
    border-radius: 4px;
  }

  /* Antigravity-Style Empty Inquiry Starter State */
  .empty-inquiry-starter {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 12px;
    animation: fadeIn 0.18s ease-out;
  }
  .starter-hero {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .starter-symbol {
    font-size: 28px;
    color: #0284c7;
    line-height: 1;
  }
  .starter-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-heading, #0f172a);
    margin: 0;
  }
  .starter-subtitle {
    font-size: 12px;
    color: var(--color-slate-muted, #64748b);
    max-width: 320px;
    line-height: 1.45;
    margin: 0;
  }
  .starter-suggestions-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .starter-suggestions-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
  }
  .starter-suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .starter-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--color-bone-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, rgba(0, 0, 0, 0.09));
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all 0.14s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  }
  .starter-card:hover {
    background: #f8fafc;
    border-color: #0284c7;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.08);
  }
  .starter-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .starter-cmd-pill {
    font-size: 11.5px;
    font-family: monospace;
    font-weight: 600;
    color: #0284c7;
  }
  .starter-card-tag {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.08);
    color: #0369a1;
  }
  .starter-card-desc {
    font-size: 11px;
    color: var(--color-slate-muted, #64748b);
    line-height: 1.35;
  }

  .drawer-quote-card.general-inquiry {
    background: var(--color-bone-surface, #f8fafc);
    padding: 8px 16px;
  }

  .assignment-context summary {
    color: var(--color-slate-muted, #64748b);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    list-style: none;
  }

  .assignment-context summary::-webkit-details-marker {
    display: none;
  }

  .assignment-context summary::before {
    content: '›';
    display: inline-block;
    margin-right: 6px;
    transition: transform 0.15s ease;
  }

  .assignment-context[open] summary::before {
    transform: rotate(90deg);
  }

  .assignment-context .sentence-text-quote {
    margin-top: 9px;
  }
  .sentence-text-quote.general {
    font-size: 12px;
    font-style: italic;
    color: var(--color-heading, #1e293b);
    line-height: 1.45;
  }
  .epistemic-badge.general {
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
  }
  .vulnerability-tag.info {
    background: rgba(16, 185, 129, 0.1);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  /* Active Sentence in Editor */
  :global(.epistemic-sentence.is-active-sentence) {
    background: rgba(217, 119, 6, 0.16) !important;
    outline: 2px solid var(--color-horizon-blue, #2563eb) !important;
    outline-offset: 2px;
    border-radius: 3px;
    box-shadow: 0 0 12px rgba(37, 99, 235, 0.25);
  }

  /* Minimal Footer */
  .minimal-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-slate-muted, #64748b);
    padding: 8px 0;
  }
</style>
