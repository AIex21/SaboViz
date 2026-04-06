import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Union

from app.core.database import get_db
from app.core.exceptions import TraceValidationError
from app.services.func_decomp_service import FunctionalDecompositionService
from app.services.trace_service import TraceService
from app.services.graph_service import GraphService
from app.schemas.graph_schemas import (
    MicroFeatureSummary,
    TraceExecutionFlowResponse,
    TraceSummary,
    VisibleTraceFilterRequest,
    VisibleTraceStepsResponse,
)

router = APIRouter(prefix="/api", tags=["Traces"])

def get_trace_service(db: Session = Depends(get_db)):
    return TraceService(db)

def get_graph_service(db: Session = Depends(get_db)):
    return GraphService(db)


def get_decomposition_service(db: Session = Depends(get_db)):
    return FunctionalDecompositionService(db)

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

@router.post("/projects/{project_id}/traces", response_model=Union[TraceSummary, List[TraceSummary]])
def upload_trace(
    project_id: int,
    file: UploadFile | None = File(default=None),
    files: List[UploadFile] | None = File(default=None),
    service: TraceService = Depends(get_trace_service),
    graph_service: GraphService = Depends(get_graph_service)
):
    if not graph_service.get_project_by_id(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    uploads: List[UploadFile] = []
    if file is not None:
        uploads.append(file)
    if files:
        uploads.extend(files)

    if not uploads:
        raise HTTPException(status_code=422, detail="No trace files were provided")
    
    try:
        processed = [service.process_trace_file(project_id, upload) for upload in uploads]
        return processed[0] if len(processed) == 1 else processed
    except TraceValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trace processing failed: {str(e)}")
    
@router.delete("/traces/{trace_id}")
def delete_trace(
    trace_id: int,
    service: TraceService = Depends(get_trace_service)
):
    try:
        service.delete_trace(trace_id)
        return {"detail": "Trace deleted successfully"}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete trace: {str(e)}")


@router.post("/traces/{trace_id}/steps/visible", response_model=VisibleTraceStepsResponse)
def get_visible_trace_steps(
    trace_id: int,
    payload: VisibleTraceFilterRequest,
    service: TraceService = Depends(get_trace_service)
):
    try:
        steps = service.get_visible_trace_steps(
            trace_id,
            payload.visible_node_ids,
            payload.active_feature_ids,
        )
        return {"steps": steps}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to filter trace steps: {str(e)}")


@router.get("/traces/{trace_id}/micro-features", response_model=List[MicroFeatureSummary])
def get_trace_micro_features(
    trace_id: int,
    decomposition_service: FunctionalDecompositionService = Depends(get_decomposition_service),
    trace_service: TraceService = Depends(get_trace_service),
):
    trace = trace_service.get_trace_by_id(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    return decomposition_service.get_trace_micro_features(trace_id)


@router.get("/traces/{trace_id}/execution-flow", response_model=TraceExecutionFlowResponse)
def get_trace_execution_flow(
    trace_id: int,
    decomposition_service: FunctionalDecompositionService = Depends(get_decomposition_service),
    trace_service: TraceService = Depends(get_trace_service),
):
    trace = trace_service.get_trace_by_id(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    return decomposition_service.get_trace_execution_flow(trace_id)