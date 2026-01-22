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
            type = step['type']

            # Identify Target (The function currently executing)
            target_static_id = self.static_lookup.get(function_name)

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
                        "message": step['message']
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
            if self.static_lookup[step['function']]:
                edges.append({
                    "data": {
                        "source": action_id,
                        "target": self.static_lookup[step['function']],
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

