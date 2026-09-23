from collections import deque
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Dataset, LineageEdge

MAX_TRAVERSAL_NODES = 500
MAX_TRAVERSAL_DEPTH = 10


def traverse_lineage(
    db: Session,
    organization_id: UUID,
    dataset_id: UUID,
    direction: str,
    max_depth: int = MAX_TRAVERSAL_DEPTH,
    max_nodes: int = MAX_TRAVERSAL_NODES,
) -> list[dict]:
    if direction not in {"upstream", "downstream"}:
        raise ValueError("direction must be upstream or downstream")
    max_depth = max(1, min(max_depth, MAX_TRAVERSAL_DEPTH))
    max_nodes = max(1, min(max_nodes, MAX_TRAVERSAL_NODES))
    edges = list(
        db.scalars(select(LineageEdge).where(LineageEdge.organization_id == organization_id))
    )
    adjacency: dict[UUID, list[UUID]] = {}
    for edge in edges:
        source, target = edge.source_dataset_id, edge.target_dataset_id
        start, neighbor = (target, source) if direction == "upstream" else (source, target)
        adjacency.setdefault(start, []).append(neighbor)

    queue = deque([(dataset_id, 0, [dataset_id])])
    visited = {dataset_id}
    hits: list[tuple[UUID, int, list[UUID]]] = []
    while queue and len(hits) < max_nodes:
        current_id, depth, path = queue.popleft()
        if depth >= max_depth:
            continue
        for neighbor in adjacency.get(current_id, []):
            if neighbor in visited:
                continue
            visited.add(neighbor)
            new_path = [*path, neighbor]
            hits.append((neighbor, depth + 1, new_path))
            queue.append((neighbor, depth + 1, new_path))
            if len(hits) >= max_nodes:
                break

    if not hits:
        return []
    datasets = {
        row.id: row
        for row in db.scalars(
            select(Dataset).where(
                Dataset.organization_id == organization_id,
                Dataset.id.in_({dataset_id, *(node_id for node_id, _, _ in hits)}),
            )
        )
    }
    return [
        {
            "dataset_id": str(node_id),
            "name": datasets[node_id].fully_qualified_name,
            "asset_type": datasets[node_id].asset_type,
            "depth": depth,
            "path": [
                datasets[path_id].fully_qualified_name if path_id in datasets else str(path_id)
                for path_id in path
            ],
        }
        for node_id, depth, path in hits
        if node_id in datasets
    ]
