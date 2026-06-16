import json
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Set, Optional

from app.models.graph import Node, Edge
from app.services.graph_service import GraphService
from app.services.llm_summarization.llm_client import LLMClient
from app.core.storage_paths import HOST_DATA_PATH, FULL_PROJECT_SNIPPETS_FILENAME
from app.services.llm_summarization.llm_templates import (
    analyze_operation_tool,
    analyze_type_tool,
    analyze_scope_tool,
    analyze_file_tool,
    analyze_folder_tool,
    analyze_project_tool,
    analyze_feature_tool,
    analyze_micro_feature_tool,
    analyze_hierarchical_feature_tool,
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
        self.summary_total = 0
        self.summary_done = 0
        self.active_project_id = None

    def _non_root_style_constraints(self) -> str:
        return (
            "Style constraints for this node summary:\n"
            "- Focus only on this node's local responsibility and relationships.\n"
            "- Do NOT restate the broader project/system domain (e.g., 'security system', 'semiconductor system').\n"
            "- Avoid repeating parent/root-level context unless strictly necessary for disambiguation.\n"
            "- Never use phrasing like 'in the <ProductName> application/system/platform'.\n"
            "- Start directly with the node behavior (verb + object), not with product context.\n"
        )

    def _should_summarize(self, node: Node) -> bool:
        labels = set(node.labels or [])
        if NODE_VARIABLE in labels:
            return False

        summarizable_labels = {
            NODE_OPERATION,
            NODE_TYPE,
            NODE_SCOPE,
            NODE_FILE,
            NODE_FOLDER,
            NODE_PROJECT,
        }

        return bool(labels & summarizable_labels)

    def _update_progress(self, node: Optional[Node] = None) -> None:
        if not self.active_project_id or self.summary_total <= 0:
            return
        percent = int((self.summary_done / self.summary_total) * 100) if self.summary_total else 0

        message = f"Summarizing: {self.summary_done}/{self.summary_total} ({percent}%)"
        if node is not None:
            name = node.properties.get("simpleName", node.id)
            message = f"{message} - {name}"

        self.graph_service.change_project_status(
            self.active_project_id,
            "summarizing",
            message
        )

    def _prepare_context(self, project_id: int):
        self.nodes_map = {}
        self.outbound_edges = {}
        self.children_map = {}
        self.node_states = {}
        self.shallow_summaries = {}
        self.snippets = {}
        self.summary_total = 0
        self.summary_done = 0
        self.active_project_id = project_id

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

        self.summary_total = sum(
            1 for node in self.nodes_map.values() if self._should_summarize(node)
        )

        snippets_path = HOST_DATA_PATH / str(project_id) / FULL_PROJECT_SNIPPETS_FILENAME
        if snippets_path.exists():
            with open(snippets_path, 'r', encoding='utf-8') as f:
                self.snippets = json.load(f)

    def run_summarization(self, project_id: int):
        try:
            if not self.llm.is_enabled:
                return

            self.graph_service.change_project_status(project_id, "summarizing", "Summarizing architecture with AI...")
            self._prepare_context(project_id)
            self._update_progress()

            roots = self.graph_service.get_project_roots(project_id)

            for root in roots:
                self.summarize_dfs(root.id)

            self.graph_service.change_project_status(project_id, "ready", "AI Summarization complete.")
        
        except Exception as e:
            self.graph_service.change_project_status(project_id, "error", f"Summarization failed: {str(e)[:500]}")
            print(f"Summarization failed: {str(e)[:500]}")

    def summarize_single_node(self, project_id: int, node_id: str) -> Dict[str, Any]:
        if not self.llm.is_enabled:
            raise ValueError("AI summarization is disabled.")

        self.graph_service.change_project_status(project_id, "summarizing", f"Summarizing architecture with AI for {node_id}...")
        self._prepare_context(project_id)

        if node_id not in self.nodes_map:
            raise ValueError("Node not found in project.")

        summary = self.summarize_dfs(node_id)
        self.graph_service.change_project_status(project_id, "ready", "AI Summarization complete.")

        return summary

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
        if self._should_summarize(node):
            self.summary_done += 1
            self._update_progress(node)

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
        prompt += self._non_root_style_constraints() + "\n"
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
        prompt += self._non_root_style_constraints() + "\n"

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
        prompt += self._non_root_style_constraints() + "\n"
        
        if EDGE_ENCLOSES in child_summaries:
            prompt += "\n### It encloes the following Scope, Type or Operation:\n"
            for item in child_summaries[EDGE_ENCLOSES]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis scope is empty. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_scope_tool)
    
    def prompt_file(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following File named '{name}'. \n\n"
        prompt += self._non_root_style_constraints()
        prompt += "- Do not produce a section that just repeats child names. Summarize concrete file-level responsibilities instead.\n\n"

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
        prompt += self._non_root_style_constraints() + "\n"

        if EDGE_CONTAINS in child_summaries:
            prompt += "\n### It contains the following File/Folder:\n"
            for item in child_summaries[EDGE_CONTAINS]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis folder is empty. Describe it based on its name.\n"

        return self.llm.generate_json(prompt, analyze_folder_tool)

    def prompt_project(self, name: str, child_summaries: dict) -> dict:
        prompt = f"Analyze the following Project named '{name}'. \n\n"
        prompt += "This is the root/system-level node: include overall domain and architectural context.\n\n"

        if EDGE_INCLUDES in child_summaries:
            prompt += "\n### It includes the following Folder:\n"
            for item in child_summaries[EDGE_INCLUDES]:
                prompt += f"- {item}\n"

        if not child_summaries:
            prompt += "\nThis project is empty. Describe it based on its name."

        return self.llm.generate_json(prompt, analyze_project_tool)
    
    def prompt_feature(self, operation_nodes: list[Node], is_infrastructure: bool = False) -> dict:
        feature_kind = "Infrastructure Feature" if is_infrastructure else "Business/User-Facing Feature"

        prompt_lines = [
            f"Analyze the following cluster of software functions/operations as one {feature_kind}.",
            "",
            "This cluster was produced from dynamic execution traces.",
            "The listed functions are the evidence for the feature.",
            "Do not infer broader system context from files, classes, namespaces, or project names.",
            "",
            "### Functions/Operations in This Feature Cluster",
        ]

        for node in operation_nodes:
            name = node.properties.get("simpleName", node.id)

            summary = "No summary available."
            if node.ai_summary and isinstance(node.ai_summary, dict):
                summary = node.ai_summary.get("description") or summary

            prompt_lines.append(f"- {name}: {summary}")

        prompt_lines.append("")
        prompt_lines.append("FINAL INSTRUCTIONS (APPLY THESE RIGHT BEFORE RETURNING JSON):")
        prompt_lines.append("- Name the feature strictly from the functions/operations listed above.")
        prompt_lines.append("- Use the function descriptions only as supporting semantic context.")
        prompt_lines.append("- Do not introduce entities, workflows, files, classes, modules, or system context not present in the listed functions.")
        prompt_lines.append("- Do NOT include project/system labels in feature_name or description.")
        prompt_lines.append("- Keep the same terminology used in the provided function names/summaries whenever possible.")
        prompt_lines.append("- If uncertain, reuse exact operation wording instead of abstracting.")
        prompt_lines.append("- The description MUST explicitly state what this function cluster includes, using concrete operation groups or responsibilities.")
        prompt_lines.append("- feature_context should be empty unless needed for disambiguation.")

        if is_infrastructure:
            prompt_lines.append("- This is a cross-cutting Infrastructure Feature made of shared technical utilities used across multiple traces/features.")
            prompt_lines.append("- Do not try to force a user-facing/business workflow name.")
            prompt_lines.append("- Name format for infrastructure: [Scope/Qualifier] + [Shared Capability].")
            prompt_lines.append("- Examples: 'Common Validation Utilities', 'Shared Runtime Utilities', 'Core Parsing Utilities'.")
            prompt_lines.append("- The description should start with 'Includes:' and list concrete utilities/capabilities represented by the operations.")
            prompt_lines.append("- Avoid broad names like 'Common Utilities' if the listed functions reveal a more specific utility capability.")
        else:
            prompt_lines.append("- This is a domain-specific business or user-facing feature.")
            prompt_lines.append("- Determine the exact capability represented by the listed functions.")
            prompt_lines.append("- Name format for business features: [Specific Action/Verb] + [Entity] + optional [Context].")
            prompt_lines.append("- Examples: 'Adding Product Records', 'Listing Inventory Items', 'Generating Invoice PDFs'.")
            prompt_lines.append("- Avoid generic infrastructure-style names like 'Common Utilities'.")
            prompt_lines.append("- Avoid broad names like 'Management', 'Processing', or 'Handling' when a more specific action is visible.")

        prompt = "\n".join(prompt_lines) + "\n"

        return self.llm.generate_json(prompt, analyze_feature_tool)

    def prompt_micro_feature(self, operation_nodes: List[Node], compressed_flow: Optional[List[Dict[str, Any]]] = None, previous_micro_feature: Optional[Dict[str, Any]] = None) -> dict:
        prompt_lines = [
            "Analyze the following trace segment as a MICRO-FEATURE.",
            "A micro-feature is a small local execution slice inside one larger user-facing feature.",
            "Focus on what concretely happens in this segment, not on the whole system.",
            "",
        ]

        if previous_micro_feature:
            previous_name = str(previous_micro_feature.get("name") or "").strip()
            previous_description = str(previous_micro_feature.get("description") or "").strip()

            if previous_name or previous_description:
                prompt_lines.append("### Previous Micro-Feature Context")
                if previous_name:
                    prompt_lines.append(f"- Name: {previous_name}")
                if previous_description:
                    prompt_lines.append(f"- Description: {previous_description}")
                prompt_lines.append("")
                prompt_lines.append(
                    "Use the previous micro-feature only as local transition context. "
                    "Do not merge the current segment with it, and do not copy its name unless the current segment genuinely continues the same concrete action."
                )
                prompt_lines.append("")

        prompt_lines.append("### Functions/Operations in This Micro-Feature")

        node_lookup = {}

        for node in operation_nodes:
            name = node.properties.get("simpleName", node.id)
            node_lookup[str(node.id)] = name

            summary = "No summary available."
            if node.ai_summary and isinstance(node.ai_summary, dict):
                summary = node.ai_summary.get("description") or summary

            prompt_lines.append(f"- {name}: {summary}")

        if compressed_flow:
            prompt_lines.append("")
            prompt_lines.append("### Compressed Observed Runtime Flow")
            prompt_lines.append(
                "The following flow is ordered by runtime execution. "
                "Repeated blocks are shown once with a repetition count."
            )

            for line in self._format_compressed_flow(compressed_flow, node_lookup):
                prompt_lines.append(line)

        prompt_lines.append("")
        prompt_lines.append("FINAL INSTRUCTIONS (APPLY THESE RIGHT BEFORE RETURNING JSON):")
        prompt_lines.append("- Treat this as a local execution slice, not a high-level business feature.")
        prompt_lines.append("- Base the micro-feature name primarily on the compressed observed runtime flow.")
        prompt_lines.append("- Use the function descriptions only as supporting semantic context.")
        prompt_lines.append("- Do not assume a repeated block is the main purpose only because it repeats many times.")
        prompt_lines.append("- First decide whether repeated behavior is domain-specific or supporting behavior.")
        prompt_lines.append("- Supporting behavior includes logging, validation, parsing, formatting, serialization, configuration, error handling, dispatching, and utility calls.")
        prompt_lines.append("- If the repeated block looks like support behavior, mention it in the description only if it helps explain the segment.")
        prompt_lines.append("- The name must be concrete, action-oriented, and narrowly scoped to this segment.")
        prompt_lines.append("- Prefer names grounded in observed runtime behavior, for example: 'Validate Request Payload', 'Resolve Command Handler', 'Persist Entity State'.")
        prompt_lines.append("- Avoid broad/system-level names and avoid project-domain mentions.")
        prompt_lines.append("- Do not invent operations, entities, or transitions that are not present in the input.")
        prompt_lines.append("- Reuse terminology from the provided function names and runtime flow whenever possible.")
        prompt_lines.append("- The description should summarize the core transition or sequence represented by this micro-feature.")

        prompt = "\n".join(prompt_lines) + "\n"

        return self.llm.generate_json(prompt, analyze_micro_feature_tool)
    
    def prompt_hierarchical_feature(self, feature_a: Any, feature_b: Any) -> dict:
        left = self._normalize_hierarchical_child(feature_a)
        right = self._normalize_hierarchical_child(feature_b)

        prompt_lines = [
            "Analyze the following two consecutive child features and merge them into one parent hierarchical feature.",
            "The parent feature should describe the combined sequential behavior of Child A followed by Child B.",
            "",
            "Important: do not force a vague shared theme if the two children represent different phases.",
            "If they are different phases, name the parent as a concrete flow from the first phase to the second phase.",
            "",
            "### Consecutive Child Feature A",
            f"- Name: {left['name']}",
            f"- Description: {left['description']}",
            "",
            "### Consecutive Child Feature B",
            f"- Name: {right['name']}",
            f"- Description: {right['description']}",
            "",
            "FINAL INSTRUCTIONS (APPLY THESE RIGHT BEFORE RETURNING JSON):",
            "- Generate one parent feature_name that is concrete, action-oriented, and flow-aware.",
            "- Preserve the sequential relation: Child A happens before Child B.",
            "- The name should capture the combined execution intent, not only the most repeated or most generic part.",
            "- If one child looks like support behavior, such as logging, validation, parsing, formatting, serialization, configuration, error handling, dispatching, or utility calls, do not let it dominate the parent name unless it is clearly the main purpose.",
            "- The description should summarize how Child A leads into or complements Child B.",
            "- Reuse wording from the child names and descriptions whenever possible.",
            "- Do not introduce entities, operations, or system context not present in the two children.",
            "- Avoid generic names like 'Merged Feature', 'Process Data', or 'Handle Operation' unless there is no concrete signal.",
            "- Keep the feature_name concise, preferably 3 to 7 words.",
            "- Keep the description to 1 or 2 clear sentences.",
        ]

        prompt = "\n".join(prompt_lines) + "\n"

        return self.llm.generate_json(prompt, analyze_hierarchical_feature_tool)
    
    def _format_compressed_flow(
        self,
        compressed_flow: List[Dict[str, Any]],
        node_lookup: Dict[str, str],
    ) -> List[str]:
        lines = []

        for item in compressed_flow:
            item_type = item.get("type")

            if item_type == "step":
                lines.append(f"- {self._format_runtime_step(item, node_lookup)}")

            elif item_type == "repeat":
                repeat_count = (
                    item.get("repeatCount")
                    or item.get("repeat_count")
                    or item.get("count")
                    or "?"
                )

                start_step = item.get("startStep") or item.get("start_step")
                end_step = item.get("endStep") or item.get("end_step")

                if start_step is not None and end_step is not None:
                    lines.append(
                        f"- Repeating block, {repeat_count} times "
                        f"(observed across steps {start_step}-{end_step}):"
                    )
                else:
                    lines.append(f"- Repeating block, {repeat_count} times:")

                nested_steps = item.get("steps") or item.get("block") or []

                for nested_step in nested_steps:
                    lines.append(f"  - {self._format_runtime_step(nested_step, node_lookup)}")

            else:
                lines.append(f"- {self._format_runtime_step(item, node_lookup)}")

        return lines


    def _format_runtime_step(
        self,
        step_item: Dict[str, Any],
        node_lookup: Dict[str, str],
    ) -> str:
        step_number = step_item.get("step") or step_item.get("stepNumber") or step_item.get("step_number")
        kind = str(step_item.get("kind") or step_item.get("type") or "step").lower()

        source_id = step_item.get("sourceId") or step_item.get("source_id")
        target_id = step_item.get("targetId") or step_item.get("target_id")

        source_name = self._operation_display_name(source_id, node_lookup)
        target_name = self._operation_display_name(target_id, node_lookup)

        if source_name and target_name:
            transition = f"{source_name} -> {target_name}"
        elif target_name:
            transition = target_name
        elif source_name:
            transition = source_name
        else:
            transition = "Unknown operation"

        prefix = f"Step {step_number}: " if step_number is not None else ""

        if kind and kind not in {"step", "unknown"}:
            return f"{prefix}{kind} {transition}"

        return f"{prefix}{transition}"


    def _operation_display_name(
        self,
        node_id: Any,
        node_lookup: Dict[str, str],
    ) -> str:
        if not node_id:
            return ""

        node_id_text = str(node_id)

        if node_id_text in node_lookup:
            return node_lookup[node_id_text]

        value = node_id_text

        if ":///" in value:
            value = value.split(":///", 1)[1]

        value = value.split("(", 1)[0]
        value = value.replace("\\", "/")
        value = value.replace("::", "/")

        if "/" in value:
            value = value.rsplit("/", 1)[-1]

        return value or node_id_text
    
    def _normalize_hierarchical_child(self, feature: Any) -> Dict[str, str]:
        if isinstance(feature, dict):
            name = str(feature.get("name") or "").strip()
            description = str(feature.get("description") or "").strip()

            return {
                "name": name or "Unnamed child feature",
                "description": description or "No description provided.",
            }

        description = str(feature or "").strip()

        return {
            "name": "Unnamed child feature",
            "description": description or "No description provided.",
        }