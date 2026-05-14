import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks
from pathlib import Path
from app.core.database import SessionLocal
from app.core.storage_paths import HOST_DATA_PATH, FULL_PROJECT_SNIPPETS_FILENAME
from app.models.feature import Feature
from app.models.micro_features import TraceHierarchicalCluster
from app.repositories.feature_repo import FeatureRepository
from app.repositories.graph_repo import GraphRepository
from app.repositories.micro_features_repo import MicroFeaturesRepository
from app.repositories.trace_repo import TraceRepository
from app.services.sabo_gen.builder import SaboGraphBuilder
from app.models.graph import Project, Node, Edge

class IngestService:
    def __init__(self, db: Session):
        self.repo = GraphRepository(db)

    def is_static_graph_export(self, payload: dict) -> bool:
        return payload.get("format") == "saboviz-graph"

    def create_project_entry(
        self,
        name: str,
        auto_continue_unresolved: bool = False,
        run_summarization: bool = True
    ):
        existing = self.repo.get_project_by_name(name)
        if existing:
            raise ValueError(f"A project with the name '{name}' already exists.")
        
        return self.repo.create_project(
            name=name,
            status="processing",
            description="Processing started...",
            auto_continue_unresolved=auto_continue_unresolved,
            run_summarization=run_summarization
        )


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
                "ai_summary": data.get("ai_summary"),
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

    def save_snippets_data(self, project_id: int, snippets: dict | None):
        if not isinstance(snippets, dict):
            return

        serialized_snippets = {}
        for node_id, code in snippets.items():
            if isinstance(node_id, str) and isinstance(code, str):
                serialized_snippets[node_id] = code

        if not serialized_snippets:
            return

        project_dir = HOST_DATA_PATH / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        snippets_path = project_dir / FULL_PROJECT_SNIPPETS_FILENAME
        with open(snippets_path, "w", encoding="utf-8") as snippets_file:
            json.dump(serialized_snippets, snippets_file, ensure_ascii=False)

    def _safe_trace_name(self, raw_name: str | None, trace_index: int) -> str:
        name = str(raw_name or "").strip()
        if not name:
            return f"trace_{trace_index}"

        safe_name = Path(name).stem.replace(" ", "_")
        safe_name = safe_name.replace("/", "_").replace("\\", "_")
        return safe_name or f"trace_{trace_index}"

    def _write_trace_file(
        self,
        project_id: int,
        trace_name: str | None,
        trace_index: int,
        trace_file: dict,
    ) -> str:
        project_dir = HOST_DATA_PATH / str(project_id)
        traces_dir = project_dir / "traces"
        traces_dir.mkdir(parents=True, exist_ok=True)

        safe_name = self._safe_trace_name(trace_name, trace_index)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        trace_filename = f"{safe_name}_{timestamp}_{trace_index}.json"
        trace_path = traces_dir / trace_filename

        with open(trace_path, "w", encoding="utf-8") as trace_file_handle:
            json.dump(trace_file, trace_file_handle, indent=2)

        return str(trace_path)

    def _coerce_int(self, value, default: int = 0) -> int:
        try:
            if value is None:
                return default
            return int(value)
        except (TypeError, ValueError):
            return default

    def _coerce_optional_int(self, value) -> int | None:
        try:
            if value is None:
                return None
            return int(value)
        except (TypeError, ValueError):
            return None

    def save_features_data(self, db: Session, project_id: int, features: list | None) -> int:
        if not isinstance(features, list) or not features:
            return 0

        feature_repo = FeatureRepository(db)
        graph_repo = GraphRepository(db)

        node_ids = {
            str(node_id)
            for feature in features
            if isinstance(feature, dict)
            for node_id in (feature.get("node_ids") or [])
            if node_id is not None
        }
        node_lookup = {}
        if node_ids:
            node_lookup = {node.id: node for node in graph_repo.get_nodes_by_ids(list(node_ids))}

        created = 0
        for raw_feature in features:
            if not isinstance(raw_feature, dict):
                continue

            score_value = raw_feature.get("score")
            try:
                score = float(score_value) if score_value is not None else 0.0
            except (TypeError, ValueError):
                score = 0.0

            feature = Feature(
                project_id=project_id,
                name=str(raw_feature.get("name") or "Feature"),
                description=raw_feature.get("description"),
                category=str(raw_feature.get("category") or "Feature"),
                score=score,
            )

            feature_node_ids = [
                str(node_id)
                for node_id in (raw_feature.get("node_ids") or [])
                if node_id is not None
            ]
            feature.nodes = [node_lookup[node_id] for node_id in feature_node_ids if node_id in node_lookup]

            feature_repo.create_feature_without_commit(feature)
            created += 1

        feature_repo.commit()
        return created

    def save_traces_data(self, db: Session, project_id: int, traces: list | None) -> int:
        if not isinstance(traces, list) or not traces:
            return 0

        trace_repo = TraceRepository(db)
        micro_repo = MicroFeaturesRepository(db)

        created = 0

        for trace_index, raw_trace in enumerate(traces, start=1):
            if not isinstance(raw_trace, dict):
                continue

            trace_file = raw_trace.get("trace_file")
            trace_file_error = raw_trace.get("trace_file_error")

            trace_payload = trace_file if isinstance(trace_file, dict) else {
                "elements": {
                    "nodes": [],
                    "edges": [],
                },
                "metadata": {
                    "import_error": trace_file_error or "Trace file missing in export.",
                },
            }

            trace_seq_path = self._write_trace_file(
                project_id,
                raw_trace.get("name"),
                trace_index,
                trace_payload,
            )

            trace_row = trace_repo.create_trace(
                project_id=project_id,
                name=str(raw_trace.get("name") or f"Trace {trace_index}"),
                description=raw_trace.get("description"),
                trace_seq_path=str(trace_seq_path) if trace_seq_path else None,
                total_steps=self._coerce_int(raw_trace.get("total_steps")),
                resolved_steps=self._coerce_int(raw_trace.get("resolved_steps")),
                ambiguous_steps=self._coerce_int(raw_trace.get("ambiguous_steps")),
                unresolved_steps=self._coerce_int(raw_trace.get("unresolved_steps")),
                commit=False,
            )

            micro_feature_id_map = {}
            for raw_micro in raw_trace.get("micro_features", []) or []:
                if not isinstance(raw_micro, dict):
                    continue

                components = raw_micro.get("components")
                if not isinstance(components, list):
                    components = []

                row = micro_repo.create_micro_feature(
                    project_id=project_id,
                    trace_id=trace_row.id,
                    sequence_order=self._coerce_int(raw_micro.get("sequence_order")),
                    name=str(raw_micro.get("name") or "MicroFeature"),
                    description=raw_micro.get("description"),
                    category=str(raw_micro.get("category") or "MicroFeature"),
                    components=components,
                    step_count=self._coerce_int(raw_micro.get("step_count")),
                    start_step=self._coerce_optional_int(raw_micro.get("start_step")),
                    end_step=self._coerce_optional_int(raw_micro.get("end_step")),
                    commit=False,
                )
                old_id = raw_micro.get("id")
                if old_id is not None:
                    micro_feature_id_map[old_id] = row.id

            for raw_flow in raw_trace.get("micro_feature_flows", []) or []:
                if not isinstance(raw_flow, dict):
                    continue

                source_old = raw_flow.get("source_micro_feature_id")
                target_old = raw_flow.get("target_micro_feature_id")
                if source_old not in micro_feature_id_map or target_old not in micro_feature_id_map:
                    continue

                micro_repo.create_micro_feature_flow(
                    project_id=project_id,
                    trace_id=trace_row.id,
                    source_micro_feature_id=micro_feature_id_map[source_old],
                    target_micro_feature_id=micro_feature_id_map[target_old],
                    sequence_order=self._coerce_int(raw_flow.get("sequence_order")),
                    commit=False,
                )

            cluster_id_map = {}
            cluster_links = []

            for raw_cluster in raw_trace.get("hierarchical_clusters", []) or []:
                if not isinstance(raw_cluster, dict):
                    continue

                member_ids = [
                    micro_feature_id_map.get(old_id)
                    for old_id in (raw_cluster.get("member_micro_feature_ids") or [])
                    if old_id in micro_feature_id_map
                ]

                row = micro_repo.create_hierarchical_cluster(
                    project_id=project_id,
                    trace_id=trace_row.id,
                    sequence_order=self._coerce_int(raw_cluster.get("sequence_order")),
                    hierarchy_level=self._coerce_int(raw_cluster.get("hierarchy_level")),
                    name=str(raw_cluster.get("name") or "Cluster"),
                    description=raw_cluster.get("description"),
                    member_micro_feature_ids=member_ids,
                    member_count=self._coerce_int(raw_cluster.get("member_count"), len(member_ids)),
                    start_step=self._coerce_optional_int(raw_cluster.get("start_step")),
                    end_step=self._coerce_optional_int(raw_cluster.get("end_step")),
                    parent_cluster_id=None,
                    left_child_cluster_id=None,
                    right_child_cluster_id=None,
                    commit=False,
                )

                old_cluster_id = raw_cluster.get("id")
                if old_cluster_id is not None:
                    cluster_id_map[old_cluster_id] = row.id
                    cluster_links.append((row.id, raw_cluster))

            if cluster_links:
                for new_cluster_id, raw_cluster in cluster_links:
                    cluster = (
                        db.query(TraceHierarchicalCluster)
                        .filter(TraceHierarchicalCluster.id == new_cluster_id)
                        .first()
                    )
                    if not cluster:
                        continue

                    cluster.parent_cluster_id = cluster_id_map.get(raw_cluster.get("parent_cluster_id"))
                    cluster.left_child_cluster_id = cluster_id_map.get(raw_cluster.get("left_child_cluster_id"))
                    cluster.right_child_cluster_id = cluster_id_map.get(raw_cluster.get("right_child_cluster_id"))

            created += 1

        db.commit()
        return created
    
    def process_m3_file(self, project_id: int, m3_content: dict, run_summarization: bool = True):
        with SessionLocal() as db:
            repo = GraphRepository(db)
            from app.services.summarization_service import SummarizationService
            summarization_service = SummarizationService(db)

            try:
                repo.change_project_status(project_id, "processing", "Transforming M3 Model...")

                project = repo.get_project_by_id(project_id)
                builder = SaboGraphBuilder(project.name)
                builder.process_m3(m3_content)
                lpg_data = builder.export_for_vis()

                nodes_len, edges_len = self.save_graph_data(repo, project_id, lpg_data.get("elements", {}))

                if run_summarization:
                    summarization_service.run_summarization(project_id)

                repo.change_project_status(project_id, status="ready", description=f"Imported {nodes_len} nodes and {edges_len} edges successfully.")

            except Exception as e:
                repo.change_project_status(project_id, "error", str(e)[:500])

    def ingest_lpg_file(self, project_id: int, lpg_content: dict, run_summarization: bool = True):
        with SessionLocal() as db:
            repo = GraphRepository(db)
            from app.services.summarization_service import SummarizationService
            summarization_service = SummarizationService(db)

            try:
                repo.change_project_status(project_id, "processing", "Importing JSON...")
                nodes_len, edges_len = self.save_graph_data(repo, project_id, lpg_content.get("elements", {}))
                self.save_snippets_data(project_id, lpg_content.get("snippets"))

                features_len = self.save_features_data(db, project_id, lpg_content.get("features"))
                traces_len = self.save_traces_data(db, project_id, lpg_content.get("traces"))

                if run_summarization:
                    summarization_service.run_summarization(project_id)

                summary_parts = [f"{nodes_len} nodes", f"{edges_len} edges"]
                if features_len:
                    summary_parts.append(f"{features_len} features")
                if traces_len:
                    summary_parts.append(f"{traces_len} traces")

                repo.change_project_status(
                    project_id,
                    status="ready",
                    description=f"Imported {', '.join(summary_parts)} successfully.",
                )
            
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
        
    def background_resume_task(self, project_id: int, json_path: Path, run_summarization: bool):
        try:
            with open(json_path, 'r') as f:
                content = json.load(f)
            self.process_m3_file(project_id, content, run_summarization=run_summarization)
        except Exception as e:
            with SessionLocal() as db:
                repo = GraphRepository(db)
                repo.change_project_status(project_id, "error", f"Resume Failed: {str(e)[:500]}")

    def resume_ingestion(self, project_id: int, background_tasks: BackgroundTasks, run_summarization: bool | None = None):
        from app.services.rascal_service import RascalService
        rascal_service = RascalService()

        if run_summarization is None:
            options = self.repo.get_project_ingest_options(project_id)
            run_summarization = options["run_summarization"]

        json_path = rascal_service.get_analysis_file(project_id)
        background_tasks.add_task(self.background_resume_task, project_id, json_path, run_summarization)