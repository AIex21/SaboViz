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

### 2. Choose Your Runtime

Follow the section below that matches your container runtime (Docker Desktop or Podman Desktop).



## Option A: Running with Docker Desktop

### 1. Configure Environment Variables

Create a `.env` file in the root directory. You can copy the example below.

> **Important Note for Windows Users:** Docker requires paths to use forward slashes (`/`) or escaped backslashes (`\\`). Do not use single backslashes.

```ini
# Database Configuration
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=db

# External Libraries
# List the absolute paths to your C++ headers (MSVC, Windows Kits, etc.)
# Separate multiple paths with a semicolon (;).
# Ensure these paths exist on your host machine.
EXTERNAL_LIBS_PATHS=C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.34.31933/include;C:/Program Files (x86)/Windows Kits/10/Include/10.0.19041.0
```

### 2. Build and Run

Start the entire application stack using Docker Compose:

```bash
docker-compose up --build
```


## Option B: Running with Podman Desktop

### 1. Enable the Socket
The backend requires a connection to the Podman daemon. You must enable the socket **inside the Podman Machine.**

**For Windows Users**

#### 1. Open PowerShell and log into the Podman machine:
```bash
podman machine ssh
```

#### 2. Enable the socked inside the VM:
```bash
sudo systemctl enable --now podman.socket
```

#### 3. **Check the Socket Path:** Run the status command and look for the `Listen:` line:
```bash
systemctl status podman.socket
```
Output should show: `Listen: /run/podman/podman.sock`

**For Linux Users**

#### 1. Open your terminal.
#### 2. Enable the socket:
```bash
systemctl --user enable --now podman.socket
```
#### 3. **Check the Socket Path:** Run the status command and look for the `Listen:` line:
```bash
systemctl --user status podman.socket
```
*Alternatively, verify the file exists:*
```bash
echo /run/user/$(id -u)/podman/podman.sock
```

---

### 2. Configure Environment Variables (`.env`)
Create a `.env` file in the root directory. Adjust the paths based on your OS.

**Windows Configuration (`.env`)**
```ini
# Database Configuration
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=db

# External Libraries
# List the absolute paths to your C++ headers (MSVC, Windows Kits, etc.)
# Separate multiple paths with a semicolon (;).
# Ensure these paths exist on your host machine.
# Paths: Must use Linux mount points (/mnt/c/...) instead of C:/
EXTERNAL_LIBS_PATHS=/mnt/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.34.31933/include;/mnt/c/Program Files (x86)/Windows Kits/10/Include/10.0.19041.0

# Socket: Points to the System socket inside the Linux VM (verified in Step 1)
PODMAN_SOCKET=/run/podman/podman.sock
```

**Linux Configuration (`.env`)**
```ini
# Database Configuration
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=db

# External Libraries
# List the absolute paths to your C++ headers (MSVC, Windows Kits, etc.)
# Separate multiple paths with a semicolon (;).
# Ensure these paths exist on your host machine.
EXTERNAL_LIBS_PATHS=/usr/include;/usr/local/include

# Socket: Points to your user socket found in Step 1
PODMAN_SOCKET=/run/user/1000/podman/podman.sock
```

---

### 3. Install Dependencies & Run

**For Windows Users**

You must run the stack **inside the Podman VM** so volume mounts resolve correctly.

#### 1. SSH into the machine:
```bash
podman machine ssh
```

#### 2. Install `pip` and `podman-compose` (if missing):
```bash
sudo dnf install -y python3-pip
pip3 install podman-compose
```

#### 3. Navigate to your project (mounted at `/mnt/c/...`) and run:
```bash
cd /mnt/c/Users/YourName/path/to/saboviz
podman-compose -f podman-compose.yml up --build
```

**For Linux Users**

You can run the stack directly from your host terminal.

#### 1. Install `podman-compose` (if missing):
```bash
pip3 install podman-compose
```

#### 2. Run the stack:
```bash
podman-compose -f podman-compose.yml up --build
```

---

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