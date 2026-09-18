import { getStudentId, routeParams, sessionAccessTokenStorageKey } from './session.js';

/**
 * Fiosra Reactive Global Context Store (Svelte 5 Runes)
 * Maintains continuous synchronization across URL parameters, session capability tokens,
 * canvas cursor micro-context, and epistemic progression.
 */
class FiosraContextStore {
  // Course Boundary
  courseId = $state('');
  courseTitle = $state('');
  courseCode = $state('');

  // Curriculum Module Boundary
  moduleId = $state('');
  moduleTitle = $state('');

  // Assignment Contract
  assignmentId = $state('');
  assignmentTitle = $state('');
  targetKCIds = $state([]);
  bloomDemandLevel = $state('evaluate');

  // Learner Session & Capability
  studentId = $state('');
  sessionId = $state('');
  sessionToken = $state('');
  sessionStatus = $state('active');

  // Canvas Active Document Focus (Dynamic Micro-Context)
  activeBlockId = $state(null);
  activeBlockType = $state('claim');
  activeBlockText = $state('');
  activeBlockOffsetTop = $state(0);

  // Evidentiary Well Focus
  activeSourceQuote = $state('');
  activeSourceId = $state('');
  activeSourceTitle = $state('');

  // Epistemic State & Telemetry Snapshot
  currentEpistemicState = $state('STATE_0_UNANCHORED_PREMISE');
  currentHintRung = $state(0);
  authenticEffortScore = $state(1.0);

  // Derived Helpers
  isAuthenticated = $derived(Boolean(this.sessionId && this.sessionToken));
  hasActiveBlock = $derived(Boolean(this.activeBlockId && this.activeBlockText.trim()));

  constructor() {
    if (typeof window !== 'undefined') {
      this.studentId = getStudentId();
      this.initFromUrl();
      window.addEventListener('hashchange', () => this.initFromUrl());
      window.addEventListener('storage', (e) => this.handleStorageEvent(e));
    }
  }

  initFromUrl() {
    if (typeof window === 'undefined') return;
    const params = routeParams();

    const paramCourseId = params.get('course_id') || params.get('courseId');
    if (paramCourseId && paramCourseId !== this.courseId) {
      this.courseId = paramCourseId;
    }

    const paramAssignmentId = params.get('assignment_id') || params.get('assignmentId');
    if (paramAssignmentId && paramAssignmentId !== this.assignmentId) {
      this.assignmentId = paramAssignmentId;
    }

    const paramSessionId = params.get('session_id') || params.get('sessionId');
    if (paramSessionId && paramSessionId !== this.sessionId) {
      this.sessionId = paramSessionId;
      const cachedToken = localStorage.getItem(sessionAccessTokenStorageKey(paramSessionId));
      if (cachedToken) {
        this.sessionToken = cachedToken;
      }
    }
  }

  setCourse(id, title = '', code = '') {
    this.courseId = id;
    if (title) this.courseTitle = title;
    if (code) this.courseCode = code;
  }

  setModule(id, title = '') {
    this.moduleId = id;
    if (title) this.moduleTitle = title;
  }

  setAssignment(id, title = '', targetKCs = [], bloom = 'evaluate') {
    this.assignmentId = id;
    if (title) this.assignmentTitle = title;
    if (targetKCs && targetKCs.length) this.targetKCIds = targetKCs;
    if (bloom) this.bloomDemandLevel = bloom;
  }

  setSession(sessionId, token = '', status = 'active') {
    this.sessionId = sessionId;
    this.sessionStatus = status;
    if (token) {
      this.sessionToken = token;
      if (typeof window !== 'undefined') {
        localStorage.setItem(sessionAccessTokenStorageKey(sessionId), token);
      }
    }
  }

  setFocusedBlock(blockId, blockType = 'claim', text = '', offsetTop = 0) {
    this.activeBlockId = blockId;
    this.activeBlockType = blockType || 'claim';
    this.activeBlockText = text || '';
    this.activeBlockOffsetTop = offsetTop || 0;
  }

  setActiveSourceQuote(quote, sourceId = '', sourceTitle = '') {
    this.activeSourceQuote = quote || '';
    this.activeSourceId = sourceId || '';
    this.activeSourceTitle = sourceTitle || '';
  }

  setEpistemicState(state, rung = null) {
    if (state) this.currentEpistemicState = state;
    if (rung !== null && rung !== undefined) this.currentHintRung = Number(rung);
  }

  getAuthHeaders(extraHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (this.sessionToken) {
      headers['X-Fiosra-Session-Token'] = this.sessionToken;
    }
    if (this.assignmentId) {
      headers['X-Assignment-ID'] = this.assignmentId;
    }
    return headers;
  }

  handleStorageEvent(event) {
    if (!event.key) return;
    if (this.sessionId && event.key === sessionAccessTokenStorageKey(this.sessionId)) {
      if (event.newValue && event.newValue !== this.sessionToken) {
        this.sessionToken = event.newValue;
      }
    }
  }
}

export const fiosraContext = new FiosraContextStore();
