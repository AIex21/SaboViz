from sqlalchemy.orm import Session

from app.models.micro_features import TraceHierarchicalCluster, TraceMicroFeature, TraceMicroFeatureFlow


class MicroFeaturesRepository:
    def __init__(self, db: Session):
        self.db = db

    def clear_project_decomposition(self, project_id: int, commit: bool = False):
        self.db.query(TraceHierarchicalCluster).filter(
            TraceHierarchicalCluster.project_id == project_id
        ).delete(synchronize_session=False)

        self.db.query(TraceMicroFeatureFlow).filter(
            TraceMicroFeatureFlow.project_id == project_id
        ).delete(synchronize_session=False)

        self.db.query(TraceMicroFeature).filter(
            TraceMicroFeature.project_id == project_id
        ).delete(synchronize_session=False)

        if commit:
            self.db.commit()
        else:
            self.db.flush()

    def create_micro_feature(
        self,
        project_id: int,
        trace_id: int,
        sequence_order: int,
        name: str,
        description: str | None,
        category: str,
        components: list[str],
        step_count: int,
        start_step: int | None,
        end_step: int | None,
        commit: bool = False,
    ):
        row = TraceMicroFeature(
            project_id=project_id,
            trace_id=trace_id,
            sequence_order=sequence_order,
            name=name,
            description=description,
            category=category,
            components=components,
            step_count=step_count,
            start_step=start_step,
            end_step=end_step,
        )
        self.db.add(row)

        if commit:
            self.db.commit()
        else:
            self.db.flush()

        self.db.refresh(row)
        return row

    def create_hierarchical_cluster(
        self,
        project_id: int,
        trace_id: int,
        sequence_order: int,
        hierarchy_level: int,
        name: str,
        description: str | None,
        member_micro_feature_ids: list[int],
        member_count: int,
        start_step: int | None,
        end_step: int | None,
        parent_cluster_id: int | None = None,
        left_child_cluster_id: int | None = None,
        right_child_cluster_id: int | None = None,
        commit: bool = False,
    ):
        row = TraceHierarchicalCluster(
            project_id=project_id,
            trace_id=trace_id,
            sequence_order=sequence_order,
            hierarchy_level=hierarchy_level,
            name=name,
            description=description,
            member_micro_feature_ids=member_micro_feature_ids,
            member_count=member_count,
            start_step=start_step,
            end_step=end_step,
            parent_cluster_id=parent_cluster_id,
            left_child_cluster_id=left_child_cluster_id,
            right_child_cluster_id=right_child_cluster_id,
        )
        self.db.add(row)

        if commit:
            self.db.commit()
        else:
            self.db.flush()

        self.db.refresh(row)
        return row

    def create_micro_feature_flow(
        self,
        project_id: int,
        trace_id: int,
        source_micro_feature_id: int,
        target_micro_feature_id: int,
        sequence_order: int,
        commit: bool = False,
    ):
        row = TraceMicroFeatureFlow(
            project_id=project_id,
            trace_id=trace_id,
            source_micro_feature_id=source_micro_feature_id,
            target_micro_feature_id=target_micro_feature_id,
            sequence_order=sequence_order,
        )
        self.db.add(row)

        if commit:
            self.db.commit()
        else:
            self.db.flush()

        self.db.refresh(row)
        return row

    def get_micro_features_by_trace(self, trace_id: int):
        return (
            self.db.query(TraceMicroFeature)
            .filter(TraceMicroFeature.trace_id == trace_id)
            .order_by(TraceMicroFeature.sequence_order.asc())
            .all()
        )

    def get_micro_feature_flows_by_trace(self, trace_id: int):
        return (
            self.db.query(TraceMicroFeatureFlow)
            .filter(TraceMicroFeatureFlow.trace_id == trace_id)
            .order_by(TraceMicroFeatureFlow.sequence_order.asc())
            .all()
        )

    def get_hierarchical_clusters_by_trace(self, trace_id: int):
        return (
            self.db.query(TraceHierarchicalCluster)
            .filter(TraceHierarchicalCluster.trace_id == trace_id)
            .order_by(TraceHierarchicalCluster.sequence_order.asc())
            .all()
        )