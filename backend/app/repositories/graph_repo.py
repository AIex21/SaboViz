from sqlalchemy.orm import Session
from sqlalchemy import not_, text
from app.models.graph import Project, Node, Edge

class GraphRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_project_by_name(self, name: str):
        return self.db.query(Project).filter(Project.name == name).first()
    
    def get_project_by_id(self, project_id: int):
        return self.db.query(Project).filter(Project.id == project_id).first()
    
    def change_project_status(self, project_id: int, status: str, description: str = None):
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = status
            if description is not None:
                project.description = description
            self.db.commit()
            self.db.refresh(project)
        return project
    
    def create_project(self, name: str, status: str = "ready", description: str = None):
        project = Project(name=name, status=status, description=description)
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project
    
    def get_all_projects(self):
        return self.db.query(Project).filter(Project.status != 'deleting').order_by(Project.id.desc()).all()
    
    def mark_project_as_deleting(self, project_id: int):
        project = self.get_project_by_id(project_id)
        if project:
            project.status = 'deleting'
            self.db.commit()
            return True
        return False

    def delete_project(self, project_id: int):
        project = self.get_project_by_id(project_id)
        if project:
            self.db.delete(project)
            self.db.commit()
    
    def get_all_nodes(self, project_id: int):
        return self.db.query(Node).filter(Node.project_id == project_id).all()
    
    def get_all_edges(self, project_id: int):
        return self.db.query(Edge).filter(Edge.project_id == project_id).all()
    
    def get_roots(self, project_id: int):
        return self.db.query(Node).filter(
            Node.project_id == project_id,
            Node.parent_id == None,
            not_(Node.labels.contains(["Variable"]))
        ).all()
    
    def get_children(self, project_id: int, parent_node_id: str):
        return self.db.query(Node).filter(
            Node.project_id == project_id,
            Node.parent_id == parent_node_id,
            not_(Node.labels.contains(["Variable"]))
        ).all()
    
    def get_edges_for_nodes(self, project_id: int, node_ids: list[str]):
        return self.db.query(Edge).filter(
            Edge.project_id == project_id,
            Edge.source_id.in_(node_ids),
            Edge.target_id.in_(node_ids)
        ).all()

    def bulk_create_nodes(self, nodes_data: list[dict]):
        self.db.bulk_insert_mappings(Node, nodes_data)
        self.db.commit()

    def bulk_create_edges(self, edges_data: list[dict]):
        self.db.bulk_insert_mappings(Edge, edges_data)
        self.db.commit()

    def get_batch_hierarchy(self, project_id: int, node_ids: list[str]) -> dict:
        results = (self.db.query(Node.id, Node.ancestors, Node.properties)
                        .filter(Node.project_id == project_id,
                                Node.id.in_(node_ids))
                        .all())
        
        hierarchy = {}
        for row in results:
            hierarchy[row.id] = {
                "ancestors": row.ancestors,
                "properties": row.properties
            }
        
        return hierarchy

    def get_operation_map(self, project_id: int) -> dict:
        results = (self.db.query(Node.id, Node.properties)
                        .filter(Node.project_id == project_id,
                                Node.labels.contains(['Operation']))
                        .all())
        
        lookup = {}
        for row in results:
            node_id = row.id 
            props = row.properties
            if props and "simpleName" in props:
                lookup[props["simpleName"]] = node_id

        return lookup

    def get_aggregated_edges(self, project_id: int, visible_ids: list[str]):
        if not visible_ids:
            return []
        
        # ---------------------------------------------------------
        # THE SQL EXPLANATION
        # ---------------------------------------------------------
        # 1. visible_lookup: Turns the python list ['id1', 'id2'] into a temporary SQL table.
        # 2. JOIN nodes ns/nt: Gets the 'ancestors' array for the source/target of every edge.
        # 3. JOIN visible_lookup: Uses the GIN INDEX (via the ANY operator) to instantly 
        #    find which visible folder owns that file.
        #    (ns.ancestors || ns.id) means "Check my parents, AND check me".
        # 4. GROUP BY: Collapses thousands of file connections into single 'summary' edges.
        # ---------------------------------------------------------

        sql = text("""
            WITH visible_lookup AS (
                SELECT unnest(:visible_ids) as vid
            ),
            resolved_connections AS (
                SELECT
                    src_resolved.vid as source,
                    tgt_resolved.vid as target,
                    e.label as original_label,
                   
                    CASE
                        WHEN src_resolved.vid = e.source_id
                            AND tgt_resolved.vid = e.target_id
                        THEN e.label
                        ELSE 'aggregated'
                    END as group_label
                    
                FROM edges e
                JOIN nodes ns ON e.source_id = ns.id
                JOIN nodes nt ON e.target_id = nt.id
                    
                -- 1. Resolve Source 
                CROSS JOIN LATERAL (
                    SELECT v.vid
                    FROM unnest(ns.ancestors || ns.id) WITH ORDINALITY as a(node_id, ord)
                    JOIN visible_lookup v ON v.vid = a.node_id
                    ORDER BY a.ord ASC
                    LIMIT 1
                ) src_resolved
                
                -- 2. Resolve Target
                CROSS JOIN LATERAL (
                    SELECT v.vid
                    FROM unnest(nt.ancestors || nt.id) WITH ORDINALITY as a(node_id, ord)
                    JOIN visible_lookup v ON v.vid = a.node_id
                    ORDER BY a.ord ASC
                    LIMIT 1
                ) tgt_resolved

                WHERE e.project_id = :project_id
                    AND src_resolved.vid != tgt_resolved.vid -- Ignore internal connections (self-loops)
            ),
            label_stats AS (
                SELECT
                   source,
                   target,
                   group_label,
                   original_label,
                   COUNT(*) as cnt
                FROM resolved_connections
                GROUP BY source, target, group_label, original_label
            )
            SELECT
                source,
                target,
                group_label,
                SUM(cnt) as total_weight,
                json_object_agg(original_label, cnt) as breakdown
            FROM label_stats
            GROUP BY source, target, group_label
        """)

        try: 
            results = self.db.execute(sql, {
                "project_id": project_id,
                "visible_ids": visible_ids
            }).fetchall()

            aggregated_edges = []
            for row in results:
                is_pure_aggregate = (row.group_label == 'aggregated')

                aggregated_edges.append({
                    "data": {
                        "id": f"agg_{row.source}_{row.target}_{row.group_label}",
                        "source": row.source,
                        "target": row.target,
                        "weight": row.total_weight,
                        "breakdown": row.breakdown,
                        "label": row.group_label,
                        "isAggregated": is_pure_aggregate
                    },
                    "classes": "aggregated" if is_pure_aggregate else row.group_label
                })

            return aggregated_edges

        except Exception as e:
            print(f"Error calculating aggregates: {e}")
            return []
