import math

import numpy as np
import ruptures as rpt

class PeltTraceSegmenter:
    def __init__(
            self, 
            base_penalty=30.0, 
            pelt_min_size=3,
            min_segment_fraction=0.08,
            absolute_min_segment_size=20,
            sqrt_min_segment_multiplier=2.0,
        ):
        self.base_penalty = base_penalty
        self.pelt_min_size = pelt_min_size
        self.min_segment_fraction = min_segment_fraction
        self.absolute_min_segment_size = absolute_min_segment_size
        self.sqrt_min_segment_multiplier = sqrt_min_segment_multiplier

    def apply(self, embedded_segments):
        """
        Apply stable multi-penalty PELT to each embedded coarse segment.

        The algorithm automatically runs PELT with several penalties and keeps only
        stable boundaries.
        """

        pelt_segments = []

        for embedded_segment in embedded_segments:
            if not embedded_segment:
                continue

            vectors = [
                step.get("embedding", [])
                for step in embedded_segment
            ]

            change_points = self._run_stable_pelt(vectors)
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
    
    def _run_stable_pelt(self, vectors):
        trace_length = len(vectors)

        if trace_length == 0:
            return []
        
        penalties = self._adaptive_penalty_grid(trace_length)

        all_boundaries = []

        for penalty in penalties:       
            boundaries = self._run_pelt(
                vectors = vectors,
                penalty = penalty,
            )

            all_boundaries.extend(boundaries)

        return self._select_stable_boundaries(
            boundaries = all_boundaries,
            trace_length = trace_length,
            penalty_count = len(penalties),
        )
    
    def _run_pelt(self, vectors, penalty):
        trace_length = len(vectors)

        if trace_length == 0:
            return []
        
        if not self._has_valid_vectors(vectors):
            return []

        min_size = self._effective_min_size(trace_length)

        if trace_length < 2 * min_size:
            min_size = max(1, trace_length // 2)

        if min_size <= 0 or trace_length < 2:
            return []
        
        signal = np.asarray(vectors, dtype=float)

        if signal.ndim != 2 or signal.shape[0] != trace_length:
            return []
        
        signal = self._normalize_signal(signal)

        try:
            model = rpt.Pelt(model="l2", min_size=min_size, jump=1)

            breakpoints = model.fit(signal).predict(pen=float(penalty))
        except Exception:
            return []

        change_points = [
            point
            for point in breakpoints
            if 0 < point < trace_length
        ]

        return sorted(set(change_points))

    def _has_valid_vectors(self, vectors):
        if not vectors:
            return False

        first_vector_size = len(vectors[0]) if vectors[0] else 0

        if first_vector_size == 0:
            return False

        for vector in vectors:
            if not vector:
                return False

            if len(vector) != first_vector_size:
                return False

        return True
    
    def _normalize_signal(self, signal):
        if signal.size == 0:
            return signal
        
        mean = signal.mean(axis=0)
        std = signal.std(axis=0)

        std[std == 0] = 1.0

        return (signal - mean) / std
    
    def _effective_min_size(self, trace_length):
        if trace_length <= 1:
            return 1
        
        base_minimum = max(1, int(self.pelt_min_size))

        proportional_minimum = int(math.ceil(trace_length * self.min_segment_fraction))

        sqrt_limited_minimum = int(math.ceil(math.sqrt(trace_length) * self.sqrt_min_segment_multiplier))

        adaptive_minimum = min(proportional_minimum, sqrt_limited_minimum)

        desired_minimum = max(base_minimum, int(self.absolute_min_segment_size), adaptive_minimum)

        max_supported_minimum = max(1, trace_length // 2)

        return min(desired_minimum, max_supported_minimum)
    
    def _adaptive_penalty_grid(self, trace_length):
        base_penalty = float(self.base_penalty)
        min_size = self._effective_min_size(trace_length)

        if min_size <= 0:
            min_size = 1

        max_meaningful_segments = max(1, int(trace_length / float(min_size)))

        if max_meaningful_segments <= 3:
            multipliers = [2.0, 3.0, 4.0, 6.0]
        elif max_meaningful_segments <= 6:
            multipliers = [1.25, 1.75, 2.5, 3.5, 5.0]
        elif max_meaningful_segments <= 12:
            multipliers = [0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
        else:
            multipliers = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]

        return [
            max(1.0, base_penalty * multiplier)
            for multiplier in multipliers
        ]
    
    def _select_stable_boundaries(self, boundaries, trace_length, penalty_count):
        if not boundaries:
            return []
        
        min_segment_size = self._effective_min_size(trace_length)
        tolerance = self._stable_boundary_tolerance(trace_length=trace_length, min_segment_size=min_segment_size)
        min_votes = self._minimum_boundary_votes(trace_length=trace_length, min_segment_size=min_segment_size, penalty_count=penalty_count)

        groups = self._group_nearby_boundaries(boundaries=boundaries, tolerance=tolerance)

        candidate_boundaries = []

        for group in groups:
            if len(group) < min_votes:
                continue

            stable_boundary = int(round(sum(group) / float(len(group))))

            if 0 < stable_boundary < trace_length:
                candidate_boundaries.append({
                    "boundary": stable_boundary,
                    "votes": len(group),
                })

        if not candidate_boundaries:
            return []
        
        candidate_boundaries.sort(
            key=lambda item: (
                item["votes"],
                -abs(item["boundary"] - trace_length / 2.0)
            ),
            reverse=True,
        )

        selected_boundaries = []

        for candidate in candidate_boundaries:
            boundary = candidate["boundary"]

            if self._boundary_respects_min_segment_size(
                boundary=boundary,
                selected_boundaries=selected_boundaries,
                trace_length=trace_length,
                min_segment_size=min_segment_size,
            ):
                selected_boundaries.append(boundary)
        
        return sorted(set(selected_boundaries))
    
    def _group_nearby_boundaries(self, boundaries, tolerance):
        sorted_boundaries = sorted(boundaries)
        groups = []

        current_group = []

        for boundary in sorted_boundaries:
            if not current_group:
                current_group.append(boundary)
                continue

            group_center = sum(current_group) / float(len(current_group))

            if abs(boundary - group_center) <= tolerance:
                current_group.append(boundary)
            else:
                groups.append(current_group)
                current_group = [boundary]

        if current_group:
            groups.append(current_group)

        return groups
    
    def _stable_boundary_tolerance(self, trace_length, min_segment_size):
        if trace_length <= 0:
            return 2
        
        tolerance_from_segment_size = int(round(min_segment_size * 0.25))

        tolerance_from_trace_length = int(round(trace_length * 0.01))

        return max(2, min(tolerance_from_segment_size, tolerance_from_trace_length))
    
    def _minimum_boundary_votes(self, trace_length, min_segment_size, penalty_count):
        if penalty_count <= 1:
            return 1
        
        max_meaningful_segments = max(1, int(trace_length / float(min_segment_size)))

        if max_meaningful_segments <= 3:
            required_fraction = 0.75
        elif max_meaningful_segments <= 6:
            required_fraction = 0.6
        elif max_meaningful_segments <= 12:
            required_fraction = 0.45
        else:
            required_fraction = 0.3

        return max(2, int(math.ceil(penalty_count * required_fraction)))
    
    def _boundary_respects_min_segment_size(self, boundary, selected_boundaries, trace_length, min_segment_size):
        boundaries = sorted(selected_boundaries + [boundary])
        start = 0

        for current_boundary in boundaries:
            if current_boundary - start < min_segment_size:
                return False
            
            start = current_boundary

        if trace_length - start < min_segment_size:
            return False
        
        return True