import numpy as np
import ruptures as rpt

class PeltTraceSegmenter:
    def __init__(self, base_penalty=30.0, pelt_min_size=3):
        self.base_penalty = base_penalty
        self.pelt_min_size = pelt_min_size

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
        n = len(vectors)

        if n == 0:
            return []
        
        penalties = self._adaptive_penalty_grid(n)

        all_boundaries = []

        for penalty in penalties:
            boundaries = self._run_pelt(
                vectors = vectors,
                penalty = penalty,
            )

            all_boundaries.extend(boundaries)

        return self._select_stable_boundaries(
            boundaries = all_boundaries,
            trace_length = n,
            penalty_count = len(penalties),
        )
    
    def _run_pelt(self, vectors, penalty):
        n = len(vectors)

        if n == 0:
            return []
        
        min_size = max(1, int(self.pelt_min_size))

        if n < 2 * min_size:
            return []
        
        if not self._has_valid_vectors(vectors):
            return []
        
        signal = np.asarray(vectors, dtype=float)

        if signal.ndim != 2 or signal.shape[0] != n:
            return []
        
        signal = self._normalize_signal(signal)

        model = rpt.Pelt(
            model="l2",
            min_size = min_size,
            jump = 1,
        )

        breakpoints = model.fit(signal).predict(pen=float(penalty))

        change_points = [
            point
            for point in breakpoints
            if 0 < point < n
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
    
    def _adaptive_penalty_grid(self, trace_length):
        base_penalty = float(self.base_penalty)

        if trace_length < 100:
            multipliers = [0.75, 1.0, 1.5, 2.0]
        elif trace_length < 1000:
            multipliers = [0.5, 0.75, 1.0, 1.5, 2.0]
        else:
            multipliers = [0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0]

        return [
            max(1.0, base_penalty * multiplier)
            for multiplier in multipliers
        ]
    
    def _select_stable_boundaries(self, boundaries, trace_length, penalty_count):
        if not boundaries:
            return []
        
        tolerance = max(2, int(trace_length * 0.01))

        min_votes = max(2, int(round(penalty_count * 0.30)))

        sorted_boundaries = sorted(boundaries)
        groups = []

        for boundary in sorted_boundaries:
            if not groups:
                groups.append([boundary])
                continue

            current_group = groups[-1]
            group_center = sum(current_group) / float(len(current_group))

            if abs(boundary - group_center) <= tolerance:
                current_group.append(boundary)
            else:
                groups.append([boundary])

        stable_boundaries = []

        for group in groups:
            if len(group) < min_votes:
                continue

            stable_boundary = int(round(sum(group) / float(len(group))))

            if 0 < stable_boundary < trace_length:
                stable_boundaries.append(stable_boundary)

        return sorted(set(stable_boundaries))