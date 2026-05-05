import docker
import os
import json
import zipfile
import shutil
import tarfile
import re
import time
from collections import deque
from pathlib import Path
from fastapi import HTTPException
from typing import Callable, Optional

from app.services.ingest_service import IngestService
from app.core.database import SessionLocal
from app.core.storage_paths import HOST_DATA_PATH, FULL_PROJECT_MODEL_FILENAME, FULL_PROJECT_SNIPPETS_FILENAME, SHARED_VOL_NAME, SHARED_LIBS_NAME, RASCAL_IMAGE
from app.repositories.graph_repo import GraphRepository

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
    
    def run_parser_container(
        self,
        project_id: int,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ):
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

            progress_pattern = re.compile(r"Processed:\s*(\d+)\s*/\s*(\d+)")
            log_tail = deque(maxlen=200)
            last_processed = 0
            last_report_at = 0.0

            for raw in container.logs(stream=True, follow=True):
                line = raw.decode('utf-8', errors='replace').strip()
                if not line:
                    continue

                log_tail.append(line)
                match = progress_pattern.search(line)
                if not match or progress_callback is None:
                    continue

                processed = int(match.group(1))
                total = int(match.group(2))
                if total <= 0 or processed <= last_processed:
                    continue

                now = time.monotonic()
                if (now - last_report_at) < 0.5:
                    continue

                last_processed = processed
                last_report_at = now
                try:
                    progress_callback(processed, total)
                except Exception:
                    pass

            result = container.wait()
            
            if result['StatusCode'] != 0:
                logs = "\n".join(log_tail)
                raise Exception(f"Parser failed with code {result['StatusCode']}.\nLogs:\n{logs[-500:]}")
            
            bits_m3, stat_m3 = container.get_archive("/app/models/composed/FullProject.json")
            m3_path = HOST_DATA_PATH / str(project_id) / FULL_PROJECT_MODEL_FILENAME
            self.write_tar_to_disk(bits_m3, m3_path, FULL_PROJECT_MODEL_FILENAME)

            bits_snip, stat_snip = container.get_archive("/app/models/composed/FullProject_snippets.json")
            snip_path = HOST_DATA_PATH / str(project_id) / FULL_PROJECT_SNIPPETS_FILENAME
            self.write_tar_to_disk(bits_snip, snip_path, FULL_PROJECT_SNIPPETS_FILENAME)

            return m3_path
        
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
        file_path = HOST_DATA_PATH / str(project_id) / FULL_PROJECT_MODEL_FILENAME
        if not file_path.exists():
            raise FileNotFoundError(f"Analysis result not found for project {project_id}")
            
        return file_path
    
    def write_tar_to_disk(self, bits, output_path, member_name):
        temp_tar = output_path.with_suffix('.tar')

        with open(temp_tar, 'wb') as f:
            for chunk in bits:
                f.write(chunk)

        with tarfile.open(temp_tar) as tar:
            member = tar.getmember(member_name)
            f = tar.extractfile(member)
            with open(output_path, "wb") as out:
                out.write(f.read())
        os.remove(temp_tar)

def run_full_analysis_pipeline(
    project_id: int,
    rascal_service: RascalService,
    ingest_service: IngestService,
    auto_continue_unresolved: bool = False,
    run_summarization: bool = True
):
    with SessionLocal() as db:
        repo = GraphRepository(db)
        try:
            repo.change_project_status(project_id, "processing", "Running Static Analysis (Rascal)...")
            def on_progress(processed: int, total: int):
                percent = int((processed / total) * 100) if total else 0
                repo.change_project_status(
                    project_id,
                    "processing",
                    f"Parsing {processed}/{total} files ({percent}%)"
                )

            json_path = rascal_service.run_parser_container(project_id, progress_callback=on_progress)
            
            with open(json_path, 'r') as f:
                m3_content = json.load(f)

            unresolved = m3_content.get("unresolvedIncludes", [])

            if unresolved and len(unresolved) > 0:
                if auto_continue_unresolved:
                    ingest_service.process_m3_file(
                        project_id,
                        m3_content,
                        run_summarization=run_summarization
                    )
                else:
                    count = len(unresolved)
                    repo.change_project_status(
                        project_id,
                        "unresolved",
                        f"Action Needed: {count} unresolved includes found."
                    )
            else:
                ingest_service.process_m3_file(
                    project_id,
                    m3_content,
                    run_summarization=run_summarization
                )
        
        except Exception as e:
            repo.change_project_status(project_id, "error", f"Analysis Failed: {str(e)[:500]}")

