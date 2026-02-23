from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.repositories.graph_repo import GraphRepository
from app.services.rascal_service import RascalService
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