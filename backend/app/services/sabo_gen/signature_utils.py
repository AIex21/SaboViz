import re
import urllib.parse
from typing import List, Tuple

_LOCATION_RE = re.compile(r"^\|([^|]+)\|$")

_MODIFIER_RE = re.compile(
    r"\b(?:virtual|static|inline|constexpr|consteval|constinit|extern|friend|explicit)\b"
)

_TYPE_KEYWORD_RE = re.compile(r"\b(?:const|volatile|class|struct|enum)\b")

def _unwrap_location(value: str) -> str:
    text = str(value or "").strip()

    match = _LOCATION_RE.match(text)
    if match:
        text = match.group(1)

    return urllib.parse.unquote(text)

def split_name_and_parameter_text(value: str) -> Tuple[str, str]:
    text = _unwrap_location(value).strip()

    start = text.find("(")
    if start < 0:
        return text.strip(), ""
    
    depth = 0
    end = -1

    for index in range(start, len(text)):
        char = text[index]

        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1

            if depth == 0:
                end = index
                break
    
    if end < 0:
        return text[:start].strip(), ""
    
    qualified_name = text[:start].strip()
    parameter_text = text[start + 1:end].strip()

    return qualified_name, parameter_text

def strip_function_modifiers(value: str) -> str:
    text = _MODIFIER_RE.sub("", str(value or ""))
    return " ".join(text.split())

def extract_scope_qualifiers(signature: str) -> List[str]:
    qualified_name, _ = split_name_and_parameter_text(signature)
    qualified_name = strip_function_modifiers(qualified_name)

    if "::" not in qualified_name:
        return []
    
    parts = [part.strip() for part in qualified_name.split("::") if part.strip()]

    if len(parts) <= 1:
        return []
    
    return parts[:-1]

def extract_simple_function_name(signature: str) -> str:
    qualified_name, _ = split_name_and_parameter_text(signature)
    qualified_name = strip_function_modifiers(qualified_name)

    if "::" in qualified_name:
        qualified_name = qualified_name.split("::")[-1]

    return qualified_name.strip()

def split_cpp_parameter_list(parameter_text: str) -> List[str]:
    text = str(parameter_text or "").strip()

    if not text or text.lower() == "void":
        return []
    
    parameters = []
    current = []

    angle_depth = 0
    paren_depth = 0
    bracket_depth = 0

    for char in text:
        if char == "<":
            angle_depth += 1
        elif char == ">" and angle_depth > 0:
            angle_depth -= 1
        elif char == "(":
            paren_depth += 1
        elif char == ")" and paren_depth > 0:
            paren_depth -= 1
        elif char == "[":
            bracket_depth += 1
        elif char == "]" and bracket_depth > 0:
            bracket_depth -= 1

        if (char in {",", ";"} and angle_depth == 0 and paren_depth == 0 and bracket_depth == 0):
            parameter = "".join(current).strip()
            if parameter:
                parameters.append(parameter)
            current = []
        else:
            current.append(char)

    parameter = "".join(current).strip()

    if parameter:
        parameters.append(parameter)

    if len(parameters) == 1 and parameters[0].lower() == "void":
        return []
    
    return parameters

def extract_signature_parameters(signature: str) -> List[str]:
    _, parameter_text = split_name_and_parameter_text(signature)
    return split_cpp_parameter_list(parameter_text)

def normalize_parameter_type(parameter: str) -> str:
    text = _unwrap_location(parameter)

    # Remove default values.
    if "=" in text:
        text = text.split("=", 1)[0].strip()

    text = _TYPE_KEYWORD_RE.sub(" ", text)
    text = " ".join(text.split())

    parts = text.split()
    if len(parts) > 1:
        last = parts[-1]

        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", last):
            text = " ".join(parts[:-1])

    text = re.sub(r"\s+", "", text)

    return text.lower()

def normalized_signature_parameters(signature_or_parameters) -> List[str]:
    if isinstance(signature_or_parameters, str):
        parameters = extract_signature_parameters(signature_or_parameters)
    else:
        parameters = list(signature_or_parameters or [])

    return [normalize_parameter_type(parameter) for parameter in parameters]

def _relaxed_parameter(parameter:str) -> str:
    return normalize_parameter_type(parameter).replace("&", "").replace("*", "")

def signatures_match(left_parameters, right_parameters) -> bool:
    left = normalized_signature_parameters(left_parameters)
    right = normalized_signature_parameters(right_parameters)

    if left == right:
        return True
    
    if len(left) != len(right):
        return False
    
    return [_relaxed_parameter(param) for param in left] == [_relaxed_parameter(param) for param in right]

def has_parameter_list(value: str) -> bool:
    text = _unwrap_location(value).strip()

    start = text.find("(")
    if start < 0:
        return False
    
    depth = 0
    
    for index in range(start, len(text)):
        char = text[index]

        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1

            if depth == 0:
                return True

    return False