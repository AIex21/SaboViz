import re
from collections import Counter
from typing import Any, Optional

import numpy as np
from sqlalchemy.orm import Session

from app.models.feature import Feature
from app.repositories.feature_repo import FeatureRepository
from app.repositories.micro_features_repo import MicroFeaturesRepository
from app.services.graph_service import GraphService
from app.services.summarization_service import SummarizationService
from app.services.trace_service import TraceService
from .functional_decomposition.agglomerative import AgglomerativeDecomposition
from .functional_decomposition.graph_community import GraphCommunityDecomposition
from .functional_decomposition.trace_decomp import TraceDecomposition


class FunctionalDecompositionService:
    def __init__(self, db: Session):
        self.db = db
        self.feature_repo = FeatureRepository(db)
        self.micro_features_repo = MicroFeaturesRepository(db)
        self.trace_service = TraceService(db)
        self.graph_service = GraphService(db)

        self.DISTANCE_THRESHOLD = 0.4
        self.INFRASTRUCTURE_THRESHOLD = 0.3
        self.OVERLAP_ALPHA = 0.8
        self.MIN_COEXEC_WEIGHT = 0.2
        self.LEIDEN_RESOLUTION = 1.8
        self.DECOMP_METHOD_AGGLOMERATIVE = "agglomerative"
        self.DECOMP_METHOD_GRAPH_COMMUNITY = "graph_community"

        self.trace_decomposition = TraceDecomposition(self.graph_service)
        self.agglomerative_decomposition = AgglomerativeDecomposition(self)
        self.graph_community_decomposition = GraphCommunityDecomposition(self)

        self.decomp_project_id: Optional[int] = None
        self.decomp_total = 0
        self.decomp_done = 0
        self.decomp_mode = "persist"

        self.trace_project_id: Optional[int] = None
        self.trace_total = 0
        self.trace_done = 0
        self.trace_label: Optional[str] = None
        self.trace_mode = "persist"

    def _reset_decomposition_progress(self, project_id: int):
        self.decomp_project_id = project_id
        self.decomp_total = 0
        self.decomp_done = 0
        self.decomp_mode = "persist"

    def _set_decomposition_status(self, description: str):
        if self.decomp_project_id is None:
            return

        self.graph_service.change_project_status(
            self.decomp_project_id,
            status="decomposing",
            description=description,
        )

    def init_decomposition_progress(self, total: int, allow_ai: bool):
        if self.decomp_project_id is None:
            return

        self.decomp_total = max(int(total or 0), 0)
        self.decomp_done = 0
        self.decomp_mode = "ai" if allow_ai else "persist"

        if self.decomp_total > 0:
            self._update_decomposition_progress()

    def increment_decomposition_progress(self, feature_name: Optional[str] = None):
        if self.decomp_project_id is None or self.decomp_total <= 0:
            return

        self.decomp_done = min(self.decomp_done + 1, self.decomp_total)
        self._update_decomposition_progress(feature_name)

    def _update_decomposition_progress(self, feature_name: Optional[str] = None):
        if self.decomp_project_id is None or self.decomp_total <= 0:
            return

        percent = int((self.decomp_done / self.decomp_total) * 100)
        prefix = "Summarizing features" if self.decomp_mode == "ai" else "Persisting features"
        message = f"{prefix} {self.decomp_done}/{self.decomp_total} ({percent}%)"

        if feature_name:
            message = f"{message} - {feature_name}"

        self.graph_service.change_project_status(
            self.decomp_project_id,
            status="decomposing",
            description=message,
        )

    def _reset_trace_progress(self, project_id: int):
        self.trace_project_id = project_id
        self.trace_total = 0
        self.trace_done = 0
        self.trace_label = None
        self.trace_mode = "persist"

    def _set_trace_status(self, description: str):
        if self.trace_project_id is None:
            return

        self.graph_service.change_project_status(
            self.trace_project_id,
            status="decomposing",
            description=description,
        )

    def _update_trace_progress(
        self,
        phase: str,
        done: int,
        total: Optional[int],
        trace_label: Optional[str],
        segment_name: Optional[str],
        allow_ai: bool,
        trace_index: Optional[int] = None,
        total_traces: Optional[int] = None,
    ):
        if self.trace_project_id is None:
            return

        if total is not None and total > 0:
            self.trace_total = int(total)
            self.trace_done = max(0, min(int(done), self.trace_total))
        else:
            self.trace_total = 0
            self.trace_done = max(0, int(done))
        self.trace_mode = "ai" if allow_ai else "persist"

        if trace_label:
            self.trace_label = trace_label

        if phase == "hierarchical":
            prefix = "Merge summaries" if self.trace_mode == "ai" else "Merge processing"
        else:
            prefix = "Segment summaries" if self.trace_mode == "ai" else "Segment processing"
        trace_prefix = ""
        if trace_index is not None and total_traces is not None:
            trace_prefix = f"Trace {trace_index}/{total_traces}: "

        if self.trace_total > 0:
            percent = int((self.trace_done / self.trace_total) * 100)
            message = f"{trace_prefix}{prefix} {self.trace_done}/{self.trace_total} ({percent}%)"
        else:
            message = f"{trace_prefix}{prefix} {self.trace_done}"

        if not trace_prefix and self.trace_label:
            message = f"{message} - {self.trace_label}"

        if segment_name:
            message = f"{message} - {segment_name}"

        self.graph_service.change_project_status(
            self.trace_project_id,
            status="decomposing",
            description=message,
        )

    def load_traces(self, project_id: int):
        traces = self.trace_service.get_project_traces(project_id)

        trace_data = []
        for trace in traces:
            data = self.trace_service.get_trace_file(trace.id)

            elements = data.get("elements", {})
            nodes = elements.get("nodes", [])

            executed_functions = set()
            for node in nodes:
                node_data = node.get("data", {})
                labels = node_data.get("labels", [])

                if "Action" in labels:
                    node_prop = node_data.get("properties", {})

                    source_id = node_prop.get("sourceId")
                    if source_id:
                        executed_functions.add(source_id)

                    target_id = node_prop.get("targetId")
                    if target_id:
                        executed_functions.add(target_id)

            if executed_functions:
                trace_data.append({
                    "trace_id": trace.id,
                    "functions": executed_functions,
                })

        return trace_data

    def build_feature_matrix(self, traces):
        if not traces:
            return np.array([]), []

        all_functions = sorted(list(set().union(*[trace["functions"] for trace in traces])))

        matrix_data = []
        for func in all_functions:
            row = []
            for trace in traces:
                row.append(1 if func in trace["functions"] else 0)
            matrix_data.append(row)

        X = np.array(matrix_data)
        return X, all_functions

    def collect_nodes_with_ancestors(self, components, node_lookup):
        selected_by_db_id = {}

        for node_id in components:
            node = node_lookup.get(node_id)
            if not node:
                continue

            selected_by_db_id[node.db_id] = node

            for ancestor_id in (node.ancestors or []):
                ancestor = node_lookup.get(ancestor_id)
                if ancestor:
                    selected_by_db_id[ancestor.db_id] = ancestor

            if node.parent_id:
                parent = node_lookup.get(node.parent_id)
                if parent:
                    selected_by_db_id[parent.db_id] = parent

        return list(selected_by_db_id.values())

    def persist_feature(
        self,
        project_id,
        components,
        category,
        default_name,
        summarizer,
        allow_ai,
        node_lookup,
        score=0.0,
    ):
        linked_nodes = self.collect_nodes_with_ancestors(components, node_lookup)
        if not linked_nodes:
            return

        feature_description = None
        feature_name = default_name

        if allow_ai:
            internal_edges = self.graph_service.get_edges_between_nodes(components)
            ai_result = summarizer.prompt_feature(
                linked_nodes,
                internal_edges,
                category == "Infrastructure",
            )
            feature_name = ai_result.get("feature_name", default_name)
            feature_description = ai_result.get("description", None)

        feature = Feature(
            project_id=project_id,
            name=feature_name,
            description=feature_description,
            category=category,
            score=float(score),
        )
        feature.nodes = linked_nodes
        self.feature_repo.create_feature_without_commit(feature)

        self.increment_decomposition_progress(feature_name)

    def generate_feature_name(self, components):
        words = []

        for uri in components:
            clean_name = uri.split(":///")[-1].split("(")[0]
            parts = clean_name.replace("/", " ").replace("::", " ").replace("_", " ").split()

            for part in parts:
                sub_parts = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)", part)

                if not sub_parts:
                    sub_parts = [part]

                for word in sub_parts:
                    words.append(word.capitalize())

        if not words:
            return "Feature_Unknown"

        counter = Counter(words)
        most_common = counter.most_common(2)

        return "_".join([word for word, _ in most_common])

    def run_functional_decomposition(
        self,
        project_id: int,
        distance_threshold: float = 0.4,
        infrastructure_threshold: float = 0.3,
        use_ai: bool = True,
        decomposition_method: str = "agglomerative",
        overlap_alpha: float = 0.8,
        leiden_resolution: float = 1.8,
    ):
        self.graph_service.change_project_status(
            project_id,
            status="decomposing",
            description="Functional Decomposition: Preprocessing traces...",
        )

        self._reset_decomposition_progress(project_id)

        traces = self.load_traces(project_id)
        self.feature_repo.delete_features_by_project(project_id)

        if not traces:
            self.graph_service.change_project_status(
                project_id,
                status="ready",
                description="Functional Decomposition completed. No traces with executable operations were found.",
            )
            return

        self._set_decomposition_status("Functional Decomposition: Building feature matrix...")
        X, all_functions = self.build_feature_matrix(traces)

        summarizer = SummarizationService(self.db)
        is_llm_enabled = summarizer.llm.is_enabled
        allow_ai = use_ai and is_llm_enabled
        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {n.id: n for n in db_nodes}

        method = (decomposition_method or self.DECOMP_METHOD_AGGLOMERATIVE).strip().lower()

        self._set_decomposition_status("Functional Decomposition: Clustering functions...")

        if method == self.DECOMP_METHOD_GRAPH_COMMUNITY:
            self.graph_community_decomposition.run(
                project_id=project_id,
                traces=traces,
                X=X,
                all_functions=all_functions,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
                overlap_alpha=overlap_alpha,
                leiden_resolution=leiden_resolution,
            )
        elif method == self.DECOMP_METHOD_AGGLOMERATIVE:
            self.agglomerative_decomposition.run(
                project_id=project_id,
                X=X,
                all_functions=all_functions,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
                distance_threshold=distance_threshold,
                infrastructure_threshold=infrastructure_threshold,
            )
        else:
            raise ValueError(
                f"Unsupported decomposition_method '{decomposition_method}'. "
                f"Use '{self.DECOMP_METHOD_AGGLOMERATIVE}' or '{self.DECOMP_METHOD_GRAPH_COMMUNITY}'."
            )

        self.feature_repo.commit()

        self.graph_service.change_project_status(
            project_id,
            status="ready",
            description="Functional Decomposition successfully completed.",
        )

    def run_trace_decomposition(
        self,
        project_id: int,
        use_ai: bool = True,
        pelt_penalty: float | None = None,
        distance_threshold: float = 0.5,
    ):
        self.graph_service.change_project_status(
            project_id,
            status="decomposing",
            description="Trace Decomposition: Preprocessing trace data...",
        )

        self._reset_trace_progress(project_id)

        traces = self.trace_service.get_project_traces(project_id)
        self.micro_features_repo.clear_project_decomposition(project_id, commit=True)

        if not traces:
            self.graph_service.change_project_status(
                project_id,
                status="ready",
                description="Trace Decomposition completed. No traces with executable operations were found.",
            )
            return

        summarizer = SummarizationService(self.db)
        allow_ai = use_ai and summarizer.llm.is_enabled
        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {n.id: n for n in db_nodes}

        self._set_trace_status("Trace Decomposition: Decomposing traces...")
        self._save_project_trace_decomposition(
            project_id=project_id,
            summarizer=summarizer,
            allow_ai=allow_ai,
            node_lookup=node_lookup,
            pelt_penalty=pelt_penalty,
            distance_threshold=distance_threshold,
        )

        self.db.commit()

        self.graph_service.change_project_status(
            project_id,
            status="ready",
            description="Trace Decomposition successfully completed.",
        )

    def decompose_traces(self, project_id: int, use_ai: bool = True, pelt_penalty: float | None = None, distance_threshold: float = 0.5):
        traces = self.trace_service.get_project_traces(project_id)

        segments_per_trace = {}

        summarizer = SummarizationService(self.db)
        allow_ai = use_ai and summarizer.llm.is_enabled

        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {node.id: node for node in db_nodes}

        for trace in traces:
            trace_data = self.trace_service.get_trace_file(trace.id)
            segments_per_trace[trace.name] = self.trace_decomposition.decompose_trace(
                trace_data=trace_data,
                project_id=project_id,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
                collect_nodes_with_ancestors=self.collect_nodes_with_ancestors,
                pelt_penalty=pelt_penalty,
                distance_threshold=distance_threshold,
            )

        return segments_per_trace

    def get_trace_micro_features(self, trace_id: int):
        return self.micro_features_repo.get_micro_features_by_trace(trace_id)

    def get_trace_execution_flow(self, trace_id: int):
        return {
            "trace_id": trace_id,
            "micro_features": self.micro_features_repo.get_micro_features_by_trace(trace_id),
            "flow_edges": self.micro_features_repo.get_micro_feature_flows_by_trace(trace_id),
            "hierarchical_clusters": self.micro_features_repo.get_hierarchical_clusters_by_trace(trace_id),
        }

    def get_features(self, project_id: int):
        return self.feature_repo.get_features_by_project(project_id)

    def _save_project_trace_decomposition(
        self,
        project_id: int,
        summarizer,
        allow_ai: bool,
        node_lookup,
        pelt_penalty: float | None = None,
        distance_threshold: float = 0.5,
    ):
        traces = self.trace_service.get_project_traces(project_id)

        total_traces = len(traces)

        for index, trace in enumerate(traces, start=1):
            trace_label = trace.name or f"Trace_{trace.id}"
            self._set_trace_status(
                f"Decomposing trace {index}/{total_traces} - {trace_label}"
            )

            def progress_callback(
                phase: str,
                done: int,
                total: Optional[int],
                segment_name: Optional[str] = None,
                trace_label_snapshot: str = trace_label,
                trace_index_snapshot: int = index,
                trace_total_snapshot: int = total_traces,
            ):
                self._update_trace_progress(
                    phase=phase,
                    done=done,
                    total=total,
                    trace_label=trace_label_snapshot,
                    segment_name=segment_name,
                    allow_ai=allow_ai,
                    trace_index=trace_index_snapshot,
                    total_traces=trace_total_snapshot,
                )

            trace_data = self.trace_service.get_trace_file(trace.id)
            decomposition_result = self.trace_decomposition.decompose_trace(
                trace_data=trace_data,
                project_id=project_id,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
                collect_nodes_with_ancestors=self.collect_nodes_with_ancestors,
                progress_callback=progress_callback,
                pelt_penalty=pelt_penalty,
                distance_threshold=distance_threshold,
            )
            micro_segments = decomposition_result.get("micro_segments", [])
            hierarchical_clusters = decomposition_result.get("hierarchical_clusters", [])
            self._persist_trace_decomposition(
                project_id,
                trace.id,
                micro_segments,
                hierarchical_clusters,
            )

    def _persist_trace_decomposition(
        self,
        project_id: int,
        trace_id: int,
        micro_segments,
        hierarchical_clusters,
    ):
        persisted = []
        persisted_by_segment_index = {}

        for segment in micro_segments:
            segment_steps = segment.get("steps", [])
            components = segment.get("components", [])
            step_numbers = self.trace_decomposition.extract_step_numbers(segment_steps)

            start_step = min(step_numbers) if step_numbers else None
            end_step = max(step_numbers) if step_numbers else None

            persisted_row = self.micro_features_repo.create_micro_feature(
                project_id=project_id,
                trace_id=trace_id,
                sequence_order=int(segment.get("segmentIndex", len(persisted) + 1)),
                name=str(segment.get("name") or f"Segment_{len(persisted) + 1}"),
                description=segment.get("description"),
                category="MicroFeature",
                components=components,
                step_count=len(segment_steps),
                start_step=start_step,
                end_step=end_step,
                commit=False,
            )
            persisted.append(persisted_row)

            segment_index = int(segment.get("segmentIndex", len(persisted)))
            persisted_by_segment_index[segment_index] = persisted_row

        for index in range(len(persisted) - 1):
            self.micro_features_repo.create_micro_feature_flow(
                project_id=project_id,
                trace_id=trace_id,
                source_micro_feature_id=persisted[index].id,
                target_micro_feature_id=persisted[index + 1].id,
                sequence_order=index + 1,
                commit=False,
            )

        if hierarchical_clusters:
            self._persist_hierarchical_clusters(
                project_id=project_id,
                trace_id=trace_id,
                hierarchical_clusters=hierarchical_clusters,
                persisted_by_segment_index=persisted_by_segment_index,
            )

    def _persist_hierarchical_clusters(
        self,
        project_id: int,
        trace_id: int,
        hierarchical_clusters,
        persisted_by_segment_index,
    ):
        sequence_order = 0

        def persist_cluster(cluster: dict[str, Any], parent_cluster_id: int | None = None) -> tuple[int, int]:
            nonlocal sequence_order
            sequence_order += 1

            member_ids = self._resolve_member_micro_feature_ids(
                cluster,
                persisted_by_segment_index,
            )

            ordered_members = [
                persisted_by_segment_index[index]
                for index in sorted(persisted_by_segment_index.keys())
                if persisted_by_segment_index[index].id in member_ids
            ]

            start_candidates = [row.start_step for row in ordered_members if row.start_step is not None]
            end_candidates = [row.end_step for row in ordered_members if row.end_step is not None]

            row = self.micro_features_repo.create_hierarchical_cluster(
                project_id=project_id,
                trace_id=trace_id,
                sequence_order=sequence_order,
                hierarchy_level=0,
                name=str(cluster.get("name") or f"Cluster_{sequence_order}"),
                description=cluster.get("description"),
                member_micro_feature_ids=member_ids,
                member_count=len(member_ids),
                start_step=min(start_candidates) if start_candidates else None,
                end_step=max(end_candidates) if end_candidates else None,
                parent_cluster_id=parent_cluster_id,
                commit=False,
            )

            child_ids = []
            child_levels = []
            for child in cluster.get("children", []):
                child_id, child_level = persist_cluster(child, parent_cluster_id=row.id)
                child_ids.append(child_id)
                child_levels.append(child_level)

            if child_ids:
                row.left_child_cluster_id = child_ids[0]
                row.right_child_cluster_id = child_ids[1] if len(child_ids) > 1 else None
                row.hierarchy_level = max(child_levels) + 1
                self.db.flush()

            return row.id, row.hierarchy_level

        for cluster in hierarchical_clusters:
            if isinstance(cluster, dict):
                persist_cluster(cluster)

    def _resolve_member_micro_feature_ids(self, cluster, persisted_by_segment_index) -> list[int]:
        member_ids = []

        for segment_index in cluster.get("segmentIndexes", []):
            if not isinstance(segment_index, int):
                continue

            row = persisted_by_segment_index.get(segment_index)
            if row:
                member_ids.append(row.id)

        return sorted(set(member_ids))
