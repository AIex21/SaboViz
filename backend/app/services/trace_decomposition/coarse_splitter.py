import datetime
import math
import re

import numpy as np

from app.services.trace_decomposition.utils import TraceDecompositionUtils

class CoarseTraceSplitter:
    def __init__(self, pelt_min_size=3):
        self.utils = TraceDecompositionUtils()
        self.pelt_min_size = pelt_min_size

    def split(self, steps):
        """
        Splits a trace into coarse segments based on heuristics that identify likely boundaries between different runtime episodes.
        """
    
        steps = list(steps or [])
        if not steps:
            return []
        
        min_segment_size = self._coarse_min_segment_size(len(steps))
        if len(steps) < 2 * min_segment_size:
            return [steps]
        
        boundary_scores = self._score_coarse_boundaries(steps)

        boundaries = self._select_coarse_boundaries(
            steps = steps,
            boundary_scores = boundary_scores,
            min_segment_size = min_segment_size
        )

        if not boundaries:
            return [steps]
        
        coarse_segments = []
        start = 0

        for boundary in boundaries:
            if boundary <= start:
                continue

            coarse_segments.append(steps[start:boundary])
            start = boundary

        if start < len(steps):
            coarse_segments.append(steps[start:])

        return [segment for segment in coarse_segments if segment]
    
    def _coarse_min_segment_size(self, total_steps):
        """
        Determine the minimum segment size for coarse splitting based on the total number of steps in the trace.
        """

        try:
            total_steps = int(total_steps or 0)
        except (TypeError, ValueError):
            total_steps = 0

        # A coarse block must be large enough for PELT to still operate inside it
        pelt_minimum = max(2 * int(self.pelt_min_size), 2)

        # For very small traces, avoid coarse splitting almost entirely
        if total_steps < 100:
            return max(pelt_minimum, int(total_steps // 2))
        
        # For normal and large traces, require at least 2% of the trace
        # But never less than the PELT-safe minimum
        adaptive_minimum = int(total_steps * 0.02)

        return max(pelt_minimum, adaptive_minimum)
    
    def _score_coarse_boundaries(self, steps):
        """
        Assign a score to each potential boundary between steps based on heuristics that may indicate a transition between different runtime episodes.
        """

        steps = list(steps or [])
        if len(steps) < 2:
            return {}
        
        timestamp_gaps = self._timestamp_gaps(steps)
        timestamp_gap_threshold = self._robust_gap_threshold(timestamp_gaps)

        boundary_scores = {}

        for index in range(1, len(steps)):
            previous_properties = self.utils.get_step_properties(steps[index - 1])
            current_properties = self.utils.get_step_properties(steps[index])

            score = 0.0

            # Strong signal:
            # The previous runtime episode returned to depth 0, and a new root-level call starts
            if self._is_root_episode_boundary(previous_properties, current_properties):
                score += 4.0

            # Weaker version of the same idea:
            # The trace transitions from a return to a call near the top of the call stack
            elif self._is_low_depth_transition(previous_properties, current_properties):
                score += 1.5

            # Temporal signal:
            # A large time gap can mean that the program was idle, waiting for input, or starting a new runtime activity
            timestamp_gap = timestamp_gaps[index]
            if timestamp_gap_threshold > 0 and timestamp_gap > timestamp_gap_threshold:
                gap_ratio = min(timestamp_gap / timestamp_gap_threshold, 2.0)
                score += 2.5 * gap_ratio

            # Static/dynamic component drift
            # Compare the source/target context before and after the boundary.
            # If the components around the boundary change strongly, this may be a transition between different runtime episodes.
            component_drift = self._component_drift_at_boundary(steps, index)

            if component_drift >= 0.75:
                score += 2.0
            elif component_drift >= 0.5:
                score += 1.0

            if score > 0.0:
                boundary_scores[index] = score

        return boundary_scores
    
    def _select_coarse_boundaries(self, steps, boundary_scores, min_segment_size):
        """
        Select the final coarse boundaries based on the scored potential boundaries.
        The key responsibilities:
        - Ignore weak boundary scores
        - Prefer stronger boundaries
        - Enforce min_segment_size
        - Avoid selecting many nearby boundaries
        - Return boundaries in trace order
        """

        steps = list(steps or [])
        total_steps = len(steps)

        if total_steps < 2:
            return []
        
        if not boundary_scores:
            return []
        
        try:
            min_segment_size = int(min_segment_size or 1)
        except (TypeError, ValueError):
            min_segment_size = 1

        min_segment_size = max(1, min_segment_size)

        # Keep only valid internal boundary indexes
        valid_candidates = {
            int(boundary): float(score)
            for boundary, score in boundary_scores.items()
            if 0 < int(boundary) < total_steps and float(score) > 0.0
        }

        if not valid_candidates:
            return []
        
        scores = np.asarray(list(valid_candidates.values()), dtype=float)

        median_score = float(np.median(scores))
        absolute_deviation = np.abs(scores - median_score)
        mad = float(np.median(absolute_deviation))

        # Adaptive score cutoff.
        # If scores vary a lot, require a candidate to stand out.
        # If scores are similar, the median itself becomes the adaptive part.
        if mad > 0.0:
            adaptive_cutoff = median_score + mad
        else:
            adaptive_cutoff = median_score

        # Absolute guard:
        # We do not want low-depth transitions alone, usually score 1.5, to create coarse splits.
        # A score around 2.5 means there is at least a stronger signal such as timestamp gap or component drift.
        minimum_cutoff = 2.5

        cutoff = max(minimum_cutoff, adaptive_cutoff)

        # Root-level episode boundaries usually score around 4.0.
        # Keep them even if the adaptive cutoff becomes higher because of unusually large timestamp-gap scores elsewhere in the trace.
        strong_boundary_score = 4.0

        candidate_items = [
            (boundary, score)
            for boundary, score in valid_candidates.items()
            if score >= cutoff or score >= strong_boundary_score
        ]

        # Fallback:
        # If no candidate survives but there is still one moderately strong candidate, keep only the strongest one, 
        # provided it respects the size constraints below.
        if not candidate_items:
            best_boundary, best_score = max(
                valid_candidates.items(),
                key=lambda item: item[1],
            )

            if best_score >= 3.0:
                candidate_items = [(best_boundary, best_score)]

        if not candidate_items:
            return []
        
        # Prefer high-confidence boundaries first.
        # If two candidates compete for the same region, the stronger one wins.
        candidate_items.sort(key=lambda item: item[1], reverse=True)

        selected_boundaries = []

        for boundary, _score in candidate_items:
            if self._boundary_respects_min_segment_size(
                boundary = boundary,
                selected_boundaries = selected_boundaries,
                total_steps = total_steps,
                min_segment_size = min_segment_size
            ):
                selected_boundaries.append(boundary)

        return sorted(selected_boundaries)    
    
    def _boundary_respects_min_segment_size(self, boundary, selected_boundaries, total_steps, min_segment_size):
        boundaries = sorted(selected_boundaries + [boundary])

        start = 0

        for current_boundary in boundaries:
            if current_boundary - start < min_segment_size:
                return False
            
            start = current_boundary

        if total_steps - start < min_segment_size:
            return False
        
        return True
    
    def _is_root_episode_boundary(self, previous_properties, current_properties) -> bool:
        previous_type = previous_properties.get("type")
        current_type = current_properties.get("type")

        previous_depth = self.utils.safe_float(previous_properties.get("depth"))
        current_depth = self.utils.safe_float(current_properties.get("depth"))

        return (
            previous_type == "return"
            and current_type == "call"
            and previous_depth <= 0.0
            and current_depth <= 0.0
        )
    
    def _is_low_depth_transition(self, previous_properties, current_properties) -> bool:
        previous_type = previous_properties.get("type")
        current_type = current_properties.get("type")

        previous_depth = self.utils.safe_float(previous_properties.get("depth"))
        current_depth = self.utils.safe_float(current_properties.get("depth"))

        return (
            previous_type == "return"
            and current_type == "call"
            and previous_depth <= 1.0
            and current_depth <= 1.0
        )
    
    def _component_drift_at_boundary(self, steps, boundary_index: int) -> float:
        window_size = min(25, max(5, int(math.sqrt(len(steps)))))

        left_start = max(0, boundary_index - window_size)
        right_end = min(len(steps), boundary_index + window_size)

        left_tokens = self._component_context_tokens_for_steps(steps[left_start:boundary_index])
        right_tokens = self._component_context_tokens_for_steps(steps[boundary_index:right_end])

        if not left_tokens or not right_tokens:
            return 0.0
        
        union = left_tokens | right_tokens

        if not union:
            return 0.0
        
        similarity = len(left_tokens & right_tokens) / float(len(union))

        return 1.0 - similarity
    
    def _component_context_tokens_for_steps(self, steps):
        tokens = set()

        for step in steps:
            properties = self.utils.get_step_properties(step)

            for key in ("sourceId", "targetId"):
                tokens.update(self._uri_context_tokens(properties.get(key)))

        return tokens

    def _uri_context_tokens(self, uri):
        if not uri:
            return set()
        
        value = str(uri)

        if ":///" in value:
            value = value.split(":///", 1)[1]

        value = value.split("(",1)[0]
        value = value.replace("\\", "/").replace("::", "/")

        parts = [part for part in re.split(r"[/#.$]+", value) if part]

        if not parts:
            return set()
        
        normalized_parts = [part.lower() for part in parts]

        tokens = set()

        tokens.add(f"root:{normalized_parts[0]}")

        if len(normalized_parts) > 1:
            tokens.add(f"parent:{normalized_parts[-2]}")

        for part in normalized_parts[:-1][-3:]:
            tokens.add(f"context:{part}")

        return tokens

    def _timestamp_gaps(self, steps):
        timestamps = []

        for step in steps:
            properties = self.utils.get_step_properties(step)
            timestamps.append(self._timestamp_to_seconds(properties.get("timestamp")))
        
        gaps = [0.0] * len(steps)

        for index in range(1, len(steps)):
            previous_timestamp = timestamps[index - 1]
            current_timestamp = timestamps[index]

            if previous_timestamp is None or current_timestamp is None:
                continue

            gap = current_timestamp - previous_timestamp

            if gap > 0:
                gaps[index] = gap

        return gaps
    
    def _robust_gap_threshold(self, gaps):
        positive_gaps = [gap for gap in gaps if gap > 0]

        if len(positive_gaps) < 3:
            return 0.0
        
        gap_values = np.asarray(positive_gaps, dtype=float)

        median_gap = float(np.median(gap_values))
        absolute_deviation = np.abs(gap_values - median_gap)
        mad = float(np.median(absolute_deviation))

        if mad == 0.0:
            return median_gap * 5.0 if median_gap > 0.0 else 0.0
        
        return median_gap + (3.0 * mad)

    def _timestamp_to_seconds(self, timestamp):
        if timestamp is None:
            return None
        
        if isinstance(timestamp, (int, float)):
            return self._normalize_numeric_timestamp(float(timestamp))
        
        if isinstance(timestamp, str):
            value = timestamp.strip()

            if not value:
                return None
            
            try:
                return self._normalize_numeric_timestamp(float(value))
            except ValueError:
                pass

            saboviz_match = re.match(
                r"^[A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+"
                r"\d{2}:\d{2}:\d{2}\s+\d{1,6}us\s+[+-]\d{4}$",
                value,
            )

            if saboviz_match:
                normalized_value = value.replace("us", "")
                try:
                    parsed = datetime.datetime.strptime(
                        normalized_value,
                        "%a, %d %b %Y %H:%M:%S %f %z",
                    )
                    return parsed.timestamp()
                except ValueError:
                    return None

            normalized_value = value.replace("Z", "+00:00")

            try:
                return datetime.datetime.fromisoformat(normalized_value).timestamp()
            except ValueError:
                return None
            
        return None

    def _normalize_numeric_timestamp(self, value: float) -> float:
        if abs(value) > 1_000_000_000_000:
            return value / 1000.0
        
        return value
    