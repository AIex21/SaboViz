# SaboViz

## Introduction
Modern software systems are becoming increasingly large, complex, and long-lived, often continuously evolving by integrating new features and ad-hoc changes. As a consequence, their implementation often drifts from their original documentation, a phenomenon known as architectural erosion. This makes it difficult for developers to understand the system's dependencies and behavior, increasing maintenance costs and onboarding time.

**SaboViz** is a System Architecture Recovery (SAR) tool designed to mitigate this issue by automatically reconstructing the architecture of C++ software systems. 

While traditional static approaches miss runtime behavior and dynamic approaches lack structural completeness, SaboViz proposes a hybrid approach. It integrates both static information (source code) and dynamic information (execution traces) to recover both structural and behavioral perspectives. 

## Documentation

To get started with SaboViz, please follow the documentation below in order:

1. **[Installation & Setup Guide](docs/INSTALLATION.md)**
   Learn how to configure your environment variables and deploy the tool using Docker or Podman.
   
2. **[Data Preparation Guide](docs/DATA_PREPARATION.md)**
   Understand how to correctly format your C++ source code and generate the required execution traces before uploading them to the tool.
   
3. **[Usage Guide](docs/USAGE_GUIDE.md)**
   Learn how to navigate the SaboViz dashboard, handle missing dependencies, and execute Summarizations, Trace Decompositions, and Functional Decompositions.

### Additional Resources
* **[Component Execution Flows](docs/execution-flow/README.md)** - Detailed diagrams and explanations of how the internal components (Extractors, Ontology Builder, etc.) process your data.