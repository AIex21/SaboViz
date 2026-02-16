# SaboViz

## Prerequisites

Ensure you have the following installed before proceeding:

* **Docker Desktop** (Must be running and accessible via terminal).
* **Podman Desktop** (Alternative for environments where Docker is restricted).
* **Git**.

---

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/AIex21/SaboViz.git
cd saboviz
```

### 2. Configure Environment Variables (`.env`)

Create a `.env` file in the root directory. You must define the paths to your external C++ libraries and your database credentials.

> **Important Note for Windows Users:** Docker/Podman requires paths to use forward slashes (`/`) or escaped backslashes (`\\`). Do not use single backslashes.

```ini
# Database Configuration
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=db

# External Libraries
# List the absolute paths to your C++ headers (MSVC, Windows Kits, etc.)
# Separate multiple paths with a semicolon (;).
# Ensure these paths exist on your host machine.
# When using Podman on Windows, you must use Linux mount points (/mnt/c/...) instead of C:/
EXTERNAL_LIBS_PATHS=C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.34.31933/include;C:/Program Files (x86)/Windows Kits/10/Include/10.0.19041.0

# Podman Socket (Only required if using Podman)
# Windows Example: /run/podman/podman.sock
# Linux Example: /run/user/1000/podman/podman.sock
PODMAN_SOCKET=/run/podman/podman.sock
```

### 3. Choose Your Deployment Mode

Expand the section below that matches your current goal.

<details>
<summary><b>🛠️ Development Environment (Source Code & Hot-Reloading)</b></summary>

Use this environment if you are actively editing the source code.

### Option A: Running with Docker Desktop

Start the entire application stack using Docker Compose:

```bash
docker-compose up --build
```

### Option B: Running with Podman Desktop

#### 1. Enable the Socket

The backend requires a connection to the Podman daemon. You must enable the socket inside the Podman Machine.

* **For Windows Users**:

    1. Open PowerShell and log into the Podman machine: `podman machine ssh`
    2. Enable the socket inside the VM: `sudo systemctl enable --now podman.socket`
    3. Check the Socket Path: `systemctl status podman.socket` (Output shouls show: `Listen: /run/podman/podman.sock`)

* **For Linux Users**:

    1. Enable the socket: `systemctl --user enable --now podman.socket`
    2. Check the Socket Path: `systemctl --user status podman.socket`

#### 2. Install Dependencies & Run

* **For Windows Users**: You must run the stack inside the Podman VM so volume mounts resolve correctly.

    1. SSH into the machine: `podman machine ssh`
    2. Install tools: `sudo dnf install -y python3-pip && pip3 install podman-compose`
    3. Navigate to your project and run:
        ```bash
        cd /mnt/c/Users/YourName/path/to/saboviz
        podman-compose -f podman-compose.yml up --build
        ```

* **For Linux Users**:

    1. Install tools: `pip3 install podman-compose`
    2. Run the stack: `podman-compose -f podman-compose.yml up --build`

</details>

<details>
<summary><b>📦 Production (Pre-built Images)</b></summary>

Use this method to deploy SaboViz anywhere.

### 1. Download the Environment Archive

Because the compiled environment is large (~ 1.1 GB), it is not stored in the Git repository.

#### 1. Download the `sabo-viz-full.tar` file from this link: [Download sabo-viz-full.tar here]([https://tuenl-my.sharepoint.com/:u:/g/personal/a_ion_student_tue_nl/IQApxTtUo8HCTLz2cGpt0TdHAQUdrz8vOOCn6TGvCMGEE60?e=TyXL5i])

#### 2. Place the downloaded .tar file in the same directory as the docker-compose.prod.yml (or podman-compose.prod.yml) and .env files.

### 2. Deploy

#### 1. Load the pre-build images into your local registry:
* **For Docker Desktop:**
    ```bash
    docker load -i sabo-viz-full.tar
    ```

* **For Podman Desktop:**
    ```bash
    docker load -i sabo-viz-full.tar
    ```

#### 2. Start the application:
* **For Docker Desktop:**
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```

* **For Podman Desktop:**
    ```bash
    podman-compose -f podman-compose.prod.yml up -d
    ```
</details>

## Access Points:

| Service | URL / Port | Description |
| :--- | :--- | :--- |
| **Frontend** | `http://localhost:5173` | The main user dashboard. |
| **Backend API** | `http://localhost:8000/docs` | Swagger UI / API Documentation. |
| **Database** | `Port 5432` | Postgres database. |

---

## How to Use

### 1. Upload a Project
* Navigate to the **Dashboard** (Frontend).
* Upload a `.zip` file containing your C++ source code.
* Assign a name to your project and click **"Create Project"**.

### 2. Analysis Process
* The backend will automatically spawn a **Rascal** container.
* The system parses the code and identifies missing includes or dependencies.

### 3. Handling "Action Needed" status
* If the parser cannot locate specific libraries (e.g., `<windows.h>`), the project status will change to **Action Needed**.
* Click **"View Details"** to investigate which files are missing.
* **Resolution Options:**
    * **Process Anyway:** Ignore the errors and proceed with the current analysis.
    * **Delete Project:** Remove the project, fix your `.env` paths to include the missing headers, and re-upload.