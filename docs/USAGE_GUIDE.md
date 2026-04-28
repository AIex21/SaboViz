# SaboViz Usage Guide

Welcome to the SaboViz Usage Guide. This document will walk you through the core functionalities of the tool, from uploading your initial data to interacting with the recovered architectural graphs.

## 1. The Dashboard: Project Management & Analysis

The Dashboard is your control center. Here, you can upload data, manage projects, and trigger architectural analyses.

![Main Dashboard View](assets/dashboard-main.png)
*(Image: The main SaboViz dashboard showing active projects and action buttons.)*

### Creating a Project
To start a new analysis, navigate to the Dashboard and follow these steps:
1. Enter a **Name** for your project.
2. Upload your prepared **`.zip` source file** into the designated upload field.
3. Click the **Create Project** button.

![Create Project Form](assets/create-project-form.png)
*(Image: The project creation area showing the name input and file upload field.)*

Upon clicking **Create Project**, a configuration modal will appear. This modal allows you to customize how SaboViz handles the ingestion process:

* **Auto-continue when includes are unresolved:** If the parser detects missing external dependencies (like standard C++ libraries or custom headers not included in your zip), checking this box tells SaboViz to ignore the errors and automatically proceed with these unresolved dependencies. If left unchecked, the project will pause in an "Action Needed" state for your review.
* **Run AI summarization after ingestion:** Checking this box will automatically trigger the integrated LLM to generate high-level semantic summaries of your modules as soon as the static parsing is complete.

Select your preferred configuration and confirm to begin parsing.

![Create Project Options Modal](assets/create-project-modal.png)
*(Image: The configuration modal showing the "Auto-continue" and "Run AI summarization" checkboxes.)*

### Handling "Action Needed" Status
if you choose *not* to auto-continue and the parser cannot locate specific libraries defined in your `#include` directives, the project status will flag as **Action Needed**.

* Click the **View Details** to investigate the missing headers.
* **Resolution 1 (Fix):** Delete the project, update your `.env` file to include the mising paths in `EXTERNAL_LIBS_PATHS`, restart the tool, and re-upload.
* **Resolution 2 (Ignore):** Click **Process Anyway** to ignore the missing external dependencies and force the tool to proceed with the existing source code. *Note: If the missing files are standard external dependencies, the tool will work just fine and will be able to parse the code correctly.*
![Action Needed Status](assets/action-needed-status.png)
*(Image: Displaying the **Action Needed Status** of the project and the **View Details** button.)*

![Action Needed Modal](assets/action-needed-modal.png)
*(Image: The Action Needed modal listing missing C++ header files.)*

### Project Actions & Analysis
Once your static project is ready, you can manage your dynamic data and trigger analyses by clicking the **Actions** button on your project card. This opens the **Project Actions** modal, which serves as your central menu for the following functionalities:

* **Add New Trace:** Upload an additional execution trace file (`.log`) for this project to merge runtime behavior with your static graph.
* **View All Traces:** Open the full trace list to inspect, manage, or delete traces that have already been uploaded.
* **Extract Features:** Starts the functional decomposition process. You can set custom thresholds to cluster entities based on their runtime interactions, automatically identifying high-level system features.
* **Trace Decomposition:** Splits raw, chronological traces into distinct micro-features and coherent execution flow segments to make them readable.
* **Run Summarization:** Generates AI summaries for the entire graph (useful if you did not enable auto-summarization during project creation).
* **Export Static Graph:** Downloads the currently mapped nodes and edges as a file. This allows you to re-import the project later without needing to re-parse the heavy source code files.

![Project Actions Button](assets/project-actions-button.png)
*(Image: Pointing out the Actions button on the project card.)*

![Project Actions Modal](assets/project-actions-modal.png)
*(Image: The Project Actions modal showing the list of available management and analysis options.)*

### Adding Execution Traces
To merge dynamic runtime behavior with your structural code, you must add your generated execution traces.
1. Click the **Actions** button on your project and select **Add New Trace**.
2. A modal titled **Add Trace to "[Your Project Name]"** will appear.
3. Click the designated upload area (or drag and drop) to select one or more `.log` files containing your execution traces.
4. Click **Upload Trace(s)**. SaboViz will parse the logs and append the dynamic events to your existing knowledge graph.

![Add Trace Modal](assets/add-trace-modal.png)
*(Image: The Add Trace modal showing the drag-and-drop file upload area and action buttons.)*

### Managing Traces (View All Traces)
To inspect or delete the execution traces you have uploaded to a project, open the Project Actions modal and click **View All Traces**. This will open a modal listing all dynamic scenarios currently mapped to your architecture.

For each trace, SaboViz provides a detailed breakdown of how successfully the dynamic events were mapped to your static C++ source code:

| Metric | Description |
| :--- | :--- |
| **Steps** | The total number of execution events (function calls and returns) parsed from the `.log` file. |
| **Resolved** | The number of events that successfully and uniquely matched a static entity (e.g., a specific method in a specific class) within your parsed code. |
| **Ambiguous** | The number of events that matched multiple static entities. This usually happens with overloaded functions if the trace logs lacked sufficient scope qualifiers (`Namespace::Class::Method`). |
| **Unresolved** | The number of events that could not be mapped to any static entity in your project (often caused by unparsed external library calls or missing source code files). |

> **💡 Tip: Deleting a Trace**
> If you notice a trace has a high number of unresolved steps, or if you simply want to remove a scenario from the current architecture analysis, click the **`×`** icon next to the specific trace to delete it.

![View All Traces Modal](assets/view-all-traces-modal.png)
*(Image: The View All Traces modal showing the list of uploaded traces and their mapping statistics.)*

### Extracting Features (Functional Decomposition)
To identify the high-level system features based on your uploaded execution traces, open the Project Actions modal and click **Extract Features**. 

This process uses a hierarchical agglomerative clustering algorithm to group software entities that frequently interact at runtime. When you start the extraction, you will be prompted to configure the following parameters:

| Parameter | Description |
| :--- | :--- |
| **Distance Threshold** *(e.g., 0.4)* | Controls the granularity of the clusters. A lower value requires entities to be highly coupled to form a feature (resulting in smaller, highly specific features). A higher value allows looser coupling (resulting in larger, broader features). |
| **Infrastructure Threshold** *(e.g., 0.3)* | Helps isolate utility or infrastructure components (e.g., generic database drivers, logging modules) that are called globally across multiple features. Properly setting this prevents generic utility classes from being improperly merged into specific business-logic features. |
| **Use AI for Feature Naming** | When enabled, SaboViz passes the clustered entities to the integrated LLM. Instead of generic names like "Feature 1", the AI automatically generates meaningful, human-readable names and descriptions for each discovered feature. |

Select your desired thresholds and click **Start Extraction** to begin the functional decomposition process.

![Extract Features Modal](assets/extract-features-modal.png)
*(Image: The Extract Features configuration modal showing the distance threshold, infrastructure threshold, and AI naming toggle.)*

### Trace Decomposition (Micro-Feature Segmentation)
To break down long, complex execution traces into readable, logical segments (micro-features), open the Project Actions modal and click **Trace Decomposition**. 

This process analyzes the sequence of dynamic events and automatically detects boundaries between different sub-phases of a trace. When you start the decomposition, you will be prompted to configure the following parameters:

| Parameter | Description |
| :--- | :--- |
| **PELT Penalty** *(e.g., 30.0)* | Controls the sensitivity of the changepoint detection algorithm (Pruned Exact Linear Time). A higher penalty makes the algorithm stricter, resulting in fewer, larger execution segments. A lower penalty makes it more sensitive, resulting in many smaller, granular micro-features. |
| **Hierarchical Distance Threshold** *(e.g., 0.50)* | Determines how segmented execution blocks are grouped. A lower threshold requires segments to be highly structurally similar to be clustered into the same micro-feature category. |
| **Use AI for Micro-feature Naming** | When enabled, SaboViz passes the segmented execution blocks to the LLM to generate context-aware, human-readable phase names. When disabled, the system relies strictly on fast, rule-based labeling. |

Select your desired parameters and click **Start Trace Decomposition** to process all uploaded traces for the current project.

![Trace Decomposition Modal](assets/trace-decomposition-modal.png)
*(Image: The Trace Decomposition configuration modal showing the PELT penalty, distance threshold, and AI naming toggle.)*

## 2. The Graph Page: Architecture Visualization

After running your decompositions, click on the project card to enter the interactive Architecture Visualization dashboard. This is where the hybrid data comes to life.

![Graph Page Overview](assets/graph-main.png)
*(Image: A wide shot of the interactive node graph and side panels.)*

### Interacting with the Architecture
The graph is fully interactive, allowing you to explore the architecture at varying levels of detail:

* **Expand a Node:** Double-click on a parent node (like a File or a Class) to expand it and reveal its internal structure (its children, such as internal Methods or nested Classes).
* **Collapse a Node:** Double-click an expanded node again to collapse it, hiding its children and simplifying your view.
* **Reposition Nodes:** Click and drag any node to move it around the canvas. This allows you to manually organize the graph layout to better suit your comprehension needs.

![Graph Interactions Demonstration](assets/graph-interactions.gif)
*(Gif: Demonstrating how to double-click to expand a node and drag to reposition it.)*