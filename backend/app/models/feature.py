from sqlalchemy import Column, Integer, String, ForeignKey, Float, Table
from sqlalchemy.orm import relationship
from app.core.database import Base

feature_node_association = Table(
    "feature_nodes",
    Base.metadata,
    Column("feature_id", Integer, ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
    Column("node_db_id", Integer, ForeignKey("nodes.db_id", ondelete="CASCADE"), primary_key=True)
)

class Feature(Base):
    __tablename__ = "features"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String)
    description = Column(String, nullable=True)
    category = Column(String)
    score = Column(Float)

    project = relationship("Project", back_populates="features")

    nodes = relationship(
        "Node",
        secondary=feature_node_association,
        back_populates="features"
    )