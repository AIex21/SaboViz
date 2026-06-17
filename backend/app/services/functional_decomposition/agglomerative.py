from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.metrics import silhouette_score

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
        
        if function_count == 2:
            distance = self._cosine_distance(X[0], X[1])
            if distance >= 0.55:
                return {0: [0], 1: [1]}
            return {0: [0, 1]}
        
        partitions, merge_distances = self._build_full_hierarchy(X)

        selected_partition = self._select_best_partition(
            X=X,
            partitions=partitions,
            merge_distances=merge_distances,
        )

        selected_partition = self._merge_weak_singletons(X, selected_partition)

        return {
            label: sorted(indices)
            for label, indices in enumerate(selected_partition)
            if indices
        }
    
    def _build_full_hierarchy(self, X: np.ndarray):
        function_count = X.shape[0]

        model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=0.0,
            metric="cosine",
            linkage="average",
            compute_distances=True,
        )

        model.fit(X)

        cluster_members = {
            index: [index]
            for index in range(function_count)
        }

        active_cluster_ids = list(range(function_count))

        partitions = [
            self._snapshot_partition(active_cluster_ids, cluster_members)
        ]

        merge_distances = np.asarray(model.distances_, dtype=float)

        for merge_index, children in enumerate(model.children_):
            left_id = int(children[0])
            right_id = int(children[1])
            new_id = function_count + merge_index

            merged_members = (
                cluster_members[left_id]
                + cluster_members[right_id]
            )

            cluster_members[new_id] = merged_members

            active_cluster_ids = [
                cluster_id
                for cluster_id in active_cluster_ids
                if cluster_id not in {left_id, right_id}
            ]
            active_cluster_ids.append(new_id)

            partitions.append(
                self._snapshot_partition(active_cluster_ids, cluster_members)
            )

        return partitions, merge_distances
    
    def _snapshot_partition(self, active_cluster_ids, cluster_members):
        return [
            sorted(cluster_members[cluster_id])
            for cluster_id in sorted(
                active_cluster_ids,
                key=lambda cluster_id: min(cluster_members[cluster_id])
            )
        ]
    
    def _select_best_partition(self, X, partitions, merge_distances):
        if not partitions:
            return []
        
        if len(partitions) == 1:
            return partitions[0]
        
        function_count = X.shape[0]

        best_partition = partitions[-1]
        best_score = float("-inf")

        for partition_index, partition in enumerate(partitions):
            cluster_count = len(partition)

            silhouette = self._partition_silhouette(X, partition)
            cohesion = self._partition_cohesion(X, partition)
            separation = self._partition_separation(X, partition)
            merge_jump = self._partition_merge_jump(partition_index, merge_distances)

            complexity_penalty = self._complexity_penalty(
                cluster_count=cluster_count,
                function_count=function_count,
            )

            singleton_penalty = self._singleton_penalty(partition)

            score = (
                0.30 * silhouette
                + 0.25 * cohesion
                + 0.20 * separation
                + 0.15 * merge_jump
                - 0.20 * complexity_penalty
                - 0.25 * singleton_penalty
            )

            if cluster_count == function_count and function_count > 2:
                score -= 0.20

            if score > best_score:
                best_score = score
                best_partition = partition

        return best_partition
    
    def _partition_silhouette(self, X, partition):
        labels = self._labels_from_partition(X.shape[0], partition)
        cluster_count = len(set(labels))

        if cluster_count <= 1:
            return 0.0

        if cluster_count >= X.shape[0]:
            return 0.0

        try:
            raw_score = silhouette_score(X, labels, metric="cosine")
        except ValueError:
            return 0.0

        # Convert from [-1, 1] to [0, 1].
        return float((raw_score + 1.0) / 2.0)
    
    def _labels_from_partition(self, function_count, partition):
        labels = np.zeros(function_count, dtype=int)

        for label, cluster in enumerate(partition):
            for index in cluster:
                labels[index] = label

        return labels
    
    def _partition_cohesion(self, X, partition):
        dispersion = self._partition_internal_dispersion(X, partition)
        return float(max(0.0, min(1.0, 1.0 - dispersion)))
    
    def _partition_internal_dispersion(self, X, partition):
        if not partition:
            return 0.0

        total_weight = 0.0
        weighted_dispersion = 0.0

        for cluster in partition:
            if not cluster:
                continue

            weight = len(cluster)
            dispersion = self._cluster_internal_dispersion(X, cluster)

            weighted_dispersion += weight * dispersion
            total_weight += weight

        if total_weight == 0.0:
            return 0.0

        return float(weighted_dispersion / total_weight)
    
    def _cluster_internal_dispersion(self, X, cluster):
        if len(cluster) <= 1:
            return 0.0

        vectors = X[cluster]
        centroid = np.mean(vectors, axis=0)

        distances = [
            self._cosine_distance(vector, centroid)
            for vector in vectors
        ]

        if not distances:
            return 0.0

        return float(sum(distances) / len(distances))
    
    def _partition_separation(self, X, partition):
        if len(partition) <= 1:
            return 0.0

        centroids = [
            np.mean(X[cluster], axis=0)
            for cluster in partition
            if cluster
        ]

        if len(centroids) <= 1:
            return 0.0

        nearest_distances = []

        for index, centroid in enumerate(centroids):
            distances = []

            for other_index, other_centroid in enumerate(centroids):
                if index == other_index:
                    continue

                distances.append(
                    self._cosine_distance(centroid, other_centroid)
                )

            if distances:
                nearest_distances.append(min(distances))

        if not nearest_distances:
            return 0.0

        mean_nearest = float(np.mean(nearest_distances))
        min_nearest = float(np.min(nearest_distances))

        # Mean nearest rewards generally well-separated clusters.
        # Min nearest prevents one pair of almost-identical clusters from being ignored.
        return 0.70 * mean_nearest + 0.30 * min_nearest
    
    def _partition_merge_jump(self, partition_index, merge_distances):
        if merge_distances is None or len(merge_distances) == 0:
            return 0.0

        if partition_index <= 0:
            return 0.0

        if partition_index >= len(merge_distances):
            return 0.0

        next_distance = float(merge_distances[partition_index])
        previous_distances = np.asarray(merge_distances[:partition_index], dtype=float)

        if previous_distances.size == 0:
            return 0.0

        previous_reference = float(np.median(previous_distances))

        distance_min = float(np.min(merge_distances))
        distance_max = float(np.max(merge_distances))
        distance_range = distance_max - distance_min

        if distance_range <= 0.0:
            return 0.0

        jump = max(0.0, next_distance - previous_reference)

        return float(min(1.0, jump / distance_range))
    
    def _complexity_penalty(self, cluster_count, function_count):
        if function_count <= 1:
            return 0.0

        if cluster_count <= 1:
            return 0.0

        return float((cluster_count - 1) / max(1, function_count - 1))
    
    def _singleton_penalty(self, partition):
        if not partition:
            return 0.0

        singleton_count = sum(
            1
            for cluster in partition
            if len(cluster) == 1
        )

        return float(singleton_count / len(partition))
    
    def _merge_weak_singletons(
            self,
            X,
            partition,
            min_isolation=0.65,
            min_support=2,
    ):
        clusters = [
            list(cluster)
            for cluster in partition
            if cluster
        ]

        if len(clusters) <= 1:
            return clusters

        changed = True

        while changed and len(clusters) > 1:
            changed = False

            for cluster_index, cluster in enumerate(list(clusters)):
                if len(cluster) != 1:
                    continue

                function_index = cluster[0]
                support = int(np.count_nonzero(X[function_index] > 0.0))

                nearest_index, nearest_distance = self._nearest_cluster(
                    X,
                    clusters,
                    cluster_index,
                )

                if nearest_index is None:
                    continue

                # Keep a singleton only if it has enough evidence and is clearly isolated.
                if support >= min_support and nearest_distance >= min_isolation:
                    continue

                clusters[nearest_index].extend(cluster)
                del clusters[cluster_index]

                changed = True
                break

        return [
            sorted(cluster)
            for cluster in clusters
        ]
    
    def _nearest_cluster(self, X, clusters, cluster_index):
        source_cluster = clusters[cluster_index]
        source_centroid = np.mean(X[source_cluster], axis=0)

        best_index = None
        best_distance = float("inf")

        for other_index, other_cluster in enumerate(clusters):
            if other_index == cluster_index:
                continue

            other_centroid = np.mean(X[other_cluster], axis=0)
            distance = self._cosine_distance(source_centroid, other_centroid)

            if distance < best_distance:
                best_distance = distance
                best_index = other_index

        return best_index, best_distance


    def _cosine_distance(self, vector_a, vector_b):
        vector_a = np.asarray(vector_a, dtype=float)
        vector_b = np.asarray(vector_b, dtype=float)

        norm_a = np.linalg.norm(vector_a)
        norm_b = np.linalg.norm(vector_b)

        if norm_a == 0.0 or norm_b == 0.0:
            return 1.0

        cosine_similarity = float(np.dot(vector_a, vector_b) / (norm_a * norm_b))
        cosine_similarity = max(-1.0, min(1.0, cosine_similarity))

        return float(max(0.0, min(1.0, 1.0 - cosine_similarity)))
        
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
