from datetime import UTC, datetime
from uuid import uuid4

from app.models.domain import DataQualityCheck, DemoRecord
from app.services.quality import evaluate_check


def test_null_rate_and_accepted_values_checks_use_deterministic_rows():
    now = datetime.now(UTC)
    rows = [
        DemoRecord(values={"customer_id": 10, "status": "paid"}, ingested_at=now),
        DemoRecord(values={"customer_id": None, "status": "invalid"}, ingested_at=now),
    ]
    null_check = DataQualityCheck(
        id=uuid4(),
        organization_id=uuid4(),
        dataset_id=uuid4(),
        name="nulls",
        check_type="null_rate",
        configuration={"column": "customer_id", "max_null_rate": 0.6},
    )
    observed, expected, passed = evaluate_check(null_check, rows)
    assert observed["value"] == 0.5
    assert expected["max_null_rate"] == 0.6
    assert passed

    accepted_check = DataQualityCheck(
        id=uuid4(),
        organization_id=uuid4(),
        dataset_id=uuid4(),
        name="values",
        check_type="accepted_values",
        configuration={"column": "status", "values": ["paid", "pending"]},
    )
    accepted_observed, _, accepted = evaluate_check(accepted_check, rows)
    assert accepted_observed["unexpected_values"] == ["invalid"]
    assert not accepted


def test_uniqueness_numeric_range_and_freshness_checks():
    now = datetime.now(UTC)
    rows = [
        DemoRecord(values={"id": 1, "amount": 12.5}, ingested_at=now),
        DemoRecord(values={"id": 1, "amount": 20}, ingested_at=now),
    ]
    uniqueness = DataQualityCheck(
        id=uuid4(),
        organization_id=uuid4(),
        dataset_id=uuid4(),
        name="u",
        check_type="uniqueness",
        configuration={"column": "id", "max_duplicate_rate": 0},
    )
    assert evaluate_check(uniqueness, rows)[2] is False
    numeric = DataQualityCheck(
        id=uuid4(),
        organization_id=uuid4(),
        dataset_id=uuid4(),
        name="n",
        check_type="numeric_range",
        configuration={"column": "amount", "min": 0, "max": 100},
    )
    assert evaluate_check(numeric, rows)[2] is True
    freshness = DataQualityCheck(
        id=uuid4(),
        organization_id=uuid4(),
        dataset_id=uuid4(),
        name="f",
        check_type="freshness",
        configuration={"max_age_minutes": 1},
    )
    assert evaluate_check(freshness, rows)[2] is True
