import docker
import os
import json
import zipfile
import shutil
import tarfile
from pathlib import Path
from fastapi import HTTPException

from app.services.ingest_service import IngestService
from app.core.database import SessionLocal
from app.repositories.graph_repo import GraphRepository

SHARED_VOL_NAME = os.getenv("SHARED_DATA_VOLUME", "sabo_shared_data")
SHARED_LIBS_NAME = os.getenv("SHARED_LIBS_VOLUME", "sabo_shared_libs")
RASCAL_IMAGE = os.getenv("RASCAL_IMAGE_NAME", "sabo-rascal-parser:latest")

HOST_DATA_PATH = Path("/sabo-data")

class RascalService:
    def __init__(self):
        self.client = docker.from_env()

    async def prepare_workspace(self, project_id: int, zip_content: bytes):
        project_dir = HOST_DATA_PATH / str(project_id)

        # Clean/Create Directory
        if project_dir.exists():
            shutil.rmtree(project_dir)
        project_dir.mkdir(parents=True, exist_ok=True)

        # Save Zip
        zip_path = project_dir / "source.zip"
        with open(zip_path, "wb") as f:
            f.write(zip_content)

        # Unzip
        src_dir = project_dir / "src"
        src_dir.mkdir()
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(src_dir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file")
        
        # Generate Config for Rascal
        config = {
            "inputFolderAbsolutePath": f"/sabo-data/{project_id}/src",
            "externalLibRoot": "/data/ext",
            "saveFilesAsJson": True,
            "composeModels": True,
            "verbose": True,
            "localDrive": "C:",
            "saveUnresolvedIncludes": False
        }

        with open(project_dir / "config.json", "w") as f:
            json.dump(config, f, indent=4)

        return project_dir
    
    def run_parser_container(self, project_id: int):
        container = None
        try:
            volume_map = {
                SHARED_VOL_NAME: {'bind': '/sabo-data', 'mode': 'rw'}
            }

            libs_env = os.getenv("EXTERNAL_LIBS_PATHS", "")

            if libs_env:
                paths = [p.strip() for p in libs_env.split(";") if p.strip()]

                for index, host_path in enumerate(paths):
                    container_mount_point = f"/data/ext/lib_{index}"
                    volume_map[host_path] = {'bind': container_mount_point, 'mode': 'ro'}
            else:
                volume_map[SHARED_LIBS_NAME] = {'bind': '/data/ext', 'mode': 'ro'}

            rascal_cmds = "import Parser;\nmain();"
            shell_cmd = f"cp /sabo-data/{project_id}/config.json /app/config.json && echo '{rascal_cmds}' | mvn rascal:console"

            container = self.client.containers.run(
                image=RASCAL_IMAGE,
                entrypoint=["/bin/sh", "-c"],
                command=[shell_cmd],
                detach=True,
                volumes=volume_map
            )

            result = container.wait()
            
            if result['StatusCode'] != 0:
                logs = container.logs().decode('utf-8')
                raise Exception(f"Parser failed with code {result['StatusCode']}.\nLogs:\n{logs[-500:]}")
            
            bits, stat = container.get_archive("/app/models/composed/FullProject.json")

            output_path = HOST_DATA_PATH / str(project_id) / "FullProject.json"
            temp_tar = HOST_DATA_PATH / str(project_id) / "output.tar"

            with open(temp_tar, 'wb') as f:
                for chunk in bits:
                    f.write(chunk)

            with tarfile.open(temp_tar) as tar:
                member = tar.getmember("FullProject.json")
                f = tar.extractfile(member)
                with open(output_path, "wb") as out:
                    out.write(f.read())

            os.remove(temp_tar)

            return output_path
        
        except docker.errors.ImageNotFound:
            raise Exception("Rascal Parser image not found.")
        except Exception as e:
            print(f"Docker Error: {e}")
            raise e
        
        finally:
            if container:
                container.remove(force=True)

    def delete_workspace(self, project_id: int):
        project_dir = HOST_DATA_PATH / str(project_id)

        try:
            if project_dir.exists():
                shutil.rmtree(project_dir)
        except Exception as e:
            print(f"[{project_id}] Warning: Failed to delete workspace files: {e}")
        
    def get_analysis_file(self, project_id: int) -> Path:
        file_path = HOST_DATA_PATH / str(project_id) / "FullProject.json"
        if not file_path.exists():
            raise FileNotFoundError(f"Analysis result not found for project {project_id}")
            
        return file_path

def run_full_analysis_pipeline(project_id: int, rascal_service: RascalService, ingest_service: IngestService):
    with SessionLocal() as db:
        repo = GraphRepository(db)
        try:
            repo.change_project_status(project_id, "processing", "Running Static Analysis (Rascal)...")
            json_path = rascal_service.run_parser_container(project_id)
            
            with open(json_path, 'r') as f:
                m3_content = json.load(f)

            unresolved = m3_content.get("unresolvedIncludes", [])

            if unresolved and len(unresolved) > 0:
                count = len(unresolved)
                repo.change_project_status(
                    project_id,
                    "unresolved",
                    f"Action Needed: {count} unresolved includes found."
                )
            else:
                ingest_service.process_m3_file(project_id, m3_content)
        
        except Exception as e:
            repo.change_project_status(project_id, "error", f"Analysis Failed: {str(e)[:500]}")

