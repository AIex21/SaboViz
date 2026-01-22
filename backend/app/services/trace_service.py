import json
import os
from pathlib import Path
from datetime import datetime
import shutil
from sqlalchemy.orm import Session
from fastapi import UploadFile

from app.services.rascal_service import HOST_DATA_PATH

# Import your custom modules
from app.services.sabo_gen.trace_gen import TraceParser, SequenceBuilder
from app.services.sabo_gen.dynamic_builder import DynamicGraphBuilder
from app.repositories.trace_repo import TraceRepository

class TraceService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TraceRepository(db)

    def get_project_traces(self, project_id: int):
        return self.repo.get_traces_by_project_id(project_id)

    def get_trace_file(self, trace_id: int):
        trace = self.repo.get_trace_by_id(trace_id)
        if not trace:
            raise FileNotFoundError("Trace not found in database.")
        
        file_path = Path(trace.trace_seq_path)

        if not file_path.exists():
            raise FileNotFoundError(f"Trace file missing from disk: {file_path.name}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed to read trace file: {str(e)}")

    def process_trace_file(self, project_id: int, file: UploadFile):
        project_dir = HOST_DATA_PATH / str(project_id)
        traces_dir = project_dir / "traces"
        traces_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = str(int(datetime.now().timestamp()))
        safe_name = Path(file.filename).stem.replace(" ", "_")

        trace_filename = f"{safe_name}_{timestamp_str}.json"
        trace_path = traces_dir / trace_filename

        content_bytes = file.file.read()
        content_str = content_bytes.decode('utf-8')

        parser = TraceParser()
        entries = parser.parse_file(content_str)

        seq_builder = SequenceBuilder()
        seq_builder.process_entries(entries)
        trace_sequence = seq_builder.get_sequence()

        dynamic_builder = DynamicGraphBuilder(trace_sequence, project_id, self.db)
        dynamic_builder.build_graph()
        dynamic_builder.save_json(str(trace_path))

        return self.repo.create_trace(
            project_id=project_id,
            name=safe_name,
            description=f"Trace with {len(trace_sequence)} steps",
            trace_seq_path=str(trace_path)
        )
    
    def delete_trace(self, trace_id: int):
        trace = self.repo.get_trace_by_id(trace_id)
        if not trace:
            raise FileNotFoundError("Trace not found in database.")
        
        file_path = Path(trace.trace_seq_path)
        if file_path.exists():
            try:
                os.remove(file_path)
            except Exception as e:
                raise RuntimeError(f"Failed to delete trace file: {str(e)}")
        
        self.repo.delete_trace(trace_id)