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
    hasChildren: bool = False

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

    class Config:
        from_attributes = True
