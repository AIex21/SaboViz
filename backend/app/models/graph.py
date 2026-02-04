from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, Text, Boolean, Index 
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    status = Column(String, default="ready") # ''ready', 'processing', 'error'
    description = Column(Text, nullable=True) # Stores error messages or progress logs
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    nodes = relationship("Node", back_populates="project", cascade="all, delete-orphan")
    edges = relationship("Edge", back_populates="project", cascade="all, delete-orphan")

    traces = relationship("Trace", back_populates="project", cascade="all, delete-orphan")
    features = relationship("Feature", back_populates="project", cascade="all, delete-orphan")

class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = (
        # 1. Name of the index
        # 2. The column to index ('ancestor')
        # 3. The engine to use: GIN
        Index('idx_nodes_ancestors', 'ancestors', postgresql_using='gin'),
    )

    db_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    id = Column(String, index=True)
    labels = Column(ARRAY(String))
    properties = Column(JSON, default={})
    parent_id = Column(String, index=True, nullable=True)
    ancestors = Column(ARRAY(String), default=[])
    hasChildren = Column(Boolean, default=False)

    project = relationship("Project", back_populates="nodes")

    features = relationship(
        "Feature",
        secondary="feature_nodes",
        back_populates="nodes"
    )

class Edge(Base):
    __tablename__ = "edges"
    db_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    source_id = Column(String, index=True)
    target_id = Column(String, index=True)
    label = Column(String)

    project = relationship("Project", back_populates="edges")

class Trace(Base):
    __tablename__ = "traces"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))

    name = Column(String, index=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trace_seq_path = Column(String)

    project = relationship("Project", back_populates="traces")