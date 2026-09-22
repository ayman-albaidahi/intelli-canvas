from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from flask import current_app, request

from .auth import current_user
from .errors import error_response


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


class InMemoryRateLimiter:
    """Small process-local limiter suitable for the current single-process API.

    Production deployments with multiple workers should replace the storage
    backend with a shared Redis/database implementation while keeping the
    rule and request-key contract unchanged.
    """

    def __init__(self):
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, rule: RateLimitRule, key: str, now: float | None = None) -> bool:
        timestamp = time.monotonic() if now is None else now
        bucket_key = (rule.name, key)
        with self._lock:
            events = self._events[bucket_key]
            cutoff = timestamp - rule.window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= rule.limit:
                return False
            events.append(timestamp)
            return True

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


def _rule(name: str) -> RateLimitRule:
    settings = current_app.config["RATE_LIMIT_RULES"][name]
    return RateLimitRule(name, int(settings["limit"]), int(settings["window_seconds"]))


def _request_key() -> str:
    user = current_user()
    identity = user["user_id"] if user else "anonymous"
    return f"{request.remote_addr or 'unknown'}:{identity}"


def rule_for_request() -> RateLimitRule | None:
    endpoint = request.endpoint or ""
    if endpoint in {"auth.register", "auth.login"}:
        return _rule(endpoint.rsplit(".", 1)[-1])
    if any(
        token in endpoint for token in ("export", "analysis", "process", "background")
    ):
        return _rule("expensive")
    return None


def enforce_rate_limit():
    if not current_app.config.get("RATE_LIMIT_ENABLED", True):
        return None
    rule = rule_for_request()
    if rule is None:
        return None
    limiter: InMemoryRateLimiter = current_app.extensions["rate_limiter"]
    if limiter.allow(rule, _request_key()):
        return None
    response = error_response(
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
        429,
    )
    response[0].headers["Retry-After"] = str(rule.window_seconds)
    return response


__all__ = ["InMemoryRateLimiter", "RateLimitRule", "enforce_rate_limit"]
