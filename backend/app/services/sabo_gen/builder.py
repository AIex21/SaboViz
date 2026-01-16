import os
from app.services.sabo_gen.config import *
from app.services.sabo_gen.utils import *

class SaboGraphBuilder:
    def __init__(self, project_name):
        self.project_name = project_name
        self.nodes = {}
        self.edges = set()

        # self.add_node("ROOT_PROJECT", NODE_PROJECT, {"simpleName": project_name})
    
    def add_node(self, uid, label, props = None):
        if uid in self.nodes:
            return # Node already exists
    
        self.nodes[uid] = {
            "data": {
                "id": uid,
                "labels": [label],
                "properties": props if props else {}
            }
        }

    def add_edge(self, source, target, label):
        if source not in self.nodes or target not in self.nodes:
            return # One of the nodes does not exist
        
        self.edges.add((source, target, label))

    def process_m3(self, m3_data):
        declarations = m3_data.get("declarations", [])

        # Build Development layer
        self.build_development_elements(declarations)

        # Build Functional layer
        self.build_functional_elements(declarations)

        # Connect layers and relations
        self.process_relations(m3_data)

        # Collapse single-child folders
        self.collapse_single_child_folders()

    def build_development_elements(self, declarations):
        seen_paths = set()

        for logical, physical in declarations:
            scheme, path, name = parse_m3_uri(physical)

            # Only process file URIs
            if scheme != "file":
                continue

            # Normalize path and check for duplicates
            norm_path = normalize_path(path)
            if norm_path in seen_paths:
                continue
            seen_paths.add(norm_path)

            file_id = norm_path

            # Create FILE node
            self.add_node(file_id, NODE_FILE, {
                "simpleName": name, 
                "fullPath": path,
                "sabo_def": NODE_FILE
            })

            # Create FOLDER structure
            parts = path.strip("/").split("/")

            current_parent = None

            path_accumulator = ""

            # Build folder hierarchy
            for part in parts[:-1]: # Exclude the file itself
                path_accumulator += "/" + part
                folder_id = f"folder::{path_accumulator}"

                # Add folder node
                self.add_node(folder_id, NODE_FOLDER, {
                    "simpleName": part,
                    "fullPath": path_accumulator,
                    "sabo_def": NODE_FOLDER
                })

                # Link parent to folder
                edge_type = EDGE_INCLUDES if current_parent == "ROOT_PROJECT" else EDGE_CONTAINS
                self.add_edge(current_parent, folder_id, edge_type)

                current_parent = folder_id

            # Link last folder to file
            self.add_edge(current_parent, file_id, EDGE_CONTAINS)

    def build_functional_elements(self, declarations):
        for logical, physical in declarations:
            scheme, path, name = parse_m3_uri(logical)

            # Map M3 scheme to SABO level
            sabo_level = M3_TO_SABO.get(scheme)
            if not sabo_level:
                continue # Unknown types

            # Create functional node
            self.add_node(logical, sabo_level, {
                "simpleName": name,
                "sabo_def": sabo_level,
                "m3_scheme": scheme
            })

            _, phys_path, _ = parse_m3_uri(physical)
            file_id = normalize_path(phys_path)

            # Link file to functional element
            self.add_edge(file_id, logical, EDGE_DECLARES)

    def process_relations(self, m3_data):
        parent_map = {}

        # Process containment relations
        for parent, child in m3_data.get("containment", []):
            parent_node = self.nodes.get(parent)
            child_node = self.nodes.get(child)

            if parent_node and child_node:
                parent_label = parent_node["data"]["labels"][0]
                child_label = child_node["data"]["labels"][0]

                if parent_label == NODE_SCOPE:
                    edge_label = EDGE_ENCLOSES
                elif parent_label == NODE_TYPE:
                    edge_label = EDGE_ENCAPSULATES
                    parent_map[child] = parent
                elif parent_label == NODE_OPERATION:
                    edge_label = EDGE_ENCLOSES # Not in SABO 2.0

                self.add_edge(parent, child, edge_label)

        # Process invokes relations
        invokes = m3_data.get("methodInvocations", []) + m3_data.get("callGraph", [])
        for source, target in invokes:
            self.add_edge(source, target, EDGE_INVOKES)

        # Process specializations relations
        for sub, sup in m3_data.get("extends", []):
            self.add_edge(sub, sup, EDGE_SPECIALIZES)

        # Process uses relations
        for source, target in m3_data.get("uses", []):
            self.add_edge(source, target, EDGE_USES)

        # Process type dependencies
        for source, target in m3_data.get("typeDependency", []):
            source_node = self.nodes.get(source)

            if source_node:
                source_label = source_node["data"]["labels"][0]

                if source_label == NODE_OPERATION:
                    self.add_edge(source, target, EDGE_RETURNS)
                elif source_label == NODE_VARIABLE:
                    self.add_edge(source, target, EDGE_TYPED)

        # Process file dependencies
        for source_uri, target_uri in m3_data.get("requires", []):
            _, src_path, _ = parse_m3_uri(source_uri)
            source_id = normalize_path(src_path)

            _, tgt_path, _ = parse_m3_uri(target_uri)
            target_id = normalize_path(tgt_path)
            
            self.add_edge(source_id, target_id, EDGE_REQUIRES)

    def collapse_single_child_folders(self):
        changed = True
        while changed:
            changed = False

            # Build adjacency maps for folders
            children_map = {}
            
            # Iterate over edges to find folder relationships
            for src, tgt, label in self.edges:
                if label in [EDGE_CONTAINS, EDGE_INCLUDES]:
                    if src not in children_map:
                        children_map[src] = set()
                    children_map[src].add(tgt)

            nodes_to_remove = set()

            for folder_id, children in children_map.items():
                if folder_id not in self.nodes:
                    continue
                
                # Safety Check: If this folder is already being removed, skip it
                if folder_id in nodes_to_remove:
                    continue

                if self.nodes[folder_id]["data"]["labels"][0] != NODE_FOLDER:
                    continue

                if len(children) == 1:
                    child_id = list(children)[0]
                    child_node = self.nodes.get(child_id)

                    # Ensure child is also a FOLDER
                    if child_node and child_node["data"]["labels"][0] == NODE_FOLDER:
                        
                        # Merge Names
                        parent_node = self.nodes[folder_id]
                        child_name = child_node["data"]["properties"]["simpleName"]
                        parent_node["data"]["properties"]["simpleName"] += f"/{child_name}"

                        # Identify edges to re-link
                        edges_to_move = {e for e in self.edges if e[0] == child_id}

                        # Remove old edged
                        self.edges -= edges_to_move

                        # Re-link edges to parent folder
                        for _, target, label in edges_to_move:
                            self.add_edge(folder_id, target, label)

                        # Remove edge between parent and child
                        edge_to_remove = (folder_id, child_id, EDGE_CONTAINS)
                        edge_to_remove_includes = (folder_id, child_id, EDGE_INCLUDES)

                        self.edges.discard(edge_to_remove)
                        self.edges.discard(edge_to_remove_includes)
                        
                        # Mark child for removal
                        nodes_to_remove.add(child_id)

                        changed = True

            # Final cleanup
            for uid in nodes_to_remove:
                if uid in self.nodes:
                    del self.nodes[uid]

    def export(self):
        edge_list = [
            {
                "data": {
                    "source": s,
                    "target": t,
                    "label": l
                }
            }
            for s, t, l in self.edges
        ]

        return {
            "elements": {
                "nodes": list(self.nodes.values()),
                "edges": edge_list
            }
        }
    
    def export_for_vis(self):
        parent_map = {}

        def is_variable(node_id):
            node = self.nodes.get(node_id)
            return node and NODE_VARIABLE in node["data"]["labels"]

        # Try first to find Physical parents
        for source, target, label in self.edges:
            if label in {EDGE_CONTAINS, EDGE_DECLARES, EDGE_INCLUDES}:
                if not is_variable(target):
                    parent_map[target] = source

        # Then find Logical parents
        for source, target, label in self.edges:
            if label in {EDGE_ENCAPSULATES, EDGE_ENCLOSES}:
                if not is_variable(target):
                    parent_map[target] = source

        all_parent_ids = set(parent_map.values())

        def get_ancestors(node_id):
            chain = []
            curr = node_id
            while curr in parent_map:
                curr = parent_map[curr]
                chain.append(curr)

            return chain

        # Enrich nodes
        final_nodes = []
        for uid, node_data in self.nodes.items():
            # Inject 'parent'
            if uid in parent_map:
                node_data["data"]["parent"] = parent_map[uid]

            # Inject 'ancestors'
            ancestors = [uid] + get_ancestors(uid)
            node_data["data"]["ancestors"] = ancestors

            # Inject 'hasChildren'
            if uid in all_parent_ids and node_data["data"]["labels"][0] != NODE_OPERATION:
                node_data["data"]["hasChildren"]= True

            final_nodes.append(node_data)

        # Filter edges
        edge_list = []
        for s, t, l in self.edges:
            if (is_variable(s) or is_variable(t)):
                continue

            if l not in {EDGE_CONTAINS, EDGE_DECLARES, EDGE_INCLUDES, EDGE_ENCAPSULATES, EDGE_ENCLOSES}:
                edge_list.append({
                    "data": {
                        "source": s,
                        "target": t,
                        "label": l
                    }
                })

        return {
            "elements": {
                "nodes": final_nodes,
                "edges": edge_list
            }
        }
