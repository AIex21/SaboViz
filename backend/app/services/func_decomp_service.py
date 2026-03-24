import importlib
import numpy as np
import re
from collections import Counter
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.cluster import AgglomerativeClustering
import networkx as nx
import igraph as ig
import leidenalg as leidenalg

from app.models.feature import Feature
from app.repositories.feature_repo import FeatureRepository
from app.services.trace_service import TraceService
from app.services.graph_service import GraphService
from app.services.summarization_service import SummarizationService

class FunctionalDecompositionService:
    def __init__(self, db: Session):
        self.db = db
        self.feature_repo = FeatureRepository(db)
        self.trace_service = TraceService(db)
        self.graph_service = GraphService(db)

        self.DISTANCE_THRESHOLD = 0.4
        self.INFRASTRUCTURE_THRESHOLD = 0.3
        self.OVERLAP_ALPHA = 0.8
        self.MIN_COEXEC_WEIGHT = 0.2
        self.LEIDEN_RESOLUTION = 1.8
        self.DECOMP_METHOD_AGGLOMERATIVE = "agglomerative"
        self.DECOMP_METHOD_GRAPH_COMMUNITY = "graph_community"

    def load_traces(self, project_id: int):
        traces = self.trace_service.get_project_traces(project_id)

        trace_data = []
        for trace in traces:
            data = self.trace_service.get_trace_file(trace.id)

            elements = data.get("elements", {})
            nodes = elements.get("nodes", [])

            executed_functions = set()
            for node in nodes:
                node_data = node.get("data", {})
                labels = node_data.get("labels", [])

                if "Action" in labels:
                    node_prop = node_data.get("properties", {})

                    sourceId = node_prop.get("sourceId")
                    if sourceId:
                        executed_functions.add(sourceId)

                    targetId = node_prop.get("targetId")
                    if targetId:
                        executed_functions.add(targetId)
            
            if executed_functions:
                trace_data.append({
                    "trace_id": trace.id,
                    "functions": executed_functions
                })
            
        return trace_data
    
    def build_feature_matrix(self, traces):
        if not traces:
            return np.array([]), []

        all_functions = sorted(list(set().union(*[trace["functions"] for trace in traces])))

        matrix_data = []

        for func in all_functions:
            row = []
            for trace in traces:
                row.append(1 if func in trace["functions"] else 0)
            matrix_data.append(row)

        X = np.array(matrix_data)

        return X, all_functions

    def build_coexecution_graph(self, X, all_functions):
        graph = nx.Graph()
        graph.add_nodes_from(all_functions)

        if X.size == 0:
            return graph

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
                if weight >= self.MIN_COEXEC_WEIGHT:
                    graph.add_edge(all_functions[i], all_functions[j], weight=float(weight))

        return graph

    def detect_communities(self, graph: nx.Graph, resolution: float):
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

        ig_graph = ig.Graph(n=len(node_list), edges=edges, directed=False)
        partition = leidenalg.find_partition(
            ig_graph,
            leidenalg.RBConfigurationVertexPartition,
            weights=weights,
            resolution_parameter=float(resolution),
            seed=42
        )

        communities = []
        for cluster in partition:
            communities.append({node_list[idx] for idx in cluster})

        if not communities:
            return [{node} for node in graph.nodes]

        return communities

    def compute_association_scores(self, graph: nx.Graph, communities):
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

    def compute_participation_coefficients(self, graph: nx.Graph, communities):
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

            dispersion = np.sum((k_is / k_i) ** 2)
            participation[node] = float(1.0 - dispersion)

        return participation

    def otsu_threshold(self, values, bins=32):
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

    def collect_nodes_with_ancestors(self, components, node_lookup):
        selected_by_db_id = {}

        for node_id in components:
            node = node_lookup.get(node_id)
            if not node:
                continue

            selected_by_db_id[node.db_id] = node

            # Propagate feature membership to logical parents/scopes.
            for ancestor_id in (node.ancestors or []):
                ancestor = node_lookup.get(ancestor_id)
                if ancestor:
                    selected_by_db_id[ancestor.db_id] = ancestor

            if node.parent_id:
                parent = node_lookup.get(node.parent_id)
                if parent:
                    selected_by_db_id[parent.db_id] = parent

        return list(selected_by_db_id.values())

    def persist_feature(self, project_id, components, category, default_name, summarizer, allow_ai, node_lookup):
        linked_nodes = self.collect_nodes_with_ancestors(components, node_lookup)
        if not linked_nodes:
            return

        feature_description = None
        feature_name = default_name

        if allow_ai:
            internal_edges = self.graph_service.get_edges_between_nodes(components)
            ai_result = summarizer.prompt_feature(linked_nodes, internal_edges, category == "Infrastructure")
            feature_name = ai_result.get("feature_name", default_name)
            feature_description = ai_result.get("description", None)

        feature = Feature(
            project_id=project_id,
            name=feature_name,
            description=feature_description,
            category=category,
            score=0.0
        )
        feature.nodes = linked_nodes
        self.feature_repo.create_feature_without_commit(feature)
    
    def frequency_filtering(self, X):
        tfidf = TfidfTransformer(norm='l2', use_idf=True, smooth_idf=True)
        X_weighted = tfidf.fit_transform(X.T).T.toarray()

        # Calculate IDF scores, Low IDF means high frequency and vice versa
        idfs = tfidf.idf_

        idf_min, idf_max = np.min(idfs), np.max(idfs)
        if idf_max - idf_min == 0:
            normalized_idfs = np.zeros(idfs.shape)
        else:
            normalized_idfs = (idfs - idf_min) / (idf_max - idf_min)

        return X_weighted, normalized_idfs
    
    def cluster_traces(self, X, distance_threshold):
        model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric='cosine',
            linkage='average'
        )
        labels = model.fit_predict(X)

        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)

        return clusters

    def generate_feature_name(self, components):
        words = []

        for uri in components:
            # Remove "cpp+method:///" and the parameters
            clean_name = uri.split(':///')[-1].split('(')[0]

            # Split into parts (Class/Method)
            parts = clean_name.replace('/', ' ').replace('::', ' ').replace('_', ' ').split()

            for part in parts:
                # Split camel case
                sub_parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)', part)

                if not sub_parts:
                    sub_parts = [part]

                for word in sub_parts:
                    words.append(word.capitalize())

        if not words:
            return "Feature_Unknown"
        
        counter = Counter(words)
        most_common = counter.most_common(2)

        name = "_".join([word for word, count in most_common])
        
        return name

    def run_functional_decomposition(
        self,
        project_id: int,
        distance_threshold: float = 0.4,
        infrastructure_threshold: float = 0.3,
        use_ai: bool = True,
        decomposition_method: str = "agglomerative",
        overlap_alpha: float = 0.8,
        leiden_resolution: float = 1.8
    ):
        self.graph_service.change_project_status(
            project_id,
            status="decomposing",
            description="Functional Decomposition started..."
        )

        traces = self.load_traces(project_id)
        if not traces:
            self.feature_repo.delete_features_by_project(project_id)
            self.graph_service.change_project_status(
                project_id,
                status="ready",
                description="Functional Decomposition completed. No traces with executable operations were found."
            )
            return

        X, all_functions = self.build_feature_matrix(traces)
        self.feature_repo.delete_features_by_project(project_id)

        summarizer = SummarizationService(self.db)
        is_llm_enabled = summarizer.llm.is_enabled
        allow_ai = use_ai and is_llm_enabled
        db_nodes = self.graph_service.get_all_nodes(project_id)
        node_lookup = {n.id: n for n in db_nodes}

        method = (decomposition_method or self.DECOMP_METHOD_AGGLOMERATIVE).strip().lower()

        if method == self.DECOMP_METHOD_GRAPH_COMMUNITY:
            graph = self.build_coexecution_graph(X, all_functions)
            resolution = leiden_resolution if leiden_resolution is not None else self.LEIDEN_RESOLUTION
            communities = self.detect_communities(graph, resolution)
            assoc_scores, node_primary_map = self.compute_association_scores(graph, communities)
            participation = self.compute_participation_coefficients(graph, communities)

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
                combined_score = (0.45 * freq_score) + (0.35 * participation_score) + (0.20 * (1.0 - specificity_score))
                infra_scores.append(combined_score)

            infra_threshold_dynamic = self.otsu_threshold(infra_scores)
            infrastructure_nodes = {
                node for node, score in zip(all_functions, infra_scores)
                if score >= infra_threshold_dynamic
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
                default_name = f"Feature_{self.generate_feature_name(components)}"
                self.persist_feature(
                    project_id=project_id,
                    components=components,
                    category="Feature",
                    default_name=default_name,
                    summarizer=summarizer,
                    allow_ai=allow_ai,
                    node_lookup=node_lookup
                )

            if infrastructure_nodes:
                infra_components = sorted(infrastructure_nodes)
                self.persist_feature(
                    project_id=project_id,
                    components=infra_components,
                    category="Infrastructure",
                    default_name="Common Utilities",
                    summarizer=summarizer,
                    allow_ai=allow_ai,
                    node_lookup=node_lookup
                )

        elif method == self.DECOMP_METHOD_AGGLOMERATIVE:
            X_weighted, idf_scores = self.frequency_filtering(X)
            clusters = self.cluster_traces(X_weighted, distance_threshold)

            db_nodes = self.graph_service.get_all_nodes(project_id)
            node_lookup = {n.id: n for n in db_nodes}

            for label, indices in clusters.items():
                avg_score = np.mean(idf_scores[indices])
                is_infrastructure = avg_score < infrastructure_threshold

                components = [all_functions[idx] for idx in indices]

                linked_nodes = self.collect_nodes_with_ancestors(components, node_lookup)
                if not linked_nodes:
                    continue

                feature_description = None
                if is_infrastructure:
                    category = "Infrastructure"
                    default_name = "Common Utilities"
                else:
                    category = "Feature"
                    default_name = f"Feature_{self.generate_feature_name(components)}"

                if allow_ai:
                    internal_edges = self.graph_service.get_edges_between_nodes(components)
                    ai_result = summarizer.prompt_feature(linked_nodes, internal_edges, is_infrastructure)
                    feature_name = ai_result.get("feature_name", default_name)
                    feature_description = ai_result.get("description", None)
                else:
                    feature_name = default_name

                feature = Feature(
                    project_id=project_id,
                    name=feature_name,
                    description=feature_description,
                    category=category,
                    score=float(avg_score)
                )
                feature.nodes = linked_nodes

                self.feature_repo.create_feature_without_commit(feature)

        else:
            raise ValueError(
                f"Unsupported decomposition_method '{decomposition_method}'. "
                f"Use '{self.DECOMP_METHOD_AGGLOMERATIVE}' or '{self.DECOMP_METHOD_GRAPH_COMMUNITY}'."
            )
        
        self.feature_repo.commit()

        self.graph_service.change_project_status(
            project_id,
            status="ready",
            description="Functional Decomposition successfully completed."
        )

    def get_features(self, project_id: int):
        return self.feature_repo.get_features_by_project(project_id)