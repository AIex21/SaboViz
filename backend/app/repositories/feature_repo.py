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

    def commit(self):
        self.db.commit()