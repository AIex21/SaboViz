# SaboViz

## Prerequisites

Ensure you have the following installed before proceeding:

* **Docker Desktop** (Must be running and accessible via terminal).
* **Git**.

---

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/AIex21/SaboViz.git
cd saboviz
```

### 2. Configure Environment Variables

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

### 3. Build and Run

Start the entire application stack using Docker Compose:

```bash
docker-compose up --build
```

**Access Points:**

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