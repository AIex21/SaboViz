from typing import Any, Optional, Callable

from app.services.trace_decomposition.preprocessing import TracePreprocessor
from app.services.trace_decomposition.coarse_splitter import CoarseTraceSplitter
from app.services.trace_decomposition.embedding import TraceEmbedder
from app.services.trace_decomposition.pelt_segmenter import PeltTraceSegmenter
from app.services.trace_decomposition.segment_enricher import SegmentEnricher
from app.services.trace_decomposition.adjacent_clusterer import AdjacentClusterer
from app.services.trace_decomposition.serialization import TraceClusterSerializer
from app.services.trace_decomposition.utils import TraceDecompositionUtils


class TraceDecomposition:
    def __init__(self, graph_service):
        self.graph_service = graph_service
        self.preprocessor = TracePreprocessor(graph_service)
        self.coarse_splitter = CoarseTraceSplitter()
        self.embedder = TraceEmbedder()
        self.pelt_segmenter = PeltTraceSegmenter()
        self.enricher = SegmentEnricher(graph_service)
        self.clusterer = AdjacentClusterer()
        self.serializer = TraceClusterSerializer()

        self.utils = TraceDecompositionUtils()

    def decompose_trace(
            self,
            trace_data,
            project_id: int,
            summarizer,
            allow_ai: bool,
            node_lookup,
            collect_nodes_with_ancestors,
            progress_callback: Optional[Callable[[str, int, Optional[int], Optional[str]], None]] = None
        ):
        steps = self.preprocessor.preprocess_trace(trace_data, project_id)

        if not steps:
            return {
                "micro_segments": [],
                "hierarchical_clusters": [],
            }
        
        coarse_segments = self.coarse_splitter.split(steps)
        embedded_segments = self.embedder.embed_segments(coarse_segments)

        pelt_segments = self.pelt_segmenter.apply(embedded_segments)

        micro_total = len(pelt_segments)
        micro_done = 0

        def advance_micro_progress(segment_name: Optional[str] = None):
            nonlocal micro_done

            if progress_callback is None or micro_total <= 0:
                return
            
            micro_done = min(micro_done + 1, micro_total)

            progress_callback(
                "micro",
                micro_done,
                micro_total,
                segment_name,
            )

        if progress_callback is not None and micro_total > 0:
            progress_callback("micro", 0, micro_total, None)

        enriched_segments = self.enricher.enrich(
            pelt_segments = pelt_segments,
            summarizer = summarizer,
            allow_ai = allow_ai,
            node_lookup = node_lookup,
            collect_nodes_with_ancestors = collect_nodes_with_ancestors,
            progress_step = advance_micro_progress,
        )

        merge_done = 0

        def advance_merge_progress(segment_name: Optional[str] = None):
            nonlocal merge_done

            if progress_callback is None:
                return

            merge_done += 1

            progress_callback(
                "hierarchical",
                merge_done,
                None,
                segment_name,
            )

        hierarhical_segments = self.clusterer.build(
            enriched_segments,
            summarizer = summarizer,
            allow_ai = allow_ai,
            progress_step = advance_merge_progress,
        )

        if progress_callback is not None and merge_done > 0:
            progress_callback(
                "hierarchical",
                merge_done,
                merge_done,
                None,
            )

        return {
            "micro_segments": enriched_segments,
            "hierarchical_clusters": self.serializer.serialize(hierarhical_segments),
        }

    def extract_step_numbers(self, segment_steps) -> list[int]:
        return self.utils.extract_step_numbers(segment_steps)