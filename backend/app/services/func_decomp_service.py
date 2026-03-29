import numpy as np
import re
from collections import Counter
from sqlalchemy.orm import Session

from app.models.feature import Feature
from app.repositories.feature_repo import FeatureRepository
from app.services.trace_service import TraceService
from app.services.graph_service import GraphService
from app.services.summarization_service import SummarizationService
from .functional_decomposition.agglomerative import AgglomerativeDecomposition
from .functional_decomposition.graph_community import GraphCommunityDecomposition

class FunctionalDecompositionService:
    def __init__(self, db: Session):
        self.db = db
        self.feature_repo = FeatureRepository(db)
        self.trace_service = TraceService(db)
        self.graph_service = GraphService(db)

        self.DISTANCE_THRESHOLD = 0.4
        self.INFRASTRUCTURE_THRESHOLD = 0.3
        self.OVERLAP_ALPHA = 0.8
        self.MIN_COEXEC_WEIGHT = 0.2
        self.LEIDEN_RESOLUTION = 1.8
        self.DECOMP_METHOD_AGGLOMERATIVE = "agglomerative"
        self.DECOMP_METHOD_GRAPH_COMMUNITY = "graph_community"

        self.agglomerative_decomposition = AgglomerativeDecomposition(self)
        self.graph_community_decomposition = GraphCommunityDecomposition(self)

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

                    sourceId = node_prop.get("sourceId")
                    if sourceId:
                        executed_functions.add(sourceId)

                    targetId = node_prop.get("targetId")
                    if targetId:
                        executed_functions.add(targetId)
            
            if executed_functions:
                trace_data.append({
                    "trace_id": trace.id,
                    "functions": executed_functions
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

            # Propagate feature membership to logical parents/scopes.
            for ancestor_id in (node.ancestors or []):
                ancestor = node_lookup.get(ancestor_id)
                if ancestor:
                    selected_by_db_id[ancestor.db_id] = ancestor

            if node.parent_id:
                parent = node_lookup.get(node.parent_id)
                if parent:
                    selected_by_db_id[parent.db_id] = parent

        return list(selected_by_db_id.values())

    def persist_feature(self, project_id, components, category, default_name, summarizer, allow_ai, node_lookup, score=0.0):
        linked_nodes = self.collect_nodes_with_ancestors(components, node_lookup)
        if not linked_nodes:
            return

        feature_description = None
        feature_name = default_name

        if allow_ai:
            internal_edges = self.graph_service.get_edges_between_nodes(components)
            ai_result = summarizer.prompt_feature(linked_nodes, internal_edges, category == "Infrastructure")
            feature_name = ai_result.get("feature_name", default_name)
            feature_description = ai_result.get("description", None)

        feature = Feature(
            project_id=project_id,
            name=feature_name,
            description=feature_description,
            category=category,
            score=float(score)
        )
        feature.nodes = linked_nodes
        self.feature_repo.create_feature_without_commit(feature)

    def generate_feature_name(self, components):
        words = []

        for uri in components:
            # Remove "cpp+method:///" and the parameters
            clean_name = uri.split(':///')[-1].split('(')[0]

            # Split into parts (Class/Method)
            parts = clean_name.replace('/', ' ').replace('::', ' ').replace('_', ' ').split()

            for part in parts:
                # Split camel case
                sub_parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)', part)

                if not sub_parts:
                    sub_parts = [part]

                for word in sub_parts:
                    words.append(word.capitalize())

        if not words:
            return "Feature_Unknown"
        
        counter = Counter(words)
        most_common = counter.most_common(2)

        name = "_".join([word for word, count in most_common])
        
        return name

    def run_functional_decomposition(
        self,
        project_id: int,
        distance_threshold: float = 0.4,
        infrastructure_threshold: float = 0.3,
        use_ai: bool = True,
        decomposition_method: str = "agglomerative",
        overlap_alpha: float = 0.8,
        leiden_resolution: float = 1.8
    ):
        self.graph_service.change_project_status(
            project_id,
            status="decomposing",
            description="Functional Decomposition started..."
        )

        traces = self.load_traces(project_id)
        if not traces:
            self.feature_repo.delete_features_by_project(project_id)
            self.graph_service.change_project_status(
                project_id,
                status="ready",
                description="Functional Decomposition completed. No traces with executable operations were found."
            )
            return

        X, all_functions = self.build_feature_matrix(traces)
        self.feature_repo.delete_features_by_project(project_id)

        summarizer = SummarizationService(self.db)
        is_llm_enabled = summarizer.llm.is_enabled
        allow_ai = use_ai and is_llm_enabled
        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {n.id: n for n in db_nodes}

        method = (decomposition_method or self.DECOMP_METHOD_AGGLOMERATIVE).strip().lower()

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
            description="Functional Decomposition successfully completed."
        )

    def get_features(self, project_id: int):
        return self.feature_repo.get_features_by_project(project_id)