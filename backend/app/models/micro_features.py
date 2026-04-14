from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class TraceMicroFeature(Base):
    __tablename__ = "trace_micro_features"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    trace_id = Column(Integer, ForeignKey("traces.id", ondelete="CASCADE"), index=True, nullable=False)
    sequence_order = Column(Integer, nullable=False)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="MicroFeature")
    components = Column(JSON, default=list)

    step_count = Column(Integer, nullable=False, default=0)
    start_step = Column(Integer, nullable=True)
    end_step = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="trace_micro_features")
    trace = relationship("Trace", back_populates="micro_features")


class TraceMicroFeatureFlow(Base):
    __tablename__ = "trace_micro_feature_flows"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    trace_id = Column(Integer, ForeignKey("traces.id", ondelete="CASCADE"), index=True, nullable=False)

    source_micro_feature_id = Column(
        Integer,
        ForeignKey("trace_micro_features.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_micro_feature_id = Column(
        Integer,
        ForeignKey("trace_micro_features.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence_order = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="trace_micro_feature_flows")
    trace = relationship("Trace", back_populates="micro_feature_flows")

    source_micro_feature = relationship(
        "TraceMicroFeature",
        foreign_keys=[source_micro_feature_id],
    )
    target_micro_feature = relationship(
        "TraceMicroFeature",
        foreign_keys=[target_micro_feature_id],
    )


class TraceHierarchicalCluster(Base):
    __tablename__ = "trace_hierarchical_clusters"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    trace_id = Column(Integer, ForeignKey("traces.id", ondelete="CASCADE"), index=True, nullable=False)

    parent_cluster_id = Column(
        Integer,
        ForeignKey("trace_hierarchical_clusters.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    left_child_cluster_id = Column(
        Integer,
        ForeignKey("trace_hierarchical_clusters.id", ondelete="SET NULL"),
        nullable=True,
    )
    right_child_cluster_id = Column(
        Integer,
        ForeignKey("trace_hierarchical_clusters.id", ondelete="SET NULL"),
        nullable=True,
    )

    sequence_order = Column(Integer, nullable=False)
    hierarchy_level = Column(Integer, nullable=False, default=0)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    member_micro_feature_ids = Column(JSON, default=list)
    member_count = Column(Integer, nullable=False, default=0)

    start_step = Column(Integer, nullable=True)
    end_step = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="trace_hierarchical_clusters")
    trace = relationship("Trace", back_populates="hierarchical_clusters")