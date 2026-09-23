import re

from app.models.domain import RemediationAction

DESTRUCTIVE_PATTERNS = (
    re.compile(r"\bDROP\s+(TABLE|DATABASE|SCHEMA)\b", re.IGNORECASE),
    re.compile(r"\bTRUNCATE\s+TABLE\b", re.IGNORECASE),
    re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE),
    re.compile(r"\bALTER\s+TABLE\b", re.IGNORECASE),
    re.compile(r"\bUPDATE\s+\w+\s+SET\b", re.IGNORECASE),
    re.compile(r"\brm\s+-rf\b", re.IGNORECASE),
    re.compile(r"\b(shell|bash|powershell)\s+-c\b", re.IGNORECASE),
)
ALLOWED_ACTION_TYPES = {"VALIDATION", "CODE_CHANGE", "REBUILD", "BACKFILL"}


def evaluate_remediation_policy(actions: list[RemediationAction]) -> dict:
    if not actions:
        return {"allowed": False, "reason": "A remediation plan needs at least one action."}
    for action in actions:
        if action.action_type not in ALLOWED_ACTION_TYPES:
            return {"allowed": False, "reason": f"Unsupported action type: {action.action_type}"}
        if any(pattern.search(action.description) for pattern in DESTRUCTIVE_PATTERNS):
            return {
                "allowed": False,
                "reason": (
                    "Destructive SQL or shell instructions cannot be approved through this MVP."
                ),
            }
    return {
        "allowed": True,
        "reason": "Only a dry-run policy evaluation was performed; no production action ran.",
    }
