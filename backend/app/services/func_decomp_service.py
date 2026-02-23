import numpy as np
import re
from collections import Counter
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.cluster import AgglomerativeClustering

from app.models.feature import Feature
from app.repositories.feature_repo import FeatureRepository
from app.services.trace_service import TraceService
from app.services.graph_service import GraphService
from app.services.summarization_service import SummarizationService

class FunctionalDecompositionService:
    def __init__(self, db: Session):
        self.db = db
        self.feature_repo = FeatureRepository(db)
        self.trace_service = TraceService(db)
        self.graph_service = GraphService(db)

        self.DISTANCE_THRESHOLD = 0.4
        self.INFRASTRUCTURE_THRESHOLD = 0.3

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
        all_functions = sorted(list(set().union(*[trace["functions"] for trace in traces])))

        matrix_data = []

        for func in all_functions:
            row = []
            for trace in traces:
                row.append(1 if func in trace["functions"] else 0)
            matrix_data.append(row)

        X = np.array(matrix_data)

        return X, all_functions
    
    def frequency_filtering(self, X):
        tfidf = TfidfTransformer(norm='l2', use_idf=True, smooth_idf=True)
        X_weighted = tfidf.fit_transform(X.T).T.toarray()

        # Calculate IDF scores, Low IDF means high frequency and vice versa
        idfs = tfidf.idf_

        idf_min, idf_max = np.min(idfs), np.max(idfs)
        if idf_max - idf_min == 0:
            normalized_idfs = np.zeros(idfs.shape)
        else:
            normalized_idfs = (idfs - idf_min) / (idf_max - idf_min)

        return X_weighted, normalized_idfs
    
    def cluster_traces(self, X, distance_threshold):
        model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric='cosine',
            linkage='average'
        )
        labels = model.fit_predict(X)

        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)

        return clusters

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

    def run_functional_decomposition(self, project_id: int, distance_threshold: float, infrastructure_threshold: float):
        self.graph_service.change_project_status(
            project_id,
            status="decomposing",
            description="Functional Decomposition started..."
        )
        traces = self.load_traces(project_id)
        X, all_functions = self.build_feature_matrix(traces)
        X_weighted, idf_scores = self.frequency_filtering(X)
        clusters = self.cluster_traces(X_weighted, distance_threshold)

        self.feature_repo.delete_features_by_project(project_id)
        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {n.id: n for n in db_nodes}

        summarizer = SummarizationService(self.db)
        is_llm_enabled = summarizer.llm.is_enabled
        
        for label, indices in clusters.items():
            avg_score = np.mean(idf_scores[indices])
            is_infrastructure = avg_score < infrastructure_threshold

            components = [all_functions[idx] for idx in indices]

            linked_nodes = []
            for uri in components:
                linked_nodes.append(node_lookup[uri])

            feature_description = None
            if is_infrastructure:
                category = "Infrastructure"
                default_name = "Common Utilities"
            else:
                category = "Feature"
                default_name = f"Feature_{self.generate_feature_name(components)}"

            if is_llm_enabled and linked_nodes:
                internal_edges = self.graph_service.get_edges_between_nodes(components)
                ai_result = summarizer.prompt_feature(linked_nodes, internal_edges)
                feature_name = ai_result.get("feature_name", default_name)
                feature_description = ai_result.get("description", None)
            else:
                feature_name = default_name

            feature = Feature(
                project_id=project_id,
                name=feature_name,
                description=feature_description,
                category=category,
                score=float(avg_score)
            )
            feature.nodes = linked_nodes

            self.feature_repo.create_feature_without_commit(feature)
        
        self.feature_repo.commit()

        self.graph_service.change_project_status(
            project_id,
            status="ready",
            description="Functional Decomposition successfully completed."
        )

    def get_features(self, project_id: int):
        return self.feature_repo.get_features_by_project(project_id)