import json
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any
from app.repositories.graph_repo import GraphRepository
from app.services.rascal_service import RascalService
from app.core.storage_paths import HOST_DATA_PATH, FULL_PROJECT_SNIPPETS_FILENAME
from app.core.database import SessionLocal
from app.models.graph import Node, Edge

class GraphService:
    def __init__(self, db: Session):
        self.repo = GraphRepository(db)

    def get_initial_view(self, project_id: int):
        nodes = self.repo.get_roots(project_id)

        nodes_ids = [n.id for n in nodes]
        edges = self.repo.get_edges_for_nodes(project_id, nodes_ids)

        return {
            "nodes": nodes,
            "edges": edges
        }
    
    def get_node_children(self, project_id: int, parent_id: str):
        nodes = self.repo.get_children(project_id, parent_id)

        if not nodes:
            return {
                "nodes": [],
                "edges": []
            }

        return {
            "nodes": nodes,
            "edges": []
        }

    def get_all_projects(self) -> List[Dict[str, Any]]:
        return self.repo.get_all_projects()
    
    def get_project_by_id(self, project_id: int):
        return self.repo.get_project_by_id(project_id)
    
    def change_project_status(self, project_id: int, status: str, description: str):
        return self.repo.change_project_status(project_id, status, description)
    
    def mark_as_deleting(self, project_id: int) -> bool:
        return self.repo.mark_project_as_deleting(project_id)
    
    def delete_project(self, project_id: int):
        with SessionLocal() as db:
            repo = GraphRepository(db)
            repo.delete_project(project_id)
        
        rascal_service = RascalService()
        rascal_service.delete_workspace(project_id)

    def get_all_nodes(self, project_id: int) -> List[Node]:
        return self.repo.get_all_nodes(project_id)
    
    def get_all_edges(self, project_id: int) -> List[Edge]:
        return self.repo.get_all_edges(project_id)
    
    def get_edges_between_nodes(self,  node_ids: list[str]):
        return self.repo.get_edges_between_nodes(node_ids)
    
    def update_node(self, node: Node):
        self.repo.update_node(node)
    
    def get_aggregated_edges(self, project_id: int, visible_ids: list[str]):
        return self.repo.get_aggregated_edges(project_id, visible_ids)

    def get_project_roots(self, project_id: int) -> List[Dict[str, Any]]:
        return self.repo.get_roots(project_id)
    
    def get_operation_map(self, project_id: int) -> dict:
        return self.repo.get_operation_map(project_id)
    
    def get_batch_hierarchy(self, project_id: int, node_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        return self.repo.get_batch_hierarchy(project_id, node_ids)

    def export_static_graph(self, project_id: int) -> dict | None:
        project = self.repo.get_project_by_id(project_id)
        if not project:
            return None

        nodes = self.repo.get_all_nodes(project_id)
        edges = self.repo.get_all_edges(project_id)

        exported_nodes = []
        for node in nodes:
            exported_nodes.append({
                "data": {
                    "id": node.id,
                    "labels": node.labels or [],
                    "properties": node.properties or {},
                    "parent": node.parent_id,
                    "ancestors": node.ancestors or [],
                    "hasChildren": bool(node.hasChildren),
                    "ai_summary": node.ai_summary,
                }
            })

        exported_edges = []
        for edge in edges:
            exported_edges.append({
                "data": {
                    "source": edge.source_id,
                    "target": edge.target_id,
                    "label": edge.label,
                }
            })

        snippets = {}
        snippets_path = HOST_DATA_PATH / str(project_id) / FULL_PROJECT_SNIPPETS_FILENAME
        if snippets_path.exists():
            try:
                with open(snippets_path, "r", encoding="utf-8") as snippets_file:
                    loaded = json.load(snippets_file)
                    if isinstance(loaded, dict):
                        snippets = loaded
            except Exception:
                snippets = {}

        return {
            "format": "saboviz-static-graph",
            "version": "1.0",
            "project": {
                "name": project.name,
                "exported_at": datetime.now(timezone.utc).isoformat(),
            },
            "elements": {
                "nodes": exported_nodes,
                "edges": exported_edges,
            },
            "snippets": snippets,
        }