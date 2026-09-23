import re
from uuid import UUID

READ_ONLY_QUERY = re.compile(
    r"\A\s*SELECT\s+(?P<operation>COUNT\(\*\)|MIN\(INGESTED_AT\)|MAX\(INGESTED_AT\))"
    r"\s+FROM\s+DEMO_RECORDS"
    r"(?:\s+WHERE\s+DATASET_ID\s*=\s*'(?P<dataset_id>[0-9a-fA-F-]{36})')?"
    r"\s*\Z",
    re.IGNORECASE,
)


def validate_readonly_sql(sql: str) -> dict[str, str | None]:
    if not sql or len(sql) > 500:
        raise ValueError("Read-only SQL must be 1 to 500 characters")
    if ";" in sql or "--" in sql or "/*" in sql or "*/" in sql:
        raise ValueError("Multiple statements and SQL comments are not allowed")
    match = READ_ONLY_QUERY.fullmatch(sql)
    if match is None:
        raise ValueError(
            "Only COUNT(*), MIN(ingested_at), or MAX(ingested_at) from demo_records is allowed"
        )
    dataset_id = match.group("dataset_id")
    if dataset_id:
        try:
            dataset_id = str(UUID(dataset_id))
        except ValueError as error:
            raise ValueError("dataset_id must be a UUID") from error
    return {"operation": match.group("operation").upper(), "dataset_id": dataset_id}
