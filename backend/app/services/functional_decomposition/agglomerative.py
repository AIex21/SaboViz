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

    def _cluster_traces(self, X: np.ndarray, distance_threshold: float):
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

    def run(
        self,
        project_id: int,
        X: np.ndarray,
        all_functions,
        summarizer,
        allow_ai: bool,
        node_lookup,
        distance_threshold: float,
        infrastructure_threshold: float,
    ):
        X_weighted, idf_scores = self._frequency_filtering(X)
        clusters = self._cluster_traces(X_weighted, distance_threshold)

        self.service.init_decomposition_progress(len(clusters), allow_ai)

        for _, indices in clusters.items():
            avg_score = float(np.mean(idf_scores[indices]))
            is_infrastructure = avg_score < infrastructure_threshold
            components = [all_functions[idx] for idx in indices]

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
