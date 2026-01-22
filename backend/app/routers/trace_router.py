import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.services.trace_service import TraceService
from app.services.graph_service import GraphService
from app.schemas.graph_schemas import TraceSummary

router = APIRouter(prefix="/api", tags=["Traces"])

def get_trace_service(db: Session = Depends(get_db)):
    return TraceService(db)

def get_graph_service(db: Session = Depends(get_db)):
    return GraphService(db)

@router.get("/projects/{project_id}/traces", response_model=List[TraceSummary])
def get_project_traces(
    project_id: int,
    service: TraceService = Depends(get_trace_service),
    graph_service: GraphService = Depends(get_graph_service)
):
    if not graph_service.get_project_by_id(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    return service.get_project_traces(project_id)

@router.get("/traces/{trace_id}/file")
def get_trace_file(
    trace_id: int,
    service: TraceService = Depends(get_trace_service)
):
    try:
        return service.get_trace_file(trace_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/traces", response_model=TraceSummary)
def upload_trace(
    project_id: int,
    file: UploadFile = File(...),
    service: TraceService = Depends(get_trace_service),
    graph_service: GraphService = Depends(get_graph_service)
):
    if not graph_service.get_project_by_id(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        return service.process_trace_file(project_id, file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trace processing failed: {str(e)}")
    
@router.delete("/traces/{trace_id}")
def delete_trace(
    trace_id: int,
    service: TraceService = Depends(get_trace_service)
):
    try:
        service.repo.delete_trace(trace_id)
        return {"detail": "Trace deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete trace: {str(e)}")