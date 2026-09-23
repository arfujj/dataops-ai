import statistics
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    DataQualityCheck,
    DataQualityResult,
    Dataset,
    DemoRecord,
    IncidentEvidence,
)
from app.services.incidents import get_or_create_incident

SUPPORTED_CHECKS = {
    "row_count",
    "freshness",
    "null_rate",
    "uniqueness",
    "numeric_range",
    "accepted_values",
}


def _column_values(rows: list[DemoRecord], column: str) -> list:
    return [row.values.get(column) for row in rows]


def evaluate_check(check: DataQualityCheck, rows: list[DemoRecord]) -> tuple[dict, dict, bool]:
    config = check.configuration
    if check.check_type == "row_count":
        value = len(rows)
        minimum, maximum = config.get("min", 0), config.get("max")
        passed = value >= minimum and (maximum is None or value <= maximum)
        return {"value": value, "unit": "rows"}, {"min": minimum, "max": maximum}, passed

    if check.check_type == "freshness":
        latest = max((row.ingested_at for row in rows), default=None)
        age_minutes = None
        if latest is not None:
            age_minutes = max(0, (datetime.now(UTC) - latest).total_seconds() / 60)
        maximum_age = float(config.get("max_age_minutes", 60))
        return (
            {
                "value": age_minutes,
                "unit": "minutes",
                "latest_at": latest.isoformat() if latest else None,
            },
            {"max_age_minutes": maximum_age},
            age_minutes is not None and age_minutes <= maximum_age,
        )

    column = str(config.get("column", ""))
    if not column:
        raise ValueError(f"{check.check_type} checks require configuration.column")
    values = _column_values(rows, column)
    non_null = [value for value in values if value is not None]

    if check.check_type == "null_rate":
        rate = 1.0 if not values else (len(values) - len(non_null)) / len(values)
        maximum = float(config.get("max_null_rate", 0.0))
        return (
            {"value": rate, "unit": "fraction", "column": column},
            {"max_null_rate": maximum},
            rate <= maximum,
        )

    if check.check_type == "uniqueness":
        duplicate_rate = 0.0 if not non_null else 1 - len(set(non_null)) / len(non_null)
        maximum = float(config.get("max_duplicate_rate", 0.0))
        return (
            {"value": duplicate_rate, "unit": "fraction", "column": column, "count": len(non_null)},
            {"max_duplicate_rate": maximum},
            duplicate_rate <= maximum,
        )

    if check.check_type == "numeric_range":
        numeric: list[float] = []
        invalid = 0
        for value in non_null:
            try:
                numeric.append(float(value))
            except (ValueError, TypeError):
                invalid += 1
        minimum = min(numeric) if numeric else None
        maximum = max(numeric) if numeric else None
        lower = config.get("min")
        upper = config.get("max")
        passed = bool(numeric) and invalid == 0
        passed = passed and (lower is None or minimum >= float(lower))
        passed = passed and (upper is None or maximum <= float(upper))
        return (
            {"min": minimum, "max": maximum, "invalid_count": invalid, "column": column},
            {"min": lower, "max": upper},
            bool(passed),
        )

    if check.check_type == "accepted_values":
        accepted = set(config.get("values", []))
        unexpected = sorted({str(value) for value in non_null if value not in accepted})
        return (
            {"unexpected_values": unexpected, "column": column},
            {"accepted_values": sorted(str(value) for value in accepted)},
            not unexpected,
        )
    raise ValueError(f"Unsupported quality check type: {check.check_type}")


def _is_anomaly(check: DataQualityCheck, db: Session, current_observed: dict) -> bool:
    current = current_observed.get("value")
    if not isinstance(current, (int, float)):
        return False
    previous = list(
        db.scalars(
            select(DataQualityResult.observed_value)
            .where(
                DataQualityResult.organization_id == check.organization_id,
                DataQualityResult.check_id == check.id,
            )
            .order_by(DataQualityResult.executed_at.desc())
            .limit(20)
        )
    )
    history = [
        item.get("value")
        for item in previous
        if isinstance(item, dict) and isinstance(item.get("value"), (int, float))
    ]
    if len(history) >= 5:
        mean = statistics.mean(history)
        standard_deviation = statistics.pstdev(history)
        threshold = float(check.configuration.get("z_score_threshold", 3.0))
        if standard_deviation > 0 and abs(float(current) - mean) / standard_deviation >= threshold:
            return True
    pct_threshold = check.configuration.get("anomaly_pct_change")
    if history and pct_threshold is not None:
        baseline = statistics.mean(history)
        delta = abs(float(current) - baseline) / max(abs(baseline), 1e-9)
        if delta >= float(pct_threshold):
            return True
    return False


def run_quality_check(
    db: Session, organization_id: UUID, check: DataQualityCheck
) -> DataQualityResult:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == organization_id,
            Dataset.id == check.dataset_id,
        )
    )
    if dataset is None:
        raise LookupError("Dataset not found")
    rows = list(
        db.scalars(
            select(DemoRecord).where(
                DemoRecord.organization_id == organization_id,
                DemoRecord.dataset_id == dataset.id,
            )
        )
    )
    observed, expected, passed = evaluate_check(check, rows)
    anomaly = _is_anomaly(check, db, observed)
    result = DataQualityResult(
        organization_id=organization_id,
        check_id=check.id,
        observed_value=observed,
        expected_threshold=expected,
        passed=passed,
        anomaly=anomaly,
        executed_at=datetime.now(UTC),
    )
    db.add(result)
    db.flush()

    if not passed or (anomaly and check.configuration.get("incident_on_anomaly", True)):
        severity = "high" if not passed else "medium"
        incident, _ = get_or_create_incident(
            db,
            organization_id,
            "production",
            f"Data quality {('anomaly' if anomaly and passed else 'check failed')}: {check.name}",
            f"{check.check_type} observed {observed}; expected {expected}.",
            "QUALITY_ANOMALY" if anomaly and passed else "QUALITY_FAILURE",
            severity,
            "quality.failed",
            str(check.id),
            result.executed_at,
        )
        db.add(
            IncidentEvidence(
                organization_id=organization_id,
                incident_id=incident.id,
                evidence_type="QUALITY_RESULT",
                reference_id=str(result.id),
                summary=(
                    f"{check.name}: observed {observed.get('value', observed)}, "
                    f"passed={passed}, anomaly={anomaly}"
                ),
                relevance=95,
                details={
                    "check_id": str(check.id),
                    "dataset_id": str(dataset.id),
                    "check_type": check.check_type,
                    "observed": observed,
                    "expected": expected,
                    "passed": passed,
                    "anomaly": anomaly,
                },
            )
        )
    return result
