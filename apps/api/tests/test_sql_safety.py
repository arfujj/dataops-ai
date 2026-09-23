import pytest

from app.policies.sql_safety import validate_readonly_sql


def test_restricted_readonly_query_is_parsed_and_tenant_scope_is_injected_elsewhere():
    parsed = validate_readonly_sql("SELECT COUNT(*) FROM demo_records")
    assert parsed == {"operation": "COUNT(*)", "dataset_id": None}


@pytest.mark.parametrize(
    "query",
    [
        "DELETE FROM demo_records",
        "SELECT * FROM demo_records",
        "SELECT COUNT(*) FROM users",
        "SELECT COUNT(*) FROM demo_records; DROP TABLE users",
        "SELECT COUNT(*) FROM demo_records -- tenant bypass",
        "SELECT COUNT(*) FROM demo_records WHERE organization_id = 'other'",
    ],
)
def test_unapproved_sql_is_rejected(query):
    with pytest.raises(ValueError):
        validate_readonly_sql(query)
