import urllib.parse

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
    p = path.replace("\\", "/").lower()
    if len(p) > 2 and p[0] == "/" and p[2] == ":":
        p = p[1:]
    return p

