from sqlalchemy.orm import Session
from sqlalchemy import not_, text
from app.models.graph import Project, Trace

class TraceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_traces_by_project_id(self, project_id: int):
        return self.db.query(Trace).filter(Trace.project_id == project_id).all()

    def get_trace_by_id(self, trace_id: int):
        return self.db.query(Trace).filter(Trace.id == trace_id).first()

    def create_trace(self, project_id: int, name: str, description: str, trace_seq_path: str):
        trace = Trace(
            project_id=project_id,
            name=name,
            description=description,
            trace_seq_path=trace_seq_path
        )
        self.db.add(trace)
        self.db.commit()
        self.db.refresh(trace)
        return trace
    
    def delete_trace(self, trace_id: int):
        trace = self.get_trace_by_id(trace_id)
        if trace:
            self.db.delete(trace)
            self.db.commit()