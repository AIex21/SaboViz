import json
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Body
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.services.graph_service import GraphService
from app.services.ingest_service import IngestService
from app.services.rascal_service import RascalService, run_full_analysis_pipeline
from app.schemas.graph_schemas import NodeResponse, EdgeResponse, ProjectSummary, GraphData

router = APIRouter(prefix="/api", tags=["Graph"])

def get_service(db: Session = Depends(get_db)):
    return GraphService(db)

def get_ingest_service(db: Session = Depends(get_db)):
    return IngestService(db)

@router.get("/projects", response_model=List[ProjectSummary])
def get_projects(
    service: GraphService = Depends(get_service)
):
    return service.get_all_projects()

@router.get("/projects/{project_id}", response_model=ProjectSummary)
def get_project(
    project_id: int,
    service: GraphService = Depends(get_service)
):
    project = service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    service: GraphService = Depends(get_service)
):
    success = service.mark_as_deleting(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    background_tasks.add_task(service.delete_project, project_id)
    return {"message": "Project deleted successfully"}

@router.get("/projects/{project_id}/nodes", response_model=List[NodeResponse])
def get_nodes(
    project_id: int,
    service: GraphService = Depends(get_service)
):
    return service.get_all_nodes(project_id)

@router.get("/projects/{project_id}/edges", response_model=List[EdgeResponse])
def get_edges(
    project_id: int,
    service: GraphService = Depends(get_service)
):
    return service.get_all_edges(project_id)

@router.get("/projects/{project_id}/roots", response_model=GraphData)
def get_roots(
    project_id: int,
    service: GraphService = Depends(get_service)
):
    return service.get_initial_view(project_id)

@router.get("/projects/{project_id}/children", response_model=GraphData)
def get_children(
    project_id: int, 
    parent_id: str, 
    service: GraphService = Depends(get_service)
):
    return service.get_node_children(project_id, parent_id)

@router.post("/projects/{project_id}/edges/aggregated")
def get_aggregated_edges(
    project_id: int,
    visible_ids: list[str] = Body(...),
    service: GraphService = Depends(get_service)
):
    return {"edges": service.get_aggregated_edges(project_id, visible_ids)}

@router.post("/projects/upload", response_model=ProjectSummary)
async def upload_project(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(...),
    service: IngestService = Depends(get_ingest_service)
): 
    try:
        project = service.create_project_entry(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if file.filename.endswith('.json'):
        content = await file.read()
        try:
            json_content = json.loads(content)
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to parse JSON file.")
        
        if "declarations" in json_content:
            background_tasks.add_task(service.process_m3_file, project.id, json_content)
        elif "elements" in json_content:
            background_tasks.add_task(service.ingest_lpg_file, project.id, json_content)
        else:
            raise HTTPException(status_code=400, detail="Unknown JSON format.")

    elif file.filename.endswith('.zip'):
        rascal_service = RascalService()
        content = await file.read()
        await rascal_service.prepare_workspace(project.id, content)
        background_tasks.add_task(run_full_analysis_pipeline, project.id, rascal_service, service)

    return project

@router.get("/projects/{project_id}/unresolved")
def get_unresolved_includes(
    project_id: int,
    service: GraphService = Depends(get_service),
    ingest_service: IngestService = Depends(get_ingest_service)
):
    if not service.get_project_by_id(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        unresolved = ingest_service.get_unresolved_includes(project_id)
        return {"unresolved": unresolved}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Analysis file missing.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/projects/{project_id}/continue")
def continue_ingestion(
    project_id: int,
    background_tasks: BackgroundTasks,
    service: GraphService = Depends(get_service),
    ingest_service: IngestService = Depends(get_ingest_service)
):
    if not service.get_project_by_id(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        ingest_service.resume_ingestion(project_id, background_tasks)
        return {"message": "Ingestion resumed"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Analysis file missing.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))