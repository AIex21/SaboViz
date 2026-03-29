from sqlalchemy.orm import Session
from typing import List
from app.models.feature import Feature

class FeatureRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_feature_without_commit(self, feature: Feature):
        self.db.add(feature)

    def delete_features_by_project(self, project_id: int):
        self.db.query(Feature).filter(Feature.project_id == project_id).delete(synchronize_session=False)
        self.db.commit()

    def get_features_by_project(self, project_id: int):
        return self.db.query(Feature).filter(Feature.project_id == project_id).all()
    
    def get_nodes_of_feature(self, feature_id: int):
        feature = self.db.query(Feature).filter(Feature.id == feature_id).first()
        if feature:
            return feature.nodes
        return []
    
    def get_nodes_of_features(self, feature_ids: List[int]):
        features = self.db.query(Feature).filter(Feature.id.in_(feature_ids)).all()
        nodes = []
        for feature in features:
            nodes.extend(feature.nodes)
        return nodes

    def commit(self):
        self.db.commit()