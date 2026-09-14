from __future__ import annotations

import time


class ResourceExceededError(RuntimeError):
    """Raised when a bounded image operation exceeds its time budget."""


class ResourceGuard:
    DEFAULT_TIME_BUDGET_SECONDS = 5.0

    @staticmethod
    def time_budget() -> float:
        return time.monotonic()

    @classmethod
    def assert_within_budget(cls, started: float) -> None:
        elapsed = time.monotonic() - started
        if elapsed > cls.DEFAULT_TIME_BUDGET_SECONDS:
            raise ResourceExceededError("Image operation exceeded the time budget.")
