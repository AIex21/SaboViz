# SaboViz Usage Guide

Welcome to the SaboViz Usage Guide. This document will walk you through the core functionalities of the tool, from uploading your initial data to interacting with the recovered architectural graphs.

## 1. The Dashboard: Project Management & Analysis

The Dashboard is your control center. Here, you can upload data, manage projects, and trigger architectural analyses.

![Main Dashboard View](assets/dashboard-main.png)
*(The main SaboViz dashboard showing active projects and action buttons.)*

### Uploading a Project
To start a new analysis, click the **Create Project** button. You will be prompted to assign a name and upload your `.zip` file containing the prepared C++ source code. SaboViz will immediately begin parsing the static structure.

![Create Project Modal](assets/create-project.png)
*(Image: The Create Project modal showing the file upload drag-and-drop area.)*

### Handling "Action Needed" Status
If your project depends on external libraries that the parser cannot locate, the project status will change to **Action Needed**.
* Click **View Details** to open the unresolved dependencies modal.
* **Process Anyway:** Click this to ignore the missing headers and force the tool to analyze the available code.
* **Delete & Re-upload:** If the missing headers are critical, delete the project, fix your `.env` paths, and upload again.

![Action Needed Modal](assets/action-needed.png)
*(Image: The Action Needed modal listing missing C++ header files.)*

### Uploading Execution Traces
To add dynamic runtime data to your project, navigate to the **Traces** section of your active project. Click the **Upload Trace** button and select your `.log` files. SaboViz will map these execution events to the static code.

![Trace Upload Modal](assets/trace-upload.png)
*(Image: The trace upload interface.)*

### Running Analyses
Once your data is uploaded, you can trigger the core SaboViz features from the project details panel:

* **Summarization:** Click this to have the integrated LLM generate high-level semantic summaries of your modules based on the code's text and comments.
* **Trace Decomposition:** Click **Start Trace Decomposition** to organize raw chronological logs into distinct, readable execution paths.
* **Functional Decomposition:** Click **Run Functional Decomposition** to cluster entities based on their runtime interactions, automatically identifying high-level system features.

![Analysis Action Buttons](assets/analysis-buttons.png)
*(Image: The dashboard panel highlighting the Summarization, Trace Decomposition, and Functional Decomposition buttons.)*

---

## 2. The Graph Page: Architecture Visualization

After running your decompositions, click on **View Graph** to enter the interactive Architecture Visualization dashboard. This is where the hybrid data comes to life.

![Graph Page Overview](assets/graph-main.png)
*(Image: A wide shot of the interactive node graph and side panels.)*

### Navigating the Unified Graph
The graph represents your entire software system, combining both structural and behavioral perspectives.

* **Nodes:** Represent your software entities (Files, Classes, and Methods).
* **Edges (Lines):** Represent relationships. This includes static dependencies (e.g., inheritance, includes) and dynamic interactions (e.g., runtime method calls).

### Interacting with the Architecture
The graph is fully interactive to help you comprehend complex systems:

* **Zoom and Pan:** Click and drag the canvas to explore different areas, and scroll to zoom in on specific clusters.
* **Node Inspection:** Click on any individual node to open the details panel on the side. This panel displays the entity's properties, LLM-generated summaries, and its connected dependencies.
* **Feature Highlighting:** Use the feature toggle menu to select specific functionalities identified during the Functional Decomposition. The graph will highlight the specific cross-layer entities that collaborate to make that feature work, dimming the rest of the system.

![Feature Highlight View](assets/graph-highlight.png)
*(Image: The graph with a specific feature selected, showing highlighted nodes across different architectural layers.)*