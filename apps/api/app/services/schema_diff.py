from difflib import SequenceMatcher
from typing import TypedDict


class ColumnSpec(TypedDict):
    name: str
    type: str
    nullable: bool


SAFE_WIDENINGS = {
    ("SMALLINT", "INTEGER"),
    ("SMALLINT", "BIGINT"),
    ("INTEGER", "BIGINT"),
    ("FLOAT", "DOUBLE"),
    ("REAL", "DOUBLE"),
    ("VARCHAR", "TEXT"),
}


def normalize_columns(columns: list[dict]) -> list[ColumnSpec]:
    normalized: list[ColumnSpec] = []
    seen: set[str] = set()
    for column in columns:
        name = str(column.get("name", "")).strip()
        data_type = str(column.get("type", column.get("data_type", "UNKNOWN"))).strip().upper()
        if not name or len(name) > 160 or name in seen:
            raise ValueError("Column names must be unique, non-empty, and at most 160 characters")
        if not data_type or len(data_type) > 80:
            raise ValueError(f"Invalid data type for column {name}")
        seen.add(name)
        normalized.append(
            {"name": name, "type": data_type, "nullable": bool(column.get("nullable", True))}
        )
    if not normalized:
        raise ValueError("Schema must contain at least one column")
    if len(normalized) > 500:
        raise ValueError("Schema contains more than 500 columns")
    return normalized


def compare_schemas(previous: list[dict], current: list[ColumnSpec]) -> list[dict[str, str]]:
    old = {str(col["name"]): col for col in previous}
    new = {col["name"]: col for col in current}
    removed = set(old) - set(new)
    added = set(new) - set(old)
    changes: list[dict[str, str]] = []

    rename_pairs: list[tuple[str, str, float]] = []
    for old_name in removed:
        for new_name in added:
            ratio = SequenceMatcher(None, old_name.lower(), new_name.lower()).ratio()
            if old[old_name].get("type", "").upper() == new[new_name]["type"] and ratio >= 0.72:
                rename_pairs.append((old_name, new_name, ratio))
    for old_name, new_name, _ in sorted(rename_pairs, key=lambda pair: pair[2], reverse=True):
        if old_name not in removed or new_name not in added:
            continue
        changes.append(
            {
                "change_type": "RENAMED_LOOKING",
                "classification": "POTENTIALLY_BREAKING",
                "column_name": new_name,
                "previous_name": old_name,
                "previous_type": old[old_name].get("type", ""),
                "current_type": new[new_name]["type"],
            }
        )
        removed.remove(old_name)
        added.remove(new_name)

    for name in sorted(added):
        required = not new[name]["nullable"]
        changes.append(
            {
                "change_type": "COLUMN_ADDED",
                "classification": "POTENTIALLY_BREAKING" if required else "NON_BREAKING",
                "column_name": name,
                "previous_name": "",
                "previous_type": "",
                "current_type": new[name]["type"],
            }
        )
    for name in sorted(removed):
        changes.append(
            {
                "change_type": "COLUMN_REMOVED",
                "classification": "BREAKING",
                "column_name": name,
                "previous_name": name,
                "previous_type": old[name].get("type", ""),
                "current_type": "",
            }
        )
    for name in sorted(set(old) & set(new)):
        old_type = str(old[name].get("type", "UNKNOWN")).upper()
        new_type = new[name]["type"]
        if old_type != new_type:
            safe = (old_type, new_type) in SAFE_WIDENINGS
            changes.append(
                {
                    "change_type": "TYPE_CHANGED",
                    "classification": "NON_BREAKING" if safe else "BREAKING",
                    "column_name": name,
                    "previous_name": name,
                    "previous_type": old_type,
                    "current_type": new_type,
                }
            )
        old_nullable = bool(old[name].get("nullable", True))
        if old_nullable != new[name]["nullable"]:
            changes.append(
                {
                    "change_type": "NULLABLE_CHANGED",
                    "classification": "BREAKING" if old_nullable else "NON_BREAKING",
                    "column_name": name,
                    "previous_name": name,
                    "previous_type": str(old_nullable).lower(),
                    "current_type": str(new[name]["nullable"]).lower(),
                }
            )
    return changes
