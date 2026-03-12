import urllib.parse


def strip_parser_workspace_prefix(path):
    if not path:
        return ""

    normalized = path.replace("\\", "/")
    marker = "/sabo-data/"

    if marker not in normalized:
        return normalized

    suffix = normalized.split(marker, 1)[1].lstrip("/")
    parts = suffix.split("/")

    if len(parts) >= 2 and parts[1] == "src":
        relative_parts = parts[2:]
        if not relative_parts:
            return "/"
        return "/" + "/".join(relative_parts)

    return normalized

def parse_m3_uri(uri):
    if uri.startswith("|"):
        parts = uri.split("|")
        clean_uri = parts[1]
    else:
        clean_uri = uri

    try:
        parsed = urllib.parse.urlparse(clean_uri)
        scheme = parsed.scheme
        path = urllib.parse.unquote(parsed.path)

        name_part = path.split("/")[-1]
        
        if "(" in name_part:
            name_part = name_part.split("(")[0]

        return scheme, path, name_part
    except:
        return "unknown", uri, uri
    
def normalize_path(path):
    if not path:
        return ""
    p = strip_parser_workspace_prefix(path).lower()
    if len(p) > 2 and p[0] == "/" and p[2] == ":":
        p = p[1:]
    return p

