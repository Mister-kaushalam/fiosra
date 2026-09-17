const STATUS_DEFAULTS = {
  0: { code: 'NETWORK_UNAVAILABLE', retryable: true },
  401: { code: 'SESSION_AUTHORIZATION', retryable: false },
  403: { code: 'SESSION_AUTHORIZATION', retryable: false },
  409: { code: 'DOCUMENT_CONFLICT', retryable: false },
  422: { code: 'VALIDATION_ERROR', retryable: false },
  429: { code: 'SERVICE_UNAVAILABLE', retryable: true },
  500: { code: 'SERVER_ERROR', retryable: true },
  502: { code: 'NETWORK_UNAVAILABLE', retryable: true },
  503: { code: 'SERVICE_UNAVAILABLE', retryable: true },
  504: { code: 'NETWORK_UNAVAILABLE', retryable: true },
};

function safeDetail(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.detail && typeof payload.detail === 'object') return payload.detail;
  return payload;
}

function defaultsForStatus(status) {
  if (STATUS_DEFAULTS[status]) return STATUS_DEFAULTS[status];
  if (status >= 500) return STATUS_DEFAULTS[500];
  return { code: 'REQUEST_FAILED', retryable: false };
}

/**
 * Reads the public error envelope used by learner-facing API calls. The helper
 * never exposes provider internals and preserves safe fallback copy for legacy
 * endpoints that still return FastAPI's string detail shape.
 */
export async function responseErrorDetails(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  const detail = safeDetail(payload);
  const defaults = defaultsForStatus(response?.status || 0);
  const retryAfterHeader = response?.headers?.get?.('Retry-After');
  const retryAfterSeconds = Number(
    detail.retry_after_seconds ?? payload.retry_after_seconds ?? retryAfterHeader ?? 0
  );

  return {
    code: detail.code || payload.code || defaults.code,
    message: detail.message || payload.message || (typeof payload.detail === 'string' ? payload.detail : '') || fallback,
    retryable: typeof detail.retryable === 'boolean'
      ? detail.retryable
      : typeof payload.retryable === 'boolean'
        ? payload.retryable
        : defaults.retryable,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : null,
    correlationId: detail.correlation_id
      || payload.correlation_id
      || response?.headers?.get?.('X-Correlation-ID')
      || response?.headers?.get?.('X-Request-ID')
      || null,
    status: response?.status || 0,
  };
}

export function learnerErrorSummary(error, { draftPreserved = false } = {}) {
  if (!error) return '';
  if (error.code === 'MODEL_UNAVAILABLE') {
    return draftPreserved
      ? 'Fiosra is temporarily unavailable. Your draft is safe.'
      : 'Fiosra is temporarily unavailable. Please try again shortly.';
  }
  if (error.code === 'NETWORK_UNAVAILABLE' || error.code === 'SERVICE_UNAVAILABLE') {
    return draftPreserved
      ? 'The service is temporarily unavailable. Your draft is stored on this device.'
      : 'The service is temporarily unavailable. Please try again shortly.';
  }
  if (error.code === 'SESSION_AUTHORIZATION') {
    return draftPreserved
      ? 'This session needs reconnecting. Your local draft is preserved.'
      : 'This session needs reconnecting before this action can continue.';
  }
  if (error.code === 'DOCUMENT_CONFLICT') {
    return 'A newer document version exists. Your local draft is preserved for review.';
  }
  return error.message || 'This request could not be completed.';
}
