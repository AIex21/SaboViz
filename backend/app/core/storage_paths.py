import os
from pathlib import Path

SHARED_VOL_NAME = os.getenv("SHARED_DATA_VOLUME", "sabo_shared_data")
SHARED_LIBS_NAME = os.getenv("SHARED_LIBS_VOLUME", "sabo_shared_libs")
RASCAL_IMAGE = os.getenv("RASCAL_IMAGE_NAME", "sabo-rascal-parser:latest")

HOST_DATA_PATH = Path("/sabo-data")
FULL_PROJECT_SNIPPETS_FILENAME = "FullProject_snippets.json"
FULL_PROJECT_MODEL_FILENAME = "FullProject.json"