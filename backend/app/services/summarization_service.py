import json
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Set

from app.models.graph import Node, Edge
from app.services.graph_service import GraphService
from app.services.llm_summarization.llm_client import LLMClient
from app.services.rascal_service import HOST_DATA_PATH
from app.services.llm_summarization.llm_templates import (
    analyze_operation_tool,
    analyze_type_tool,
    analyze_scope_tool,
    analyze_file_tool,
    analyze_folder_tool,
    analyze_project_tool,
    analyze_feature_tool
)
from app.services.sabo_gen.config import *

class SummarizationService:
    def __init__(self, db: Session):
        self.db = db
        self.graph_service = GraphService(db)
        self.llm = LLMClient()

        self.nodes_map: Dict[str, Node] = {}
        self.outbound_edges: Dict[str, List[Edge]] = {}
        self.children_map: Dict[str, List[Node]] = {}
        self.snippets: Dict[str, str] = {}

        # "UNVISITED" (not in dict), "IN_PROGRESS", or "SUMMARIZED"
        self.node_states: Dict[str, str] = {}

        self.shallow_summaries: Dict[str, Dict[str, Any]] = {}

    def run_summarization(self, project_id: int):
        try:
            if not self.llm.is_enabled:
                return

            self.graph_service.change_project_status(project_id, "summarizing", "Summarizing architecture with AI...")

            nodes = self.graph_service.get_all_nodes(project_id)
            edges = self.graph_service.get_all_edges(project_id)

            for n in nodes:
                self.nodes_map[n.id] = n
                self.outbound_edges[n.id] = []

                if n.parent_id:
                    if n.parent_id not in self.children_map:
                        self.children_map[n.parent_id] = []
                    self.children_map[n.parent_id].append(n)

            for e in edges:
                if e.source_id in self.outbound_edges:
                    self.outbound_edges[e.source_id].append(e)

            snippets_path = HOST_DATA_PATH / str(project_id) / "FullProject_snippets.json"
            if snippets_path.exists():
                with open(snippets_path, 'r', encoding='utf-8') as f:
                    self.snippets = json.load(f)

            roots = self.graph_service.get_project_roots(project_id)

            for root in roots:
                self.summarize_dfs(root.id)

            # self.graph_service.change_project_status(project_id, "ready", "AI Summarization complete.")
        
        except Exception as e:
            self.graph_service.change_project_status(project_id, "error", f"Summarization failed: {str(e)[:500]}")
            print(f"Summarization failed: {str(e)[:500]}")

    def summarize_dfs(self, node_id: str) -> Dict[str, Any]:
        if node_id not in self.nodes_map:
            return {}
        
        state = self.node_states.get(node_id)
        node = self.nodes_map[node_id]

        if state == "IN_PROGRESS":
            if node_id not in self.shallow_summaries:
                name = node.properties.get("simpleName", node_id)
                partial_child_summaries = {}

                for edge in self.outbound_edges.get(node_id, []):
                    child_id = edge.target_id
                    child_state = self.node_states.get(child_id)

                    if child_state == "SUMMARIZED":
                        child_node = self.nodes_map.get(child_id)
                        if child_node and child_node.ai_summary and "description" in child_node.ai_summary:
                            child_name = child_node.properties.get("simpleName", child_id)
                            edge_category = edge.label

                            if edge_category not in partial_child_summaries:
                                partial_child_summaries[edge_category] = []
                            partial_child_summaries[edge_category].append(f"{child_name}: {child_node.ai_summary['description']}")

                shallow_summary = self.generate_summary_for_node(node, partial_child_summaries)
                self.shallow_summaries[node_id] = shallow_summary

            return self.shallow_summaries[node_id]
        
        if state == "SUMMARIZED":
            return node.ai_summary or {}
        
        self.node_states[node_id] = "IN_PROGRESS"

        child_summaries = {}

        for edge in self.outbound_edges.get(node.id, []):
            target_id = edge.target_id

            target_node = self.nodes_map.get(target_id)
            if target_node and NODE_VARIABLE in target_node.labels:
                continue

            target_summary = self.summarize_dfs(target_id)
            if target_summary and "description" in target_summary:
                target_name = target_node.properties.get("simpleName", target_id)
                edge_category = edge.label

                if edge_category not in child_summaries:
                    child_summaries[edge_category] = []
                child_summaries[edge_category].append(f"{target_name}: {target_summary['description']}")

        summary = self.generate_summary_for_node(node, child_summaries)

        node.ai_summary = summary
        self.graph_service.update_node(node)

        self.node_states[node_id] = "SUMMARIZED"

        return summary
    
    def generate_summary_for_node(self, node: Node, child_summaries: Dict[str, List[str]]) -> Dict[str, Any]:
        labels = node.labels
        name = node.properties.get("simpleName", node.id)

        try:
            if NODE_OPERATION in labels:
                return self.prompt_operation(node.id, name, child_summaries)
            elif NODE_TYPE in labels:
                return self.prompt_type(name, child_summaries)
            elif NODE_SCOPE in labels:
                return self.prompt_scope(name, child_summaries)
            elif NODE_FILE in labels:
                return self.prompt_file(name, child_summaries)
            elif NODE_FOLDER in labels:
                return self.prompt_folder(name, child_summaries)
            elif NODE_PROJECT in labels:
                return self.prompt_project(name, child_summaries)
            else:
                return {"description": "(Skipped - Unsupported Node Type)"}
        except Exception as e:
            print(f"Failed to summarize {name}: {e}")
            return {"description": "(Analysis failed)"}
        
    def prompt_operation(self, node_id: str, name: str, child_summaries: dict) -> dict:
        source_code = self.snippets.get(node_id, "Source code not available.")

        prompt = f"Analyze the following Operation (Method/Function) named '{name}'.\n\n"
        prompt += f"### Source Code:\n```cpp\n{source_code}\n```\n\n"

        if EDGE_INVOKES in child_summaries:
            prompt += "\n### It invokes the following operations:\n"
            for item in child_summaries[EDGE_INVOKES]:
                prompt += f"- {item}\n"

        if EDGE_INSTANTIATES in child_summaries:
            prompt += "\n### It instantiates the following types:\n"
            for item in child_summaries[EDGE_INSTANTIATES]:
                prompt += f"- {item}\n"

        if EDGE_RETURNS in child_summaries:
            prompt += "\n### It returns the following types:\n"
            for item in child_summaries[EDGE_RETURNS]:
                prompt += f"- {item}\n"

        return self.llm.generate_json(prompt, analyze_operation_tool)
    
    def prompt_type(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following Type (Class/Struct) named '{name}'.\n\n"

        if EDGE_ENCAPSULATES in child_summaries:
            prompt += "\n### It encapsulates the following operations (methods):\n"
            for item in child_summaries[EDGE_ENCAPSULATES]:
                prompt += f"- {item}\n"

        if EDGE_SPECIALIZES in child_summaries:
            prompt += "\n### It inherits (specializes) from:\n"
            for item in child_summaries[EDGE_SPECIALIZES]:
                prompt += f"- {item}\n"
        
        if not child_summaries:
            prompt += "\nNo enclosed operations found. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_type_tool)
    
    def prompt_scope(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following Scope (Namespaces/Packages) named '{name}'.\n\n"
        
        if EDGE_ENCLOSES in child_summaries:
            prompt += "\n### It encloes the following Scope, Type or Operation:\n"
            for item in child_summaries[EDGE_ENCLOSES]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis scope is empty. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_scope_tool)
    
    def prompt_file(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following File named '{name}'. \n\n"

        if EDGE_DECLARES in child_summaries:
            prompt += "\n### It declares the following functional elements:\n"
            for item in child_summaries[EDGE_DECLARES]:
                prompt += f"- {item}\n"

        if EDGE_REQUIRES in child_summaries:
            prompt += "\n### It requires the following File:\n"
            for item in child_summaries[EDGE_REQUIRES]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis file is empty. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_file_tool)
    
    def prompt_folder(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following Folder named '{name}'. \n\n"

        if EDGE_CONTAINS in child_summaries:
            prompt += "\n### It contanins the following File/Folder:\n"
            for item in child_summaries[EDGE_CONTAINS]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis folder is empty. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_folder_tool)

    def prompt_project(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following Project named '{name}'. \n\n"

        if EDGE_INCLUDES in child_summaries:
            prompt += "\n### It includes the following Folder:\n"
            for item in child_summaries[EDGE_INCLUDES]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis project is empty. Describe it based on its name."

        return self.llm.generate_json(prompt, analyze_project_tool)
    
    def prompt_feature(self, nodes: list[Node], edges: list[Edge], is_infrastructure=False) -> dict:
        prompt = "Analyze the following cluster of tightly coupled software operations that make up a distinct software feature.\n\n"
        prompt += "CRITICAL INSTRUCTION: Name the feature based strictly on the exact operations present. Do not imply the existence of a broader system. If the cluster only lists or reads data, the name must reflect 'Listing' or 'Retrieval', not general 'Management'.\n\n"
        prompt += "The feature name MUST follow this format: [Specific Action/Verb] + [Entity] + [Context].\n"
        prompt += "Examples: 'Encrypted Password Retrieval', 'Database Item Listing', 'Invoice PDF Generation'.\n\n"
        
        if is_infrastructure:
            prompt += "NOTE: This cluster is a cross-cutting **Infrastructure Feature**.\n"
            prompt += "Determine its exact technical or framework-level purpose.\n"
        else:
            prompt += "NOTE: This cluster is a domain-specific **Business Feature**.\n"
            prompt += "Determine its exact business capability or user-facing workflow.\n"
            
        prompt += "### Operations in this Feature Cluster:\n"

        node_lookup = {}
        for node in nodes:
            name = node.properties.get("simpleName", node.id)
            node_lookup[node.id] = name
            summary = node.ai_summary.get("description", "") if node.ai_summary else "No summary available."
            prompt += f"- {name}: {summary}\n"

        if edges:
            prompt += "\n### Execution Flow:\n"
            for edge in edges:
                source_name = node_lookup.get(edge.source_id)
                target_name = node_lookup.get(edge.target_id)

                if source_name and target_name:
                    prompt += f"- {source_name} --[{edge.label}]--> {target_name}\n"

        return self.llm.generate_json(prompt, analyze_feature_tool)