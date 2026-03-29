import json
import os
from pathlib import Path
from datetime import datetime
import uuid
from sqlalchemy.orm import Session
from fastapi import UploadFile

from app.core.storage_paths import HOST_DATA_PATH
from app.core.exceptions import TraceValidationError
from app.models.graph import Node
from app.models.feature import Feature

# Import your custom modules
from app.services.sabo_gen.trace_gen import TraceParser, SequenceBuilder
from app.services.sabo_gen.dynamic_builder import DynamicGraphBuilder
from app.repositories.trace_repo import TraceRepository
from app.repositories.feature_repo import FeatureRepository
from app.services.graph_service import GraphService

READ_CHUNK_SIZE = 1024 * 1024

class TraceService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TraceRepository(db)
        self.repo_feature = FeatureRepository(db)
        self.graph_service = GraphService(db)

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
        if not file.filename:
            raise TraceValidationError("Uploaded trace file must have a filename")

        project_dir = HOST_DATA_PATH / str(project_id)
        traces_dir = project_dir / "traces"
        traces_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = str(int(datetime.now().timestamp()))
        safe_name = Path(file.filename).stem.replace(" ", "_")

        trace_filename = f"{safe_name}_{timestamp_str}.json"
        trace_path = traces_dir / trace_filename
        temp_path = traces_dir / f".{trace_filename}.{uuid.uuid4().hex}.tmp"

        content_bytes = bytearray()
        total_size = 0

        while True:
            chunk = file.file.read(READ_CHUNK_SIZE)
            if not chunk:
                break

            total_size += len(chunk)
            content_bytes.extend(chunk)

        if total_size == 0:
            raise TraceValidationError("Uploaded trace file is empty")

        try:
            content_str = bytes(content_bytes).decode('utf-8-sig')
        except UnicodeDecodeError:
            try:
                content_str = bytes(content_bytes).decode('cp1252')
            except UnicodeDecodeError as e:
                raise TraceValidationError("Trace file encoding must be UTF-8 or Windows-1252") from e

        parser = TraceParser()
        entries = parser.parse_file(content_str)

        if not entries:
            raise TraceValidationError("No valid trace entries were found in uploaded file")

        seq_builder = SequenceBuilder()
        seq_builder.process_entries(entries)
        trace_sequence = seq_builder.get_sequence()

        if not trace_sequence:
            raise TraceValidationError("Trace sequence is empty after parsing")

        dynamic_builder = DynamicGraphBuilder(trace_sequence, project_id, self.db)
        dynamic_builder.build_graph()

        resolved_steps = dynamic_builder.resolution_counts.get("resolved", 0)
        ambiguous_steps = dynamic_builder.resolution_counts.get("ambiguous", 0)
        unresolved_steps = dynamic_builder.resolution_counts.get("unresolved", 0)
        total_steps = len(trace_sequence)

        file_promoted = False
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(dynamic_builder.dynamic_graph, f, indent=2)

            trace = self.repo.create_trace(
                project_id=project_id,
                name=safe_name,
                description=(
                    f"{total_steps} steps | "
                    f"resolved {resolved_steps} | "
                    f"ambiguous {ambiguous_steps} | "
                    f"unresolved {unresolved_steps}"
                ),
                trace_seq_path=str(trace_path),
                total_steps=total_steps,
                resolved_steps=resolved_steps,
                ambiguous_steps=ambiguous_steps,
                unresolved_steps=unresolved_steps,
                commit=False
            )

            os.replace(temp_path, trace_path)
            file_promoted = True

            self.db.commit()
            self.db.refresh(trace)
            return trace
        except Exception:
            self.db.rollback()

            if temp_path.exists():
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

            if file_promoted and trace_path.exists():
                try:
                    os.remove(trace_path)
                except OSError:
                    pass

            raise
    
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
    
    def get_visible_trace_steps(self, trace_id: int, visible_node_ids, active_feature_ids=None):
        trace = self.repo.get_trace_by_id(trace_id)
        if not trace:
            raise FileNotFoundError("Trace not found in database.")
        trace_file = self.get_trace_file(trace_id)
        elements = trace_file.get("elements", {}) if isinstance(trace_file, dict) else {}
        nodes_of_trace = elements.get("nodes", []) if isinstance(elements, dict) else []
        graph_nodes = self._get_nodes_of_trace(nodes_of_trace)
        
        features_nodes_ids = {}
        if active_feature_ids:
            features_nodes = self.repo_feature.get_nodes_of_features(active_feature_ids)
            features_nodes_ids = {str(node.id) for node in features_nodes}

        visible_ids = {str(node_id) for node_id in (visible_node_ids or []) if node_id is not None}
        if not visible_ids:
            return []
        
        filtered_steps = []

        for node in nodes_of_trace:
            labels = node.get("data", {}).get("labels", [])
            if "Action" not in labels:
                continue
            state = node.get("data", {}).get("properties", {}).get("operationResolution")
            if state != "resolved":
                continue

            props = node.get("data", {}).get("properties", {})
            source_id = props.get("sourceId")
            target_id = props.get("targetId")

            if active_feature_ids:
                if source_id not in features_nodes_ids and target_id not in features_nodes_ids:
                    continue

            source_ancestors = []
            target_ancestors = []
            for graph_node in graph_nodes:
                if str(graph_node.id) == str(source_id):
                    source_ancestors = graph_node.ancestors or []
                if str(graph_node.id) == str(target_id):
                    target_ancestors = graph_node.ancestors or []
            source_visible = any(str(ancestor_id) in visible_ids for ancestor_id in source_ancestors)
            target_visible = any(str(ancestor_id) in visible_ids for ancestor_id in target_ancestors)

            if source_visible or target_visible:
                filtered_steps.append(node)

        return filtered_steps
    
    def _get_nodes_of_trace(self, nodes_of_trace):
        graph_nodes = set()
        for node in nodes_of_trace:
            labels = node.get("data", {}).get("labels", [])
            if "Action" not in labels:
                continue

            props = node.get("data", {}).get("properties", {})
            source_id = props.get("sourceId")
            target_id = props.get("targetId")

            if source_id is not None:
                graph_nodes.add(str(source_id))
            if target_id is not None:
                graph_nodes.add(str(target_id))
            
        return self.graph_service.get_nodes_by_ids(graph_nodes)