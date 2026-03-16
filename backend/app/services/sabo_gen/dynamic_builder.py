import json
from sqlalchemy.orm import Session
from app.services.sabo_gen.config import *
from app.services.graph_service import GraphService

class DynamicGraphBuilder:
    def __init__(self, trace_sequence, project_id: int, db: Session):
        self.trace_sequence = trace_sequence

        if self.trace_sequence:
            ts = self.trace_sequence[0]['timestamp']
        else:
            ts = "Unknown"
        
        self.trace_id = f"Trace_{ts.replace(',', '').replace(' ','_').replace(':','')}"
        
        graph_service = GraphService(db)
        self.static_lookup = graph_service.get_operation_map(project_id)

        self.dynamic_graph = {}
        self.resolution_counts = {
            "resolved": 0,
            "ambiguous": 0,
            "unmapped": 0,
        }

    def _candidate_matches_qualifier(self, candidate, qualifier: str) -> bool:
        if not isinstance(candidate, dict):
            return False

        qualifier_token = qualifier.lower().strip()
        if not qualifier_token:
            return False

        ancestor_tokens = {token.lower() for token in candidate.get("ancestorTokens", [])}
        if qualifier_token in ancestor_tokens:
            return True

        ancestor_names = [str(name).lower() for name in candidate.get("ancestorNames", [])]
        for name in ancestor_names:
            parts = [part for part in name.replace("::", " ").split(" ") if part]
            if qualifier_token in parts:
                return True

        return False

    def _resolve_operation_id(self, function_name: str, scope_qualifiers=None):
        matches = self.static_lookup.get(function_name, [])
        scope_qualifiers = scope_qualifiers or []

        # Backward compatibility in case map still contains single string IDs.
        if isinstance(matches, str):
            matches = [matches]

        # Backward compatibility for old lookup shape.
        normalized = []
        for match in matches:
            if isinstance(match, str):
                normalized.append({"id": match, "ancestorNames": [], "ancestorTokens": []})
            elif isinstance(match, dict):
                normalized.append(match)

        matches = normalized

        if len(matches) == 1:
            return matches[0].get("id"), "resolved"

        if len(matches) > 1:
            narrowed = matches

            # Use qualifiers from nearest scope to farthest: A::B::func => B then A.
            for qualifier in reversed(scope_qualifiers):
                qualifier_matches = [
                    candidate for candidate in narrowed
                    if self._candidate_matches_qualifier(candidate, qualifier)
                ]

                # No matches means this qualifier provides no useful signal.
                if not qualifier_matches:
                    continue

                # If qualifier matches all candidates, it doesn't disambiguate.
                if len(qualifier_matches) == len(narrowed):
                    continue

                narrowed = qualifier_matches
                if len(narrowed) == 1:
                    return narrowed[0].get("id"), "resolved"

            return None, "ambiguous"

        return None, "unmapped"

    def build_graph(self):
        nodes = []
        edges = []

        # Create Root Trace Node
        trace_node = {
            "data": {
                "id": self.trace_id,
                "label": [NODE_TRACE],
                "properties": { "name": "Execution Trace" }
            }
        }

        nodes.append(trace_node)

        previous_action_id = None
        call_stack = {}

        for step in self.trace_sequence:
            action_id = f"Action_{step['step']}"
            current_depth = step['depth']
            function_name = step['function']
            scope_qualifiers = step.get('scopeQualifiers', [])
            type = step['type']

            # Identify Target (The function currently executing)
            target_static_id, resolution_status = self._resolve_operation_id(function_name, scope_qualifiers)
            if resolution_status in self.resolution_counts:
                self.resolution_counts[resolution_status] += 1

            # Update the stack
            call_stack[current_depth] = target_static_id

            # Identify Source
            if current_depth > 0:
                source_static_id = call_stack.get(current_depth - 1)
            else:
                source_static_id = None

            if type == 'return':
                source_static_id, target_static_id = target_static_id, source_static_id

            action_node = {
                "data": {
                    "id": action_id,
                    "labels": [NODE_ACTION],
                    "properties": {
                        "step": step['step'],
                        "sourceId": source_static_id,
                        "targetId": target_static_id,
                        "timestamp": step['timestamp'],
                        "type": step['type'],
                        "parameters": step['parameters'],
                        "simpleName": f"{step['step']}: {step['type']} {step['function']}",
                        "message": step['message'],
                        "operationResolution": resolution_status
                    }
                }
            }

            # Add the node
            nodes.append(action_node)

            # Add edges
            # Edge: Trace -> Action
            edges.append({
                "data": {
                    "source": self.trace_id,
                    "target": action_id,
                    "label": EDGE_CONTAINS
                }
            })

            # Edge: Action -> Action
            if previous_action_id:
                edges.append({
                    "data": {
                        "source": previous_action_id,
                        "target": action_id,
                        "label": EDGE_PRECEDES
                    }
                })

            # Edge: Action -> Operation
            if target_static_id:
                edges.append({
                    "data": {
                        "source": action_id,
                        "target": target_static_id,
                        "label": EDGE_EXECUTES
                    }
                })

            previous_action_id = action_id
        
        print(f"Added {len(self.trace_sequence)} dynamic actions")

        self.dynamic_graph = {
            "elements": {
                "nodes": nodes,
                "edges": edges
            }
        }
    
    def save_json(self, output_path: str):
        with open(output_path, 'w') as f:
            json.dump(self.dynamic_graph, f, indent=2)

