from uuid import uuid4

from app.models.domain import RemediationAction
from app.policies.remediation import evaluate_remediation_policy


def test_policy_allows_reviewable_actions_without_executing_them():
    action = RemediationAction(
        id=uuid4(),
        organization_id=uuid4(),
        plan_id=uuid4(),
        action_type="VALIDATION",
        description="Run dbt tests in a non-production environment.",
    )
    result = evaluate_remediation_policy([action])
    assert result["allowed"] is True
    assert "no production action ran" in result["reason"]


def test_policy_blocks_destructive_sql_and_shell_actions():
    action = RemediationAction(
        id=uuid4(),
        organization_id=uuid4(),
        plan_id=uuid4(),
        action_type="CODE_CHANGE",
        description="DROP TABLE production.orders",
    )
    result = evaluate_remediation_policy([action])
    assert result["allowed"] is False
