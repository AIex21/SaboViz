# -- SABO 2.0 Node Labels ---

# Development Elements
NODE_PROJECT = "Project"
NODE_FOLDER = "Folder"
NODE_FILE = "File"

# Functional Elements
NODE_SCOPE = "Scope" # Namespaces, Packages
NODE_TYPE = "Type" # Classes, Structs, Enums
NODE_OPERATION = "Operation" # Methods, Functions
NODE_VARIABLE = "Variable" # Fields, Parameters

# Dynamic Elements
NODE_TRACE = "Trace"
NODE_ACTION = "Action"

# --- SABO 2.0 Edge Labels ---

# Development Elements
EDGE_INCLUDES = "includes" # Project -> Folder
EDGE_CONTAINS = "contains" # Folder -> File/Folder
EDGE_DECLARES = "declares" # File -> Functional Element
EDGE_REQUIRES = "requires" # File -> File

# Functional Elements
EDGE_ENCLOSES = "encloses" # Scope -> Scope / Type / Operation / Variable
EDGE_ENCAPSULATES = "encapsulates" # Type -> Operation / Variable
EDGE_INVOKES = "invokes" # Operation -> Operation
EDGE_USES = "uses" # Operation -> Variable
EDGE_SPECIALIZES = "specializes" # Type -> Type (Inheritance)
EDGE_RETURNS = "returns" # Operation -> Type
EDGE_TYPED = "typed" # Variable -> Type
EDGE_INSTANTIATES = "instantiates" # Operation -> Type
EDGE_PARAMETERIZES = "parameterizes" # Variable -> Operation

# Dynamic Elements
EDGE_PRECEDES = "precedes"
EDGE_EXECUTES = "executes"

# --- M3 to SABO 2.0 Mappings ---
M3_TO_SABO = {
    "cpp+namespace": NODE_SCOPE,

    "cpp+class": NODE_TYPE,
    "cpp+struct": NODE_TYPE,
    "cpp+union": NODE_TYPE,
    "cpp+template": NODE_TYPE,
    "cpp+enum": NODE_TYPE,

    "cpp+function": NODE_OPERATION,
    "cpp+method": NODE_OPERATION,
    "cpp+constructor": NODE_OPERATION,
    "cpp+destructor": NODE_OPERATION,
    
    "cpp+variable": NODE_VARIABLE,
    "cpp+field": NODE_VARIABLE,
    "cpp+parameter": NODE_VARIABLE,
}
