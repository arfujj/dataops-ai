import json

from app.agents.investigator import InvestigationResult, parse_investigation_output


def test_agent_output_is_schema_validated_and_assets_and_citations_are_allowlisted():
    context = {
        "downstream_assets": [{"name": "mart.revenue"}],
        "evidence": [{"id": "evidence-1"}],
        "schema_changes": [],
        "failed_runs": [],
        "incident": {
            "category": "SCHEMA_DRIFT",
            "description": "Schema drift",
            "title": "Schema drift",
            "id": "i1",
        },
    }
    output = parse_investigation_output(
        json.dumps(
            {
                "root_cause_category": "schema_drift",
                "root_cause": "A required field changed type.",
                "confidence": 0.9,
                "explanation": "The type changed before the downstream run.",
                "affected_assets": ["mart.revenue", "unrelated.secret"],
                "recommendations": ["Review the staging model.", "DROP TABLE production.users"],
                "citations": ["evidence-1", "made-up-id"],
            }
        ),
        context,
    )
    assert isinstance(output, InvestigationResult)
    assert output.affected_assets == ["mart.revenue"]
    assert output.citations == ["evidence-1"]
    assert output.recommendations == ["Review the staging model."]


def test_invalid_agent_output_uses_deterministic_fallback():
    context = {
        "downstream_assets": [],
        "evidence": [],
        "schema_changes": [],
        "failed_runs": [],
        "incident": {
            "category": "PIPELINE_FAILURE",
            "description": "Run failed",
            "title": "Run failed",
            "id": "i1",
        },
    }
    assert parse_investigation_output("not json", context).root_cause_category == "unknown"
