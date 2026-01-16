import json
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException, BackgroundTasks
from pathlib import Path
from app.core.database import SessionLocal
from app.repositories.graph_repo import GraphRepository
from app.services.sabo_gen.builder import SaboGraphBuilder
from app.models.graph import Project, Node, Edge

class IngestService:
    def __init__(self, db: Session):
        self.repo = GraphRepository(db)

    def create_project_entry(self, name: str):
        existing = self.repo.get_project_by_name(name)
        if existing:
            raise ValueError(f"A project with the name '{name}' already exists.")
        
        return self.repo.create_project(name=name, status="processing", description="Processing started...")


    def save_graph_data(self, repo: GraphRepository, project_id: int, elements: dict):
        raw_nodes = elements.get("nodes", [])
        raw_edges = elements.get("edges", [])

        nodes = []
        for raw_node in raw_nodes:
            data = raw_node.get("data", raw_node)

            nodes.append({
                "project_id": project_id,
                "id": data["id"],
                "labels": data.get("labels", []),
                "properties": data.get("properties", {}),
                "parent_id": data.get("parent") or None,
                "ancestors": data.get("ancestors", []),
                "hasChildren": data.get("hasChildren", False)
            })

        edges = []
        for raw_edge in raw_edges:
            data = raw_edge.get("data", raw_edge)

            edges.append({
                "project_id": project_id,
                "source_id": data["source"],
                "target_id": data["target"],
                "label": data.get("label", "")
            })
        
        repo.bulk_create_nodes(nodes)
        repo.bulk_create_edges(edges)

        return len(nodes), len(edges)
    
    def process_m3_file(self, project_id: int, m3_content: dict):
        with SessionLocal() as db:
            repo = GraphRepository(db)

            try:
                repo.change_project_status(project_id, "processing", "Transforming M3 Model...")

                project = repo.get_project_by_id(project_id)
                builder = SaboGraphBuilder(project.name)
                builder.process_m3(m3_content)
                lpg_data = builder.export_for_vis()

                nodes_len, edges_len = self.save_graph_data(repo, project_id, lpg_data.get("elements", {}))
                repo.change_project_status(project_id, status="ready", description=f"Imported {nodes_len} nodes and {edges_len} edges successfully.")

            except Exception as e:
                repo.change_project_status(project_id, "error", str(e)[:500])

    def ingest_lpg_file(self, project_id: int, lpg_content: dict):
        with SessionLocal() as db:
            repo = GraphRepository(db)

            try:
                repo.change_project_status(project_id, "processing", "Importing JSON...")
                nodes_len, edges_len = self.save_graph_data(repo, project_id, lpg_content.get("elements", {}))
                repo.change_project_status(project_id, status="ready", description=f"Imported {nodes_len} nodes and {edges_len} edges successfully.")
            
            except Exception as e:
                repo.change_project_status(project_id, status="error", description=str(e)[:500])

    def get_unresolved_includes(self, project_id: int) -> list:
        from app.services.rascal_service import RascalService

        rascal_service = RascalService()

        try:
            json_path = rascal_service.get_analysis_file(project_id)

            with open(json_path, 'r') as f:
                data = json.load(f)
            return data.get("unresolvedIncludes", [])
        except FileNotFoundError:
            raise FileNotFoundError("Analysis file missing.")
        except Exception as e:
            raise RuntimeError(f"Failed to read analysis file: {e}")
        
    def background_resume_task(self, project_id: int, json_path: Path):
        try:
            with open(json_path, 'r') as f:
                content = json.load(f)
            self.process_m3_file(project_id, content)
        except Exception as e:
            with SessionLocal() as db:
                repo = GraphRepository(db)
                repo.change_project_status(project_id, "error", f"Resume Failed: {str(e)[:500]}")

    def resume_ingestion(self, project_id: int, background_tasks: BackgroundTasks):
        from app.services.rascal_service import RascalService
        rascal_service = RascalService()

        json_path = rascal_service.get_analysis_file(project_id)
        background_tasks.add_task(self.background_resume_task, project_id, json_path)
            