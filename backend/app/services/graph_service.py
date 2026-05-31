import json
from pathlib import Path
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any
from app.repositories.feature_repo import FeatureRepository
from app.repositories.graph_repo import GraphRepository
from app.repositories.micro_features_repo import MicroFeaturesRepository
from app.repositories.trace_repo import TraceRepository
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
    
    def get_nodes_by_ids(self, node_ids: list[str]):
        return self.repo.get_nodes_by_ids(node_ids)
    
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
    
    def get_summary_map(self, project_id: int) -> dict:
        return self.repo.get_summary_map(project_id)
    
    def get_batch_hierarchy(self, project_id: int, node_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        return self.repo.get_batch_hierarchy(project_id, node_ids)

    def export_static_graph(self, project_id: int) -> dict | None:
        project = self.repo.get_project_by_id(project_id)
        if not project:
            return None

        nodes = self.repo.get_all_nodes(project_id)
        nodes = self.repo.attach_features_to_nodes(project_id, nodes)
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
                    "participating_features": getattr(node, "participating_features", []),
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

        feature_repo = FeatureRepository(self.repo.db)
        trace_repo = TraceRepository(self.repo.db)
        micro_features_repo = MicroFeaturesRepository(self.repo.db)

        exported_features = []
        features = feature_repo.get_features_by_project(project_id)
        for feature in features:
            exported_features.append({
                "id": feature.id,
                "project_id": feature.project_id,
                "name": feature.name,
                "description": feature.description,
                "category": feature.category,
                "score": feature.score,
                "node_ids": [node.id for node in feature.nodes],
            })

        def _dt_to_iso(value: datetime | None) -> str | None:
            if not value:
                return None
            return value.isoformat()

        exported_traces = []
        traces = trace_repo.get_traces_by_project_id(project_id)
        for trace in traces:
            trace_file = None
            trace_file_error = None
            if trace.trace_seq_path:
                trace_path = Path(trace.trace_seq_path)
                if trace_path.exists():
                    try:
                        with open(trace_path, "r", encoding="utf-8") as trace_file_handle:
                            trace_file = json.load(trace_file_handle)
                    except Exception as exc:
                        trace_file_error = f"Failed to read trace file '{trace_path.name}': {exc}"
                else:
                    trace_file_error = f"Trace file missing from disk: {trace_path.name}"

            micro_features = micro_features_repo.get_micro_features_by_trace(trace.id)
            micro_feature_flows = micro_features_repo.get_micro_feature_flows_by_trace(trace.id)
            hierarchical_clusters = micro_features_repo.get_hierarchical_clusters_by_trace(trace.id)

            exported_traces.append({
                "id": trace.id,
                "project_id": trace.project_id,
                "name": trace.name,
                "description": trace.description,
                "created_at": _dt_to_iso(trace.created_at),
                "total_steps": trace.total_steps,
                "resolved_steps": trace.resolved_steps,
                "ambiguous_steps": trace.ambiguous_steps,
                "unresolved_steps": trace.unresolved_steps,
                "trace_file": trace_file,
                "trace_file_error": trace_file_error,
                "micro_features": [
                    {
                        "id": row.id,
                        "project_id": row.project_id,
                        "trace_id": row.trace_id,
                        "sequence_order": row.sequence_order,
                        "name": row.name,
                        "description": row.description,
                        "category": row.category,
                        "components": row.components or [],
                        "step_count": row.step_count,
                        "start_step": row.start_step,
                        "end_step": row.end_step,
                        "created_at": _dt_to_iso(row.created_at),
                    }
                    for row in micro_features
                ],
                "micro_feature_flows": [
                    {
                        "id": row.id,
                        "project_id": row.project_id,
                        "trace_id": row.trace_id,
                        "source_micro_feature_id": row.source_micro_feature_id,
                        "target_micro_feature_id": row.target_micro_feature_id,
                        "sequence_order": row.sequence_order,
                        "created_at": _dt_to_iso(row.created_at),
                    }
                    for row in micro_feature_flows
                ],
                "hierarchical_clusters": [
                    {
                        "id": row.id,
                        "project_id": row.project_id,
                        "trace_id": row.trace_id,
                        "parent_cluster_id": row.parent_cluster_id,
                        "left_child_cluster_id": row.left_child_cluster_id,
                        "right_child_cluster_id": row.right_child_cluster_id,
                        "sequence_order": row.sequence_order,
                        "hierarchy_level": row.hierarchy_level,
                        "name": row.name,
                        "description": row.description,
                        "member_micro_feature_ids": row.member_micro_feature_ids or [],
                        "member_count": row.member_count,
                        "start_step": row.start_step,
                        "end_step": row.end_step,
                        "created_at": _dt_to_iso(row.created_at),
                    }
                    for row in hierarchical_clusters
                ],
            })

        return {
            "format": "saboviz-graph",
            "version": "1.1",
            "project": {
                "name": project.name,
                "exported_at": datetime.now(timezone.utc).isoformat(),
            },
            "elements": {
                "nodes": exported_nodes,
                "edges": exported_edges,
            },
            "snippets": snippets,
            "features": exported_features,
            "traces": exported_traces,
        }
    
    def get_project_logs(self, project_id: int, limit: int = 200):
        return self.repo.get_project_logs(project_id, limit)