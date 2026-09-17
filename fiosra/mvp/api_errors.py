"""Typed, learner-safe API errors with correlation-aware responses."""

from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse


@dataclass(slots=True)
class LearnerAPIError(Exception):
    """A public error whose message is safe to show in the student interface."""

    status_code: int
    code: str
    message: str
    retryable: bool = False
    retry_after_seconds: int | None = None


def learner_error_response(request: Request, error: LearnerAPIError) -> JSONResponse:
    """Return the stable frontend error envelope without exposing implementation detail."""
    correlation_id = getattr(request.state, "correlation_id", None)
    detail = {
        "code": error.code,
        "message": error.message,
        "retryable": error.retryable,
        "correlation_id": correlation_id,
    }
    if error.retry_after_seconds:
        detail["retry_after_seconds"] = error.retry_after_seconds
    headers = {"X-Correlation-ID": correlation_id} if correlation_id else {}
    if error.retry_after_seconds:
        headers["Retry-After"] = str(error.retry_after_seconds)
    return JSONResponse(status_code=error.status_code, content={"detail": detail}, headers=headers)
