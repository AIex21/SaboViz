from __future__ import annotations

from typing import TYPE_CHECKING

import igraph as ig
import leidenalg as leidenalg
import networkx as nx
import numpy as np

if TYPE_CHECKING:
    from app.services.func_decomp_service import FunctionalDecompositionService


class GraphCommunityDecomposition:
    def __init__(self, service: "FunctionalDecompositionService"):
        self.service = service

    def _build_coexecution_graph(self, X: np.ndarray, all_functions, min_weight: float):
        graph = nx.Graph()
        graph.add_nodes_from(all_functions)

        if X.size == 0:
            return graph

        # Build weighted links between functions based on Jaccard co-execution across traces.
        frequencies = X.sum(axis=1).astype(float)
        intersections = X @ X.T

        num_ops = len(all_functions)
        for i in range(num_ops):
            for j in range(i + 1, num_ops):
                intersection = float(intersections[i, j])
                if intersection <= 0.0:
                    continue

                union = float(frequencies[i] + frequencies[j] - intersection)
                if union <= 0.0:
                    continue

                weight = intersection / union
                if weight >= min_weight:
                    graph.add_edge(all_functions[i], all_functions[j], weight=float(weight))

        return graph

    def _detect_communities(self, graph: nx.Graph, resolution: float):
        if graph.number_of_nodes() == 0:
            return []

        if graph.number_of_edges() == 0:
            return [{node} for node in graph.nodes]

        node_list = list(graph.nodes)
        node_to_idx = {node_id: idx for idx, node_id in enumerate(node_list)}

        edges = []
        weights = []
        for source, target, data in graph.edges(data=True):
            edges.append((node_to_idx[source], node_to_idx[target]))
            weights.append(float(data.get("weight", 1.0)))

        # Leiden optimizes modularity-like quality and returns dense functional communities.
        ig_graph = ig.Graph(n=len(node_list), edges=edges, directed=False)
        partition = leidenalg.find_partition(
            ig_graph,
            leidenalg.RBConfigurationVertexPartition,
            weights=weights,
            resolution_parameter=float(resolution),
            seed=42,
        )

        communities = []
        for cluster in partition:
            communities.append({node_list[idx] for idx in cluster})

        if not communities:
            return [{node} for node in graph.nodes]

        return communities

    def _compute_association_scores(self, graph: nx.Graph, communities):
        if not communities:
            return {}, {}

        node_to_community = {}
        for cid, community in enumerate(communities):
            for node in community:
                node_to_community[node] = cid

        association_scores = {}
        for node in graph.nodes:
            strengths = np.zeros(len(communities), dtype=float)
            total_strength = 0.0

            for neighbor, edge_data in graph[node].items():
                weight = float(edge_data.get("weight", 0.0))
                if weight <= 0.0:
                    continue
                total_strength += weight

                neighbor_community = node_to_community.get(neighbor)
                if neighbor_community is not None:
                    strengths[neighbor_community] += weight

            if total_strength > 0.0:
                association_scores[node] = {
                    cid: float(strengths[cid] / total_strength) for cid in range(len(communities))
                }
            else:
                primary_cid = node_to_community.get(node)
                association_scores[node] = {
                    cid: (1.0 if cid == primary_cid else 0.0) for cid in range(len(communities))
                }

        return association_scores, node_to_community

    def _compute_participation_coefficients(self, graph: nx.Graph, communities):
        if not communities:
            return {}

        node_to_community = {}
        for cid, community in enumerate(communities):
            for node in community:
                node_to_community[node] = cid

        participation = {}
        for node in graph.nodes:
            k_i = 0.0
            k_is = np.zeros(len(communities), dtype=float)

            for neighbor, edge_data in graph[node].items():
                weight = float(edge_data.get("weight", 0.0))
                if weight <= 0.0:
                    continue
                k_i += weight

                neighbor_community = node_to_community.get(neighbor)
                if neighbor_community is not None:
                    k_is[neighbor_community] += weight

            if k_i <= 0.0:
                participation[node] = 0.0
                continue

            # High participation means a node bridges communities and is likely infrastructure.
            dispersion = np.sum((k_is / k_i) ** 2)
            participation[node] = float(1.0 - dispersion)

        return participation

    def _otsu_threshold(self, values, bins=32):
        arr = np.asarray(values, dtype=float)
        if arr.size == 0:
            return 1.0

        arr_min = float(np.min(arr))
        arr_max = float(np.max(arr))
        if np.isclose(arr_min, arr_max):
            return arr_max + 1e-9

        hist, bin_edges = np.histogram(arr, bins=bins, range=(arr_min, arr_max))
        total = np.sum(hist)
        if total == 0:
            return float(np.quantile(arr, 0.8))

        prob = hist.astype(float) / total
        omega = np.cumsum(prob)
        centers = (bin_edges[:-1] + bin_edges[1:]) / 2.0
        mu = np.cumsum(prob * centers)
        mu_total = mu[-1]

        denom = omega * (1.0 - omega)
        denom = np.where(denom == 0.0, 1e-12, denom)
        sigma_b = ((mu_total * omega - mu) ** 2) / denom

        best_idx = int(np.argmax(sigma_b))
        return float(centers[best_idx])

    def run(
        self,
        project_id: int,
        traces,
        X: np.ndarray,
        all_functions,
        summarizer,
        allow_ai: bool,
        node_lookup,
        overlap_alpha: float,
        leiden_resolution: float,
    ):
        graph = self._build_coexecution_graph(X, all_functions, self.service.MIN_COEXEC_WEIGHT)
        resolution = leiden_resolution if leiden_resolution is not None else self.service.LEIDEN_RESOLUTION
        communities = self._detect_communities(graph, resolution)
        if not communities:
            return

        assoc_scores, node_primary_map = self._compute_association_scores(graph, communities)
        participation = self._compute_participation_coefficients(graph, communities)

        frequency = X.sum(axis=1).astype(float)
        trace_count = max(len(traces), 1)
        normalized_frequency = {
            all_functions[idx]: float(frequency[idx] / trace_count) for idx in range(len(all_functions))
        }

        specificity = {
            node: float(max(scores.values()) if scores else 0.0)
            for node, scores in assoc_scores.items()
        }

        infra_scores = []
        for node in all_functions:
            freq_score = normalized_frequency.get(node, 0.0)
            participation_score = participation.get(node, 0.0)
            specificity_score = specificity.get(node, 0.0)

            # Combined infrastructure score: frequent + cross-cutting + not strongly feature-specific.
            combined_score = (0.45 * freq_score) + (0.35 * participation_score) + (0.20 * (1.0 - specificity_score))
            infra_scores.append(combined_score)

        infra_threshold_dynamic = self._otsu_threshold(infra_scores)
        infrastructure_nodes = {
            node for node, score in zip(all_functions, infra_scores) if score >= infra_threshold_dynamic
        }

        feature_members = {cid: set() for cid in range(len(communities))}

        for node in all_functions:
            if node in infrastructure_nodes:
                continue

            scores = assoc_scores.get(node, {})
            if scores:
                primary_cid = max(scores, key=scores.get)
                primary_score = float(scores[primary_cid])
            else:
                primary_cid = node_primary_map.get(node, 0)
                primary_score = 1.0

            feature_members[primary_cid].add(node)

            # Optional overlap assignment: keep nodes in multiple communities when affiliation is similar.
            if primary_score > 0.0:
                for cid, score in scores.items():
                    if cid == primary_cid:
                        continue
                    ratio = float(score / primary_score)
                    if ratio >= overlap_alpha:
                        feature_members[cid].add(node)

        for cid, members in feature_members.items():
            if not members:
                continue

            components = sorted(members)
            default_name = f"Feature_{self.service.generate_feature_name(components)}"
            self.service.persist_feature(
                project_id=project_id,
                components=components,
                category="Feature",
                default_name=default_name,
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
            )

        if infrastructure_nodes:
            infra_components = sorted(infrastructure_nodes)
            self.service.persist_feature(
                project_id=project_id,
                components=infra_components,
                category="Infrastructure",
                default_name="Common Utilities",
                summarizer=summarizer,
                allow_ai=allow_ai,
                node_lookup=node_lookup,
            )
