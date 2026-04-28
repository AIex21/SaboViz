# Data Preparation Guide

SaboViz relies on a hybrid architecture recovery approach. To get accurate results, you must provide both **static information** (the source code) and **dynamic information** (execution traces). Follow these steps to prepare your data before uploading it to the tool.

## 1. Preparing Static Data (Source Code)

### Important: Projects using Code Generation or IDLs
If your project uses Interface Definition Languages (IDLs) or custom code generators to define interfaces and data types, **you must compile your source code first**. 

SaboViz parses standard C++ syntax. It cannot directly parse custom definition files. By compiling your project first, your generators will output the standard C++ header and source files. SaboViz requires these generated C++ files to accurately map your architecture.

### Archiving for Upload
* **Format:** Compress your target C++ project directory into a standard `.zip` file.
* **Content:** Ensure the zip file contains all relevant `.cpp` and `.h` / `.hpp` files necessary for the project to be understood structurally. **Make sure to include all generated header and source files produced during the build process.**
* **External Dependencies:** The parser needs to resolve external includes (like `<windows.h>` or `<iostream>`). Ensure that the absolute paths to these libraries on your host machine are properly mapped in your `.env` file under the `EXTERNAL_LIBS_PATHS` variable. For more information about this please check the **[Installation & Setup Guide](INSTALLATION.md)**.

## 2. Preparing Dynamic Data (Execution Traces)
Static dependencies only tell half the story. To capture what the program actual does at runtime, SaboViz requires execution traces.

### What Should a Trace Capture?
To accurately reconstruct the architecture, a trace must represent a **distinct service or feature of the system**. We define a single trace as the complete execution log of a single System Scenario, Use-Case, or End-to-End Feature. To obtain this, utilize **System Integration Tests** or **Manual Execution Scenarios**.

> ⚠️ **Common Pitfall: Avoid using standard Unit Tests.** Do not extract execution traces from isolated unit tests. Unit tests typically focus on low-level operations and often mock external dependencies. For example, if Component A calls Component B, but B is mocked during the test, the trace fails to capture the true architectural interaction between them, resulting in an incomplete architecture graph.

### File Format Requirements
* Each distinct trace (scenario/use-case) must be saved in its own separate **`.log` file**. 
* Do not combine multiple unrelated scenarios into a single log file.

### Log Line Syntax
SaboViz utilizes a strict custom parser for execution traces. Commented lines (starting with `//`, `#`, or `***`) and empty lines are ignored.

A valid execution event must be a single comma-separated line containing at least 8 specific fields, followed by a direction indicator (`>` for function entry, `<` for function exit), and an optional message (parameters or return values).

**The expected format order is:**
`Component, Field2, Process, Date, Time, FunctionSignature, Fields, PID, Extra , [> or <] Message`

**Examples of valid trace lines:**

* **Function Entry (`>`):**
  ```text
  AppServer, INFO, MainProcess, 2023-10-27, 10:00:00.123456us, Network::Socket::connect, , 1024, , > (const std::string& host, int port)
  ```
* **Function Entry (`>`):**
  ```text
  AppServer, INFO, MainProcess, 2023-10-27, 10:00:00.123500us, Network::Socket::connect, , 1024, , < returnValue="OK"
  ```

#### Syntax Rules for Best Results
1. **Scope Qualifiers:** The `FunctionSignature` field should ideally include the full C++ scope (`Namespace::Class::Method`). SaboViz uses these qualifiers to match the dynamic event to the exact static entity parsed from your source code.
2. **Microseconds:** Include `us` in the timestamp field (e.g., `123456us`) if possible, as the parser uses this to sequence rapid executions.
3. **Parameters:** For entry events (`>`), place the function parameters inside parentheses in the message string.
4. **Return Values:** For exit events (`<`), standard patterns like `returnValue="OK"` or `returnValue=1` in the message string will be automatically parsed and displayed in the UI.

Once your `.zip` source code and your `.log` execution trace files are prepared, proceed to the **[Usage Guide](USAGE_GUIDE.md)** to learn how to analyze them in the SaboViz dashboard.