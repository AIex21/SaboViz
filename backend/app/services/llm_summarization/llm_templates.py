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
            "description": "Describe the purpose of this file in 1-2 sentences, focused on what this file contributes locally. Do not restate the overall project/system domain."
        },
        "file_role": {
            "type": "string",
            "description": "A short role label for this file (e.g., 'API Router', 'Data Model Definitions', 'Utility Helpers')."
        },
        "responsibilities": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List 2 to 4 concrete responsibilities implemented by this file. Do not merely list child element names."
        }
    },
    "required": ["description", "file_role", "responsibilities"],
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
            "description": "Describe this folder in 1-2 sentences using concrete capabilities implemented by its contents. Avoid generic labels-only descriptions (e.g., do not return only 'Utility library')."
        },
        "key_contents": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List 2 to 5 concrete capabilities provided by this folder (e.g., 'path resolution utilities', 'trace parsing', 'schema validation')."
        }
    },
    "required": ["description", "key_contents"],
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
        "description": {
            "type": "string",
            "minLength": 20,
            "description": "A 1-2 sentence description explaining the exact functionality this group performs. Do not mention the overall system/project domain unless it is required for disambiguation."
        },
        "feature_name": {
            "type": "string",
            "minLength": 5,
            "description": "Final composed feature name using this template: [feature_action] + [feature_entity] + optional [feature_context]. Must be concrete and cluster-specific, and avoid broad system/domain mentions (e.g., use 'Setting Up Master Password' instead of adding 'in Security System')."
        }
    },
    "required": ["description", "feature_name"],
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

# ---------------------------------------------------------
# 8. MICRO FEATURE SCHEMA (Trace Segments)
# ---------------------------------------------------------
micro_feature_schema = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "minLength": 20,
            "description": "A 1-2 sentence flow-centered summary describing what happens in this trace segment, including key operation transitions. Keep it concrete and avoid broad project/domain context."
        },
        "feature_name": {
            "type": "string",
            "minLength": 5,
            "description": "A concise micro-feature label for this trace segment, derived from the concrete operation flow and responsibilities shown in the provided operations and edges."
        }
    },
    "required": ["description", "feature_name"],
    "additionalProperties": False
}

analyze_micro_feature_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeMicroFeature",
        "description": "Analyzes a small trace segment to identify a concrete micro-feature and summarize its operation flow.",
        "parameters": micro_feature_schema
    }
}]

# ---------------------------------------------------------
# 9. HIERARCHICAL FEATURE SCHEMA (Merged Consecutive Segments)
# ---------------------------------------------------------
hierarchical_feature_schema = {
    "type": "object",
    "properties": {
        "feature_name": {
            "type": "string",
            "minLength": 5,
            "description": "A concise merged feature name that captures the common execution intent across the two consecutive trace segments."
        },
        "description": {
            "type": "string",
            "minLength": 20,
            "description": "A 1-2 sentence merged summary that begins with 'Includes:' and combines both segment descriptions into one coherent flow."
        }
    },
    "required": ["feature_name", "description"],
    "additionalProperties": False
}

analyze_hierarchical_feature_tool = [{
    "type": "function",
    "function": {
        "name": "AnalyzeHierarchicalFeature",
        "description": "Merges two consecutive trace segment descriptions into a single higher-level hierarchical feature name and description.",
        "parameters": hierarchical_feature_schema
    }
}]