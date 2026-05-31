import re

from collections import Counter

from app.services.trace_decomposition.utils import TraceDecompositionUtils


class SegmentEnricher:
    def __init__(self, graph_service):
        self.graph_service = graph_service
        self.utils = TraceDecompositionUtils()

    def enrich(self, pelt_segments, summarizer, allow_ai, node_lookup, collect_nodes_with_ancestors, progress_step=None):
        enriched_segments = []

        for index, segment_steps in enumerate(pelt_segments, start=1):
            components = self._collect_segment_components(segment_steps)

            default_name = self._generate_segment_name(components, index)
            fallback_description = self._generate_segment_description(segment_steps)

            segment_name = default_name
            segment_description = fallback_description

            if allow_ai and summarizer is not None and components:
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

            if progress_step is not None:
                progress_step(segment_name)

        return enriched_segments
    
    def _collect_segment_components(self, segment_steps):
        components = set()

        for step in segment_steps:
            properties = self.utils.get_step_properties(step)

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
            properties = self.utils.get_step_properties(step)
            for key in ("sourceSummary", "targetSummary"):
                text = self.utils.summary_to_text(properties.get(key)).strip()
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
            return preview

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