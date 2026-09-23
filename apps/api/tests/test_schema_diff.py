from app.services.schema_diff import compare_schemas, normalize_columns


def test_type_narrowing_is_breaking_but_safe_widening_is_not():
    before = [{"name": "customer_id", "type": "BIGINT", "nullable": True}]
    narrowing = compare_schemas(
        before, normalize_columns([{"name": "customer_id", "type": "VARCHAR"}])
    )
    widening = compare_schemas(
        [{"name": "customer_id", "type": "SMALLINT", "nullable": True}],
        normalize_columns([{"name": "customer_id", "type": "BIGINT"}]),
    )
    assert narrowing[0]["classification"] == "BREAKING"
    assert widening[0]["classification"] == "NON_BREAKING"


def test_added_nullable_column_is_non_breaking_and_removal_is_breaking():
    before = [{"name": "id", "type": "BIGINT", "nullable": False}]
    changes = compare_schemas(
        before,
        normalize_columns(
            [{"name": "id", "type": "BIGINT", "nullable": False}, {"name": "note", "type": "TEXT"}]
        ),
    )
    assert changes[0]["change_type"] == "COLUMN_ADDED"
    assert changes[0]["classification"] == "NON_BREAKING"
    removed = compare_schemas(before, normalize_columns([{"name": "key", "type": "BIGINT"}]))
    assert any(change["change_type"] == "COLUMN_REMOVED" for change in removed)


def test_rename_looking_column_is_flagged_for_review():
    before = [{"name": "customer_id", "type": "BIGINT", "nullable": True}]
    after = [{"name": "customer_id_new", "type": "BIGINT", "nullable": True}]
    changes = compare_schemas(before, normalize_columns(after))
    assert changes[0]["change_type"] == "RENAMED_LOOKING"
    assert changes[0]["classification"] == "POTENTIALLY_BREAKING"
