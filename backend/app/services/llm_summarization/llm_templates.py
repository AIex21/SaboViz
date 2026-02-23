# app/services/llm_summarization/llm_templates.py

# ---------------------------------------------------------
# 1. OPERATION SCHEMA (Methods, Functions)
# ---------------------------------------------------------
operation_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "One-sentence description of the Operation's core functionality."
        },
        "howItWorks": {
            "type": "string",
            "description": "Implementation details in less than three sentences."
        }
    },
    "required": ["description", "howItWorks"],
    "additionalProperties": False
}

analyze_operation_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeOperation",
        "description": "Analyzes a software Operation (function/method) based on its source code and dependencies.",
        "parameters": operation_schema
    }
}]

# ---------------------------------------------------------
# 2. TYPE SCHEMA (Classes, Structs, Enums)
# ---------------------------------------------------------
type_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "Up to three sentences describing the key purpose of this Type."
        },
        "responsibilities": {
            "type": "array",
            "items": {"type": "string"},
            "description": "A short list of 2 to 4 primary functional responsibilities of this Type."
        }
    },
    "required": ["description", "responsibilities"],
    "additionalProperties": False
}

analyze_type_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeType",
        "description": "Analyzes a software Type (Class/Struct) based on its enclosed operations and relationships.",
        "parameters": type_schema
    }
}]

# ---------------------------------------------------------
# 3. SCOPE SCHEMA (Namespaces, Packages)
# ---------------------------------------------------------
scope_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "Describe the overarching functionality and purpose of this logical Scope (Namespace) based on its enclosed components."
        },
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "A list of 3 to 5 core domain keywords that define this scope."
        }
    },
    "required": ["description", "keywords"],
    "additionalProperties": False
}

analyze_scope_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeScope",
        "description": "Analyzes a logical Scope (Namespace) based on the Types and sub-scopes it contains.",
        "parameters": scope_schema
    }
}]

# ---------------------------------------------------------
# 4. FILE SCHEMA (Source Files)
# ---------------------------------------------------------
file_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "Describe the purpose of this file. Does it contain utility functions, a specific module implementation, or definitions?"
        },
        "main_components": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List the most critical classes or functions defined in this file."
        }
    },
    "required": ["description", "main_components"],
    "additionalProperties": False
}

analyze_file_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeFile",
        "description": "Analyzes a source code file (cpp/h) based on the elements it declares and includes.",
        "parameters": file_schema
    }
}]

# ---------------------------------------------------------
# 5. FOLDER SCHEMA (Directories/Subsystems)
# ---------------------------------------------------------
folder_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "Describe the architectural role of this folder. Is it a feature subsystem, a utility library, or a configuration directory?"
        },
        "architectural_layer": {
            "type": "string",
            "description": "Guess the architectural layer (e.g., 'UI', 'Business Logic', 'Data Access', 'Utility')."
        }
    },
    "required": ["description", "architectural_layer"],
    "additionalProperties": False
}

analyze_folder_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeFolder",
        "description": "Analyzes a physical directory based on the files and subfolders it contains.",
        "parameters": folder_schema
    }
}]

# ---------------------------------------------------------
# 6. PROJECT SCHEMA (Root)
# ---------------------------------------------------------
project_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "A comprehensive executive summary of the entire software project."
        },
        "domain": {
            "type": "string",
            "description": "The likely application domain (e.g., 'Embedded Systems', 'Web API', 'Graphics Engine', 'Financial Tool')."
        },
        "key_features": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List 3-5 major features provided by this project."
        }
    },
    "required": ["description", "domain", "key_features"],
    "additionalProperties": False
}

analyze_project_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeProject",
        "description": "Analyzes the root project based on its high-level folder structure.",
        "parameters": project_schema
    }
}]

# ---------------------------------------------------------
# 7. FEATURE SCHEMA (Functional Clusters)
# ---------------------------------------------------------
feature_schema = {
    "type": "object",
    "properties": {
        "feature_name": {
            "type": "string",
            "description": "A concise, human-readable name for this functional feature (e.g., 'User Authentication', 'Payment Processing', 'Data Export'). Avoid using raw code syntax like 'process_data'."
        },
        "description": {
            "type": "string",
            "description": "A 1-2 sentence description explaining the high-level business logic or functionality this group of operations performs."
        }
    },
    "required": ["feature_name", "description"],
    "additionalProperties": False
}

analyze_feature_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeFeature",
        "description": "Analyzes a cluster of tightly coupled software operations to determine their overarching functional feature.",
        "parameters": feature_schema
    }
}]