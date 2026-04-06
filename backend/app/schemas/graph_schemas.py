from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class NodeBase(BaseModel):
    id: str
    data: Dict[str, Any]

class NodeResponse(BaseModel):
    id: str
    project_id: int
    parent_id: Optional[str] = None
    ancestors: List[str] = []
    labels: List[str] = []
    properties: Dict[str, Any] = {}
    ai_summary: Optional[Dict[str, Any]] = None

    hasChildren: bool = False

    participating_features: List[int] = []

    class Config:
        from_attributes = True

class EdgeResponse(BaseModel):
    db_id: int
    project_id: int
    source_id: str
    target_id: str
    label: str

    class Config:
        from_attributes = True

class ProjectSummary(BaseModel):
    id: int
    name: str
    status: str = "ready"
    description: Optional[str] = None

    class Config:
        from_attributes = True

class GraphData(BaseModel):
    nodes: List[NodeResponse]
    edges: List[EdgeResponse]

class TraceSummary(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    total_steps: int = 0
    resolved_steps: int = 0
    ambiguous_steps: int = 0
    unresolved_steps: int = 0

    class Config:
        from_attributes = True


class VisibleTraceFilterRequest(BaseModel):
    visible_node_ids: List[str]
    active_feature_ids: Optional[List[int]] = None


class VisibleTraceStepsResponse(BaseModel):
    steps: List[Dict[str, Any]]


class MicroFeatureSummary(BaseModel):
    id: int
    project_id: int
    trace_id: int
    sequence_order: int
    name: str
    description: Optional[str] = None
    category: str
    components: List[str] = []
    step_count: int = 0
    start_step: Optional[int] = None
    end_step: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MicroFeatureFlowEdge(BaseModel):
    id: int
    project_id: int
    trace_id: int
    source_micro_feature_id: int
    target_micro_feature_id: int
    sequence_order: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TraceExecutionFlowResponse(BaseModel):
    trace_id: int
    micro_features: List[MicroFeatureSummary]
    flow_edges: List[MicroFeatureFlowEdge]
