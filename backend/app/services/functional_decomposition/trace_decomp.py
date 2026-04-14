import hashlib
import math
import re
from collections import Counter
from typing import Any

import numpy as np
import ruptures as rpt


class TraceDecomposition:
    SMOOTH_RADIUS = 1
    LOCAL_MIN_WINDOW = 3
    MIN_PROMINENCE = 1.0
    TEXT_HASH_DIM = 128
    CONTEXT_RADIUS = 2
    PELT_PENALTY = 30.0 #Higher values lead to fewer segments, lower values lead to more segments
    PELT_MIN_SIZE = 3

    def __init__(self, graph_service):
        self.graph_service = graph_service

    def decompose_trace(
        self,
        trace_data,
        project_id: int,
        summarizer,
        allow_ai: bool,
        node_lookup,
        collect_nodes_with_ancestors,
        pelt_penalty: float | None = None,
        distance_threshold: float = 0.5,
    ):
        steps = self._preprocess_trace(trace_data, project_id)

        if not steps:
            return {
                "micro_segments": [],
                "hierarchical_clusters": [],
            }

        coarse_segments = self._coarse_split(steps)
        embedded_segments = self._embed_segments(coarse_segments)
        pelt_segments = self._apply_pelt_to_embedded_segments(
            embedded_segments,
            pelt_penalty=pelt_penalty,
        )

        enriched_segments = self._enrich_segments(
            pelt_segments=pelt_segments,
            summarizer=summarizer,
            allow_ai=allow_ai,
            node_lookup=node_lookup,
            collect_nodes_with_ancestors=collect_nodes_with_ancestors,
        )

        hierarchical_segments = self._build_adjacent_hierarchical_segments(
            enriched_segments,
            distance_threshold=distance_threshold,
            summarizer=summarizer,
            allow_ai=allow_ai,
        )

        return {
            "micro_segments": enriched_segments,
            "hierarchical_clusters": self._serialize_hierarchical_clusters(hierarchical_segments),
        }

    def extract_step_numbers(self, segment_steps) -> list[int]:
        step_numbers = []

        for step in segment_steps:
            properties = self._get_step_properties(step)
            value: Any = properties.get("step")

            if isinstance(value, (int, float)):
                step_numbers.append(int(value))
            elif isinstance(value, str):
                stripped = value.strip()
                if stripped.isdigit():
                    step_numbers.append(int(stripped))

        return step_numbers

    def _get_step_properties(self, step):
        if not isinstance(step, dict):
            return {}

        direct_properties = step.get("properties")
        if isinstance(direct_properties, dict):
            return direct_properties

        data = step.get("data")
        if isinstance(data, dict):
            nested_properties = data.get("properties")
            if isinstance(nested_properties, dict):
                return nested_properties

        return {}

    def _enrich_segments(
        self,
        pelt_segments,
        summarizer,
        allow_ai: bool,
        node_lookup,
        collect_nodes_with_ancestors,
    ):
        enriched_segments = []

        for index, segment_steps in enumerate(pelt_segments, start=1):
            components = self._collect_segment_components(segment_steps)

            default_name = self._generate_segment_name(components, index)
            fallback_description = self._generate_segment_description(segment_steps)

            segment_name = default_name
            segment_description = fallback_description

            if allow_ai and components:
                linked_nodes = collect_nodes_with_ancestors(components, node_lookup)

                if linked_nodes:
                    internal_edges = self.graph_service.get_edges_between_nodes(components)
                    ai_result = summarizer.prompt_micro_feature(linked_nodes, internal_edges)

                    ai_name = (ai_result or {}).get("feature_name")
                    ai_description = (ai_result or {}).get("description")

                    if ai_name:
                        segment_name = ai_name
                    if ai_description:
                        segment_description = ai_description

            enriched_segments.append(
                {
                    "segmentIndex": index,
                    "name": segment_name,
                    "description": segment_description,
                    "components": components,
                    "steps": segment_steps,
                }
            )

        return enriched_segments

    def _collect_segment_components(self, segment_steps):
        components = set()

        for step in segment_steps:
            properties = self._get_step_properties(step)

            source_id = properties.get("sourceId")
            target_id = properties.get("targetId")

            if source_id:
                components.add(source_id)
            if target_id:
                components.add(target_id)

        return sorted(components)

    def _generate_segment_name(self, components, segment_index):
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
            return f"Segment_{segment_index}"

        counter = Counter(words)
        most_common = counter.most_common(2)
        return "_".join([word for word, _ in most_common])

    def _generate_segment_description(self, segment_steps):
        summary_lines = []
        seen = set()

        for step in segment_steps:
            properties = self._get_step_properties(step)
            for key in ("sourceSummary", "targetSummary"):
                text = self._summary_to_text(properties.get(key)).strip()
                if not text:
                    continue

                normalized = text.lower()
                if normalized in seen:
                    continue

                seen.add(normalized)
                summary_lines.append(text)

        if summary_lines:
            preview = "; ".join(summary_lines[:3])
            if len(summary_lines) > 3:
                preview += "; ..."
            return f"Includes: {preview}"

        operation_names = []
        for uri in self._collect_segment_components(segment_steps):
            name = uri.split(":///")[-1].split("(")[0]
            if name:
                operation_names.append(name)

        if operation_names:
            preview = ", ".join(operation_names[:4])
            if len(operation_names) > 4:
                preview += ", ..."
            return f"Includes operations around {preview}."

        return "No summary could be generated for this segment."

    def _preprocess_trace(self, trace_data, project_id):
        operation_nodes = self.graph_service.get_summary_map(project_id)

        elements = trace_data.get("elements", {}) if isinstance(trace_data, dict) else {}
        steps = elements.get("nodes", []) if isinstance(elements, dict) else []

        preprocess_steps = []

        for step in steps:
            step_data = step.get("data", {})
            labels = step_data.get("labels", [])

            if "Action" not in labels:
                continue

            properties = step_data.get("properties", {})
            operation_resolution = properties.get("operationResolution")

            if operation_resolution != "resolved":
                continue

            step["data"]["properties"]["sourceSummary"] = operation_nodes.get(properties.get("sourceId"), {})
            step["data"]["properties"]["targetSummary"] = operation_nodes.get(properties.get("targetId"), {})

            preprocess_steps.append(step)

        preprocess_steps.sort(key=lambda x: x.get("data", {}).get("properties", {}).get("step", 0))

        return preprocess_steps

    def _coarse_split(self, steps):
        return [list(steps)]

    def _embed_segments(self, segments):
        embedded_segments = []

        for segment in segments:
            if not segment:
                embedded_segments.append([])
                continue

            base_vectors = [
                self._build_step_base_vector(segment, index)
                for index in range(len(segment))
            ]
            contextual_vectors = self._apply_context_window(base_vectors)

            embedded_steps = []
            for index, step in enumerate(segment):
                embedded_steps.append(
                    {
                        **step,
                        "embedding": contextual_vectors[index],
                    }
                )

            embedded_segments.append(embedded_steps)

        return embedded_segments

    def _apply_pelt_to_embedded_segments(self, embedded_segments, pelt_penalty: float | None = None):
        pelt_segments = []

        for embedded_segment in embedded_segments:
            if not embedded_segment:
                continue

            vectors = [step.get("embedding", []) for step in embedded_segment]
            change_points = self._run_pelt(vectors, pelt_penalty=pelt_penalty)
            boundary_points = set(change_points)

            micro_segment = []
            for index, step in enumerate(embedded_segment):
                micro_segment.append(step)

                if (index + 1) in boundary_points:
                    pelt_segments.append(micro_segment)
                    micro_segment = []

            if micro_segment:
                pelt_segments.append(micro_segment)

        return pelt_segments

    def _run_pelt(self, vectors, pelt_penalty: float | None = None):
        n = len(vectors)
        if n == 0:
            return []

        min_size = max(1, int(self.PELT_MIN_SIZE))
        if n < 2 * min_size:
            return []

        if not vectors[0]:
            return []

        signal = np.asarray(vectors, dtype=float)
        penalty = float(self.PELT_PENALTY if pelt_penalty is None else pelt_penalty)

        model = rpt.Pelt(model="l2", min_size=min_size, jump=1)
        breakpoints = model.fit(signal).predict(pen=penalty)

        change_points = [point for point in breakpoints if 0 < point < n]
        return sorted(set(change_points))

    def _build_step_base_vector(self, steps, index):
        node_properties = steps[index].get("data", {}).get("properties", {})

        step_type = node_properties.get("type")
        is_call = 1.0 if step_type == "call" else 0.0
        is_return = 1.0 if step_type == "return" else 0.0
        is_other = 1.0 if step_type not in ("call", "return") else 0.0

        depth = float(node_properties.get("depth", 0) or 0)
        previous_depth = 0.0
        if index > 0:
            previous_properties = steps[index - 1].get("data", {}).get("properties", {})
            previous_depth = float(previous_properties.get("depth", 0) or 0)

        depth_delta = depth - previous_depth
        normalized_index = index / max(1.0, float(len(steps) - 1))

        source_id = str(node_properties.get("sourceId") or "")
        target_id = str(node_properties.get("targetId") or "")

        source_summary = node_properties.get("sourceSummary")
        target_summary = node_properties.get("targetSummary")
        summary_text = self._summary_to_text(source_summary) + " " + self._summary_to_text(target_summary)

        param_count = float(self._count_uri_parameters(source_id))

        numeric_features = [
            is_call,
            is_return,
            is_other,
            depth,
            depth_delta,
            normalized_index,
            param_count,
        ]

        lexical_payload = " ".join(
            [
                source_id,
                target_id,
                summary_text,
            ]
        )
        lexical_features = self._hashed_text_vector(lexical_payload, self.TEXT_HASH_DIM)

        return numeric_features + lexical_features

    def _apply_context_window(self, base_vectors):
        contextual_vectors = []
        vector_size = len(base_vectors[0])

        for index in range(len(base_vectors)):
            start = max(0, index - self.CONTEXT_RADIUS)
            end = min(len(base_vectors), index + self.CONTEXT_RADIUS + 1)
            window = base_vectors[start:end]

            context_avg = [0.0] * vector_size
            for vector in window:
                for dim in range(vector_size):
                    context_avg[dim] += vector[dim]

            window_size = float(len(window))
            context_avg = [value / window_size for value in context_avg]

            contextual_vectors.append(base_vectors[index] + context_avg)

        return contextual_vectors

    def _summary_to_text(self, summary):
        if isinstance(summary, str):
            return summary

        if isinstance(summary, dict):
            description = str(summary.get("description") or "")
            return f"{description}".strip()

        return ""

    def _count_uri_parameters(self, uri):
        if not uri or "(" not in uri or ")" not in uri:
            return 0

        start = uri.find("(") + 1
        end = uri.rfind(")")
        if end <= start:
            return 0

        params = uri[start:end].strip()
        if not params:
            return 0

        return len([p for p in params.split(",") if p.strip()])

    def _hashed_text_vector(self, text, dim):
        vector = [0.0] * dim
        if not text:
            return vector

        tokens = re.findall(r"[A-Za-z0-9_]+", text.lower())
        if not tokens:
            return vector

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
            bucket = int(digest[:8], 16) % dim
            vector[bucket] += 1.0

        norm = math.sqrt(sum(value * value for value in vector))
        if norm > 0:
            vector = [value / norm for value in vector]

        return vector

    def _build_adjacent_hierarchical_segments(self, segments, distance_threshold: float, summarizer, allow_ai: bool):
        if not segments:
            return []
        
        clusters = []

        # First, create initial clusters for each segment
        for segment in segments:
            vector = self._build_segment_vector(segment)
            clusters.append({
                "segments": [segment],
                "name": segment.get("name"),
                "description": segment.get("description"),
                "vector": vector,
                "children": []
            })
        
        while len(clusters) > 1:
            min_distance = float("inf")
            best_merge_index = -1

            for i in range(len(clusters) - 1):
                left_cluster = clusters[i]
                right_cluster = clusters[i + 1]

                #compute cosine distance between cluster
                cosine_distance = self._cosine_distance(left_cluster, right_cluster)
                if cosine_distance < min_distance:
                    min_distance = cosine_distance
                    best_merge_index = i

            if best_merge_index < 0 or min_distance > distance_threshold:
                break

            left_cluster = clusters[best_merge_index]
            right_cluster = clusters[best_merge_index + 1]

            merged_cluster = self._merge_clusters(left_cluster, right_cluster, summarizer, allow_ai)
            clusters[best_merge_index] = merged_cluster
            del clusters[best_merge_index + 1]

        return clusters
    
    def _build_segment_vector(self, segment):
        if isinstance(segment, dict):
            segments = [segment]
        elif isinstance(segment, list):
            segments = [item for item in segment if isinstance(item, dict)]
        else:
            segments = []

        vectors = []
        for item in segments:
            steps = item.get("steps", [])
            for step in steps:
                embedding = step.get("embedding")

                if embedding is None:
                    continue

                if isinstance(embedding, np.ndarray):
                    if embedding.size == 0:
                        continue
                    vectors.append(embedding.tolist())
                    continue

                if isinstance(embedding, (list, tuple)):
                    if not embedding:
                        continue
                    vectors.append(list(embedding))

        if not vectors:
            return None
        
        return np.mean(np.vstack(vectors), axis=0)
    
    def _cosine_distance(self, cluster_a, cluster_b):
        vector_a = cluster_a.get("vector")
        vector_b = cluster_b.get("vector")

        if vector_a is None or vector_b is None:
            return 1.0

        dot_product = np.dot(vector_a, vector_b)
        norm_a = np.linalg.norm(vector_a)
        norm_b = np.linalg.norm(vector_b)

        if norm_a == 0.0 or norm_b == 0.0:
            return 1.0

        cosine_similarity = dot_product / (norm_a * norm_b)
        cosine_distance = 1.0 - cosine_similarity
        return cosine_distance
    
    def _merge_clusters(self, cluster_a, cluster_b, summarizer, allow_ai: bool):
        merged_segments = cluster_a.get("segments", []) + cluster_b.get("segments", [])
        merged_vector = self._build_segment_vector(merged_segments)
        merged_name = f"{cluster_a.get('name', '')} + {cluster_b.get('name', '')}"
        merged_description = f"{cluster_a.get('description', '')} Then {cluster_b.get('description', '')}"

        if allow_ai:
            ai_result = summarizer.prompt_hierarchical_feature(cluster_a.get("description", ""), cluster_b.get("description", ""))

            ai_name = (ai_result or {}).get("feature_name")
            ai_description = (ai_result or {}).get("description")

            if ai_name:
                merged_name = ai_name
            if ai_description:
                merged_description = ai_description

        return {
            "segments": merged_segments,
            "vector": merged_vector,
            "name": merged_name,
            "description": merged_description,
            "children": [cluster_a, cluster_b]
        }

    def _serialize_hierarchical_clusters(self, clusters):
        def serialize_cluster(cluster):
            segment_indexes = []
            for segment in cluster.get("segments", []):
                segment_index = segment.get("segmentIndex")
                if isinstance(segment_index, int):
                    segment_indexes.append(segment_index)

            children = [
                serialize_cluster(child)
                for child in cluster.get("children", [])
                if isinstance(child, dict)
            ]

            return {
                "name": cluster.get("name"),
                "description": cluster.get("description"),
                "segmentIndexes": sorted(set(segment_indexes)),
                "children": children,
            }

        return [serialize_cluster(cluster) for cluster in clusters if isinstance(cluster, dict)]
