import re

import numpy as np

from statistics import median

class AdjacentClusterer:

    def build(
        self,
        segments,
        summarizer = None,
        allow_ai = False,
        progress_step = None,
    ):
        if not segments:
            return []
        
        clusters = [
            self._make_initial_cluster(segment)
            for segment in segments
        ]

        if len(clusters) == 1:
            if progress_step is not None:
                progress_step(clusters[0].get("name"))
            return clusters
        
        partitions, merge_distances = self._build_full_adjacent_hierarchy(clusters, progress_step = progress_step)

        selected_partition = self._select_best_partition(
            partitions = partitions,
            merge_distances = merge_distances,
        )

        selected_partition = self._merge_weak_top_level_clusters(selected_partition)

        if allow_ai and summarizer is not None:
            selected_partition = [
                self._summarize_cluster_tree(cluster, summarizer)
                for cluster in selected_partition
            ]

        return selected_partition
    
    def _build_full_adjacent_hierarchy(self, initial_clusters, progress_step=None):
        clusters = list(initial_clusters)

        partitions = [list(clusters)]
        merge_distances = []

        total_merges = max(0, len(clusters) - 1)
        completed_merges = 0

        while len(clusters) > 1:
            best_index = -1
            best_distance = float("inf")

            for index in range(len(clusters) - 1):
                left_cluster = clusters[index]
                right_cluster = clusters[index + 1]

                distance = self._mixed_cluster_distance(left_cluster, right_cluster)

                if distance < best_distance:
                    best_distance = distance
                    best_index = index

            if best_index < 0:
                break

            left_cluster = clusters[best_index]
            right_cluster = clusters[best_index + 1]

            merged_cluster = self._merge_clusters(left_cluster, right_cluster, merge_distance = best_distance)

            clusters = (
                clusters[:best_index]
                + [merged_cluster]
                + clusters[best_index + 2 :]
            )

            completed_merges += 1

            merge_distances.append(best_distance)
            partitions.append(list(clusters))

            if progress_step is not None:
                progress_step(
                f"Building hierarchy {completed_merges}/{total_merges}"
            )

        return partitions, merge_distances
    
    def _select_best_partition(self, partitions, merge_distances):
        if not partitions:
            return []
        
        if len(partitions) == 1:
            return partitions[0]
        
        initial_cluster_count = len(partitions[0])

        root_partition = partitions[-1]
        root_dispersion = self._partition_internal_dispersion(root_partition)

        best_partition = partitions[-1]
        best_score = float("-inf")

        for partition_index, partition in enumerate(partitions):
            cluster_count = len(partition)

            partition_dispersion = self._partition_internal_dispersion(partition)
            separation = self._partition_boundary_separation(partition)
            functional_separation = self._partition_functional_separation(partition)
            merge_jump = self._merge_jump_score(
                partition_index = partition_index,
                merge_distances = merge_distances,
            )

            dispersion_gain = max(0.0, root_dispersion - partition_dispersion)

            complexity_penalty = self._complexity_penalty(
                cluster_count = cluster_count,
                initial_cluster_count = initial_cluster_count,
            )

            weak_execution_unit_penalty = self._weak_execution_unit_penalty(partition)

            score = (
                0.25 * dispersion_gain
                + 0.20 * separation
                + 0.20 * functional_separation
                + 0.15 * merge_jump
                - 0.20 * complexity_penalty
                - 0.50 * weak_execution_unit_penalty
            )

            if cluster_count == 1:
                score += 0.05 * max(0.0, 1.0 - root_dispersion)

            if score > best_score:
                best_score = score
                best_partition = partition

        return best_partition
    
    def _make_initial_cluster(self, segment):
        components = set(segment.get("components", []) or [])
        context_tokens = self._component_context_tokens(components)

        return {
            "segments": [segment],
            "name": segment.get("name"),
            "description": segment.get("description"),
            "components": sorted(components),
            "contextTokens": sorted(context_tokens),
            "vector": self._segment_vector(segment),
            "children": [],
            "mergeDistance": 0.0,
        }
    
    def _merge_clusters(self, cluster_a, cluster_b, merge_distance):
        merged_segments = (
            cluster_a.get("segments", [])
            + cluster_b.get("segments", [])
        )

        components = set(cluster_a.get("components", []) or [])
        components.update(cluster_b.get("components", []) or [])

        context_tokens = set(cluster_a.get("contextTokens", []) or [])
        context_tokens.update(cluster_b.get("contextTokens", []) or [])

        vector = self._weighted_average_vectors(
            cluster_a.get("vector"),
            len(cluster_a.get("segments", []) or []),
            cluster_b.get("vector"),
            len(cluster_b.get("segments", []) or []),
        )

        merged_name = self._merged_name(cluster_a, cluster_b)
        merged_description = self._merged_description(cluster_a, cluster_b)

        return {
            "segments": merged_segments,
            "name": merged_name,
            "description": merged_description,
            "components": sorted(components),
            "contextTokens": sorted(context_tokens),
            "vector": vector,
            "children": [cluster_a, cluster_b],
            "mergeDistance": float(merge_distance),
        }
    
    def _summarize_cluster_tree(self, cluster, summarizer):
        children = cluster.get("children", []) or []

        summarized_children = [
            self._summarize_cluster_tree(child, summarizer)
            for child in children
            if isinstance(child, dict)
        ]

        updated_cluster = {
            **cluster,
            "children": summarized_children,
        }

        if len(summarized_children) == 2:
            left_description = summarized_children[0].get("description", "")
            right_description = summarized_children[1].get("description", "")

            ai_result = summarizer.prompt_hierarchical_feature(left_description, right_description)

            ai_name = (ai_result or {}).get("feature_name")
            ai_description = (ai_result or {}).get("description")

            if ai_name:
                updated_cluster["name"] = ai_name
            if ai_description:
                updated_cluster["description"] = ai_description

        return updated_cluster
    
    def _mixed_cluster_distance(self, cluster_a, cluster_b):
        embedding_distance = self._pairwise_cosine_distance(
            cluster_a.get("vector"),
            cluster_b.get("vector"),
        )

        component_similarity = self._jaccard_similarity(
            set(cluster_a.get("components", []) or []),
            set(cluster_b.get("components", []) or []),
        )
        component_distance = 1.0 - component_similarity

        context_similarity = self._jaccard_similarity(
            set(cluster_a.get("contextTokens", []) or []),
            set(cluster_b.get("contextTokens", []) or []),
        )
        context_distance = 1.0 - context_similarity

        return (
            0.50 * embedding_distance
            + 0.25 * component_distance
            + 0.25 * context_distance
        )
    
    def _partition_functional_separation(self, partition):
        if len(partition) <= 1:
            return 0.0

        distances = []

        for index in range(len(partition) - 1):
            left_cluster = partition[index]
            right_cluster = partition[index + 1]

            left_components = set(left_cluster.get("components", []) or [])
            right_components = set(right_cluster.get("components", []) or [])

            similarity = self._jaccard_similarity(left_components, right_components)
            distance = 1.0 - similarity

            left_strength = self._execution_unit_strength(left_cluster)
            right_strength = self._execution_unit_strength(right_cluster)

            evidence_strength = min(left_strength, right_strength)

            distances.append(distance * evidence_strength)

        if not distances:
            return 0.0

        return float(sum(distances) / len(distances))
    def _weak_execution_unit_penalty(self, partition):
        if len(partition) <= 1:
            return 0.0
        
        penalties = []

        for cluster in partition:
            strength = self._execution_unit_strength(cluster)
            weakness = 1.0 - strength
            penalties.append(weakness)

        if not penalties:
            return 0.0

        mean_penalty = sum(penalties) / float(len(penalties))
        max_penalty = max(penalties)

        return 0.50 * mean_penalty + 0.50 * max_penalty

    def _execution_unit_strength(self, cluster):
        segments = cluster.get("segments", []) or []

        segment_count = len(segments)

        step_count = 0
        for segment in segments:
            step_count += len(segment.get("steps", []) or [])

        component_count = len(cluster.get("components", []) or [])

        segment_strength = min(1.0, segment_count / 2.0)
        step_strength = min(1.0, step_count / 20.0)
        component_strength = min(1.0, component_count / 3.0)

        return max(segment_strength, 0.60 * step_strength + 0.40 * component_strength)
    
    def _partition_internal_dispersion(self, partition):
        if not partition:
            return 0.0
        
        total_weight = 0.0
        weighted_dispersion = 0.0

        for cluster in partition:
            weight = max(1, len(cluster.get("segments", []) or []))
            dispersion = self._cluster_internal_dispersion(cluster)

            weighted_dispersion += dispersion * weight
            total_weight += weight

        if total_weight == 0.0:
            return 0.0
        
        return weighted_dispersion / total_weight
    
    def _cluster_internal_dispersion(self, cluster):
        segment_vectors = self._cluster_segment_vectors(cluster)

        if len(segment_vectors) <= 1:
            return 0.0
        
        centroid = self._mean_vector(segment_vectors)

        if centroid is None:
            return 0.0
        
        distances = [
            self._pairwise_cosine_distance(vector, centroid)
            for vector in segment_vectors
        ]

        if not distances:
            return 0.0
        
        return float(sum(distances) / len(distances))
    
    def _partition_boundary_separation(self, partition):
        if len(partition) <= 1:
            return 0.0
        
        distances = []

        for index in range(len(partition) - 1):
            distance = self._mixed_cluster_distance(
                partition[index],
                partition[index + 1],
            )
            distances.append(distance)

        if not distances:
            return 0.0
        
        return float(sum(distances) / len(distances))
    
    def _merge_jump_score(self, partition_index, merge_distances):
        if not merge_distances:
            return 0.0
        
        if partition_index <= 0:
            return 0.0
        
        if partition_index >= len(merge_distances):
            return 0.0
        
        next_distance = merge_distances[partition_index]
        previous_distance = merge_distances[:partition_index]

        if not previous_distance:
            return 0.0
        
        previous_reference = float(median(previous_distance))

        min_distance = min(merge_distances)
        max_distance = max(merge_distances)
        distance_range = max_distance - min_distance

        if distance_range <= 0.0:
            return 0.0
        
        jump = max(0.0, next_distance - previous_reference)

        return min(1.0, jump / distance_range)
    
    def _complexity_penalty(self, cluster_count, initial_cluster_count):
        if initial_cluster_count <= 0:
            return 0.0
        
        if cluster_count <= 1:
            return 0.0
        
        return (cluster_count - 1) / float(initial_cluster_count)
    
    def _merge_weak_top_level_clusters(self, partition, min_strength = 0.75):
        clusters = list(partition or [])

        if len(clusters) <= 1:
            return clusters
        
        while len(clusters) > 1:
            weakest_index = -1
            weakest_strength = float("inf")

            for index, cluster in enumerate(clusters):
                strength = self._execution_unit_strength(cluster)

                if strength < weakest_strength:
                    weakest_strength = strength
                    weakest_index = index

            if weakest_index < 0:
                break

            if weakest_strength >= min_strength:
                break

            neighbor_index = self._best_neighbor_for_weak_cluster(clusters, weakest_index)

            if neighbor_index < 0:
                break

            left_index = min(weakest_index, neighbor_index)
            right_index = max(weakest_index, neighbor_index)

            merge_distance = self._mixed_cluster_distance(
                clusters[left_index],
                clusters[right_index],
            )

            merged_cluster = self._merge_clusters(
                clusters[left_index],
                clusters[right_index],
                merge_distance = merge_distance,
            )

            clusters = (
                clusters[:left_index]
                + [merged_cluster]
                + clusters[right_index + 1 :]
            )

        return clusters
    
    def _best_neighbor_for_weak_cluster(self, clusters, weak_index):
        if not clusters:
            return -1

        if len(clusters) <= 1:
            return -1

        if weak_index <= 0:
            return 1

        if weak_index >= len(clusters) - 1:
            return len(clusters) - 2

        left_cluster = clusters[weak_index - 1]
        weak_cluster = clusters[weak_index]
        right_cluster = clusters[weak_index + 1]

        left_distance = self._mixed_cluster_distance(
            left_cluster,
            weak_cluster,
        )

        right_distance = self._mixed_cluster_distance(
            weak_cluster,
            right_cluster,
        )

        if left_distance <= right_distance:
            return weak_index - 1

        return weak_index + 1
    
    def _cluster_segment_vectors(self, cluster):
        vectors = []

        for segment in cluster.get("segments", []) or []:
            vector = self._segment_vector(segment)

            if vector is not None:
                vectors.append(vector)

        return vectors
    
    def _segment_vector(self, segment):
        step_vectors = []

        for step in segment.get("steps", []) or []:
            embedding = step.get("embedding")
            vector = self._to_numpy_vector(embedding)

            if vector is not None:
                step_vectors.append(vector)

        return self._mean_vector(step_vectors)
    
    def _mean_vector(self, vectors):
        valid_vectors = []
        expected_size = None

        for vector in vectors or []:
            array = self._to_numpy_vector(vector)

            if array is None:
                continue

            if expected_size is None:
                expected_size = array.shape[0]

            if array.shape[0] != expected_size:
                continue

            valid_vectors.append(array)

        if not valid_vectors:
            return None
        
        return np.mean(np.stack(valid_vectors), axis=0)
    
    def _weighted_average_vectors(self, vector_a, weight_a, vector_b, weight_b):
        vector_a = self._to_numpy_vector(vector_a)
        vector_b = self._to_numpy_vector(vector_b)

        if vector_a is None and vector_b is None:
            return None

        if vector_a is None:
            return vector_b

        if vector_b is None:
            return vector_a

        if vector_a.shape[0] != vector_b.shape[0]:
            return vector_a

        weight_a = max(1.0, float(weight_a or 1.0))
        weight_b = max(1.0, float(weight_b or 1.0))

        return ((vector_a * weight_a) + (vector_b * weight_b)) / (
            weight_a + weight_b
        )

    def _to_numpy_vector(self, vector):
        if vector is None:
            return None

        if isinstance(vector, np.ndarray):
            if vector.size == 0:
                return None

            if vector.ndim != 1:
                return None

            return vector.astype(float)

        if isinstance(vector, (list, tuple)):
            if not vector:
                return None

            try:
                array = np.asarray(vector, dtype=float)
            except (TypeError, ValueError):
                return None

            if array.size == 0 or array.ndim != 1:
                return None

            return array

        return None

    def _pairwise_cosine_distance(self, vector_a, vector_b):
        vector_a = self._to_numpy_vector(vector_a)
        vector_b = self._to_numpy_vector(vector_b)

        if vector_a is None or vector_b is None:
            return 1.0

        if vector_a.shape[0] != vector_b.shape[0]:
            return 1.0

        norm_a = np.linalg.norm(vector_a)
        norm_b = np.linalg.norm(vector_b)

        if norm_a == 0.0 or norm_b == 0.0:
            return 1.0

        cosine_similarity = float(np.dot(vector_a, vector_b) / (norm_a * norm_b))

        cosine_similarity = max(-1.0, min(1.0, cosine_similarity))

        # Cap to [0, 1] to keep all scoring terms comparable.
        return max(0.0, min(1.0, 1.0 - cosine_similarity))

    def _jaccard_similarity(self, set_a, set_b):
        set_a = set(set_a or [])
        set_b = set(set_b or [])

        if not set_a and not set_b:
            return 1.0

        union = set_a | set_b

        if not union:
            return 1.0

        return len(set_a & set_b) / float(len(union))

    def _component_context_tokens(self, components):
        tokens = set()

        for component in components or []:
            tokens.update(self._uri_context_tokens(component))

        return tokens

    def _uri_context_tokens(self, uri):
        if not uri:
            return set()

        value = str(uri)

        if ":///" in value:
            value = value.split(":///", 1)[1]

        value = value.split("(", 1)[0]
        value = value.replace("\\", "/").replace("::", "/")

        parts = [
            part.lower()
            for part in re.split(r"[/#.$]+", value)
            if part
        ]

        if not parts:
            return set()

        tokens = set()

        tokens.add(f"root:{parts[0]}")

        if len(parts) > 1:
            tokens.add(f"parent:{parts[-2]}")

        if parts[-1]:
            tokens.add(f"operation:{parts[-1]}")

        for part in parts[:-1][-4:]:
            tokens.add(f"context:{part}")

        return tokens

    def _merged_name(self, cluster_a, cluster_b):
        left_name = str(cluster_a.get("name") or "").strip()
        right_name = str(cluster_b.get("name") or "").strip()

        if not left_name and not right_name:
            return "Runtime_Episode"

        if not left_name:
            return self._compact_text(right_name, max_length=120)

        if not right_name:
            return self._compact_text(left_name, max_length=120)

        if left_name == right_name:
            return self._compact_text(left_name, max_length=120)

        return self._compact_text(
            f"{left_name} → {right_name}",
            max_length=120,
        )

    def _merged_description(self, cluster_a, cluster_b):
        left_description = str(cluster_a.get("description") or "").strip()
        right_description = str(cluster_b.get("description") or "").strip()

        if not left_description and not right_description:
            return "No description could be generated for this runtime episode."

        if not left_description:
            return self._compact_text(right_description, max_length=500)

        if not right_description:
            return self._compact_text(left_description, max_length=500)

        return self._compact_text(
            f"{left_description} Then {right_description}",
            max_length=500,
        )

    def _compact_text(self, text, max_length):
        text = str(text or "").strip()

        if len(text) <= max_length:
            return text

        return text[: max_length - 3].rstrip() + "..."