from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfTransformer

if TYPE_CHECKING:
    from app.services.func_decomp_service import FunctionalDecompositionService


class AgglomerativeDecomposition:
    def __init__(self, service: "FunctionalDecompositionService"):
        self.service = service

    def _frequency_filtering(self, X: np.ndarray):
        # TF-IDF down-weights very common functions and highlights trace-specific functions.
        tfidf = TfidfTransformer(norm="l2", use_idf=True, smooth_idf=True)
        X_weighted = tfidf.fit_transform(X.T).T.toarray()

        idfs = tfidf.idf_
        idf_min, idf_max = np.min(idfs), np.max(idfs)
        if idf_max - idf_min == 0:
            normalized_idfs = np.zeros(idfs.shape)
        else:
            normalized_idfs = (idfs - idf_min) / (idf_max - idf_min)

        return X_weighted, normalized_idfs

    def _cluster_traces(self, X: np.ndarray):
        if X.size == 0:
            return {}
        
        function_count = X.shape[0]

        if function_count == 1:
            return {0: [0]}
        
        distance_threshold = self._automatic_distance_threshold(X)

        # Hierarchical clustering groups functions that appear in similar traces.
        model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric="cosine",
            linkage="average",
        )
        labels = model.fit_predict(X)

        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)

        return clusters
    
    def _automatic_distance_threshold(self, X: np.ndarray) -> float:
        # Build the full hierarchy once, inspect the merge distances, and cut before the largest meaningful jump.
        function_count = X.shape[0]

        if function_count <= 1:
            return 0.0
        
        if function_count == 2:
            return 0.5
        
        full_model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=0.0,
            metric="cosine",
            linkage="average",
            compute_distances=True,
        )

        full_model.fit(X)

        distances = np.asarray(full_model.distances_, dtype=float)
        distances = distances[np.isfinite(distances)]

        if len(distances) == 0:
            return 0.5
        
        distances = np.sort(distances)

        if len(distances) == 1:
            return float(max(1e-6, distances[0]))
        
        gaps = np.diff(distances)

        if len(gaps) == 0 or np.max(gaps) <= 0.0:
            return float(np.percentile(distances, 75))
        
        best_gap_index = int(np.argmax(gaps))

        left_distance = distances[best_gap_index]
        right_distance = distances[best_gap_index + 1]

        threshold = (left_distance + right_distance) / 2.0

        return float(max(1e-6, threshold))
    
    def _automatic_infrastructure_threshold(self, cluster_scores):
        # Low average IDF scores indicate functions that are common across many traces, suggesting they are likely infrastructure.
        scores = np.asarray(cluster_scores, dtype=float)
        scores = scores[np.isfinite(scores)]

        if len(scores) < 3:
            return None
        
        score_min = float(np.min(scores))
        score_max = float(np.max(scores))

        if score_max - score_min < 0.05:
            return None
        
        sorted_scores = np.sort(scores)
        gaps = np.diff(sorted_scores)

        if len(gaps) == 0:
            return None
        
        max_candidate_index = max(1, int(len(gaps) * 0.6))
        candidate_gaps = gaps[:max_candidate_index]

        best_gap_index = int(np.argmax(candidate_gaps))
        best_gap = float(candidate_gaps[best_gap_index])

        median_gap = float(np.median(gaps)) if len(gaps) > 0 else 0.0
        required_gap = max(0.05, 2.0 * median_gap)

        if best_gap < required_gap:
            return None
        
        threshold = (sorted_scores[best_gap_index] + sorted_scores[best_gap_index + 1]) / 2.0

        if threshold > 0.5:
            return None
        
        return float(threshold)

    def run(
        self,
        project_id: int,
        X: np.ndarray,
        all_functions,
        summarizer,
        allow_ai: bool,
        node_lookup
    ):
        X_weighted, idf_scores = self._frequency_filtering(X)
        clusters = self._cluster_traces(X_weighted)

        cluster_items = []

        for _, indices in clusters.items():
            avg_score = float(np.mean(idf_scores[indices]))
            components = [all_functions[index] for index in indices]

            cluster_items.append({
                "indices": indices,
                "avg_score": avg_score,
                "components": components,
            })

        infrastructure_threshold = self._automatic_infrastructure_threshold([item["avg_score"] for item in cluster_items])

        self.service.init_decomposition_progress(len(clusters), allow_ai)

        for item in cluster_items:
            avg_score = item["avg_score"]
            components = item["components"]

            is_infrastructure = (
                infrastructure_threshold is not None
                and avg_score <= infrastructure_threshold
            )

            if is_infrastructure:
                category = "Infrastructure"
                default_name = "Common Utilities"
            else:
                category = "Feature"
                default_name = f"Feature_{self.service.generate_feature_name(components)}"

            self.service.persist_feature(
                project_id=project_id,
                components=components,
                category=category,
                default_name=default_name,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
                score=avg_score,
            )
