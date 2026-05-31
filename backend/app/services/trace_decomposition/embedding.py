import hashlib
import math
import re

from app.services.trace_decomposition.utils import TraceDecompositionUtils

class TraceEmbedder:
    def __init__(self, context_radius=2, text_hash_dim=128, structure_hash_dim=128):
        self.utils = TraceDecompositionUtils()
        self.context_radius = context_radius
        self.text_hash_dim = text_hash_dim
        self.structure_hash_dim = structure_hash_dim

    def embed_segments(self, segments):
        embedded_segments = []

        for segment in segments:
            if not segment:
                embedded_segments.append([])
                continue

            base_vectors = [
                self._build_step_base_vector(segment, index)
                for index in range(len(segment))
            ]
            contextual_vectors = self._apply_context_window(base_vectors)

            embedded_steps = []
            for index, step in enumerate(segment):
                embedded_steps.append(
                    {
                        **step,
                        "embedding": contextual_vectors[index],
                    }
                )

            embedded_segments.append(embedded_steps)

        return embedded_segments
    
    def _build_step_base_vector(self, steps, index):
        node_properties = self.utils.get_step_properties(steps[index])

        step_type = str(node_properties.get("type") or "").lower()
        is_call = 1.0 if step_type == "call" else 0.0
        is_return = 1.0 if step_type == "return" else 0.0
        is_other = 1.0 if step_type not in ("call", "return") else 0.0

        depth = self.utils.safe_float(node_properties.get("depth", 0), 0.0)

        previous_depth = 0.0
        previous_type = ""

        if index > 0:
            previous_properties = self.utils.get_step_properties(steps[index - 1])
            previous_depth = self.utils.safe_float(previous_properties.get("depth", 0), 0.0)
            previous_type = str(previous_properties.get("type") or "").lower()

        next_depth = depth
        next_type = ""

        if index + 1 < len(steps):
            next_properties = self.utils.get_step_properties(steps[index + 1])
            next_depth = self.utils.safe_float(next_properties.get("depth"), depth)
            next_type = str(next_properties.get("type") or "").lower()

        depth_delta = depth - previous_depth
        next_depth_delta = next_depth - depth

        normalized_index = index / max(1.0, float(len(steps) - 1))

        source_id = str(node_properties.get("sourceId") or "")
        target_id = str(node_properties.get("targetId") or "")

        source_summary = node_properties.get("sourceSummary")
        target_summary = node_properties.get("targetSummary")

        source_summary_text = self._summary_to_text(source_summary)
        target_summary_text = self._summary_to_text(target_summary)

        source_uri_info = self._extract_uri_info(source_id)
        target_uri_info = self._extract_uri_info(target_id)

        source_param_count = float(self._count_uri_parameters(source_id))
        target_param_count = float(self._count_uri_parameters(target_id))

        same_root_context = 1.0 if (
            source_uri_info["root"]
            and source_uri_info["root"] == target_uri_info["root"]
        ) else 0.0

        same_parent_context = 1.0 if (
            source_uri_info["parent"]
            and source_uri_info["parent"] == target_uri_info["parent"]
        ) else 0.0

        same_operation = 1.0 if (
            source_uri_info["operation"]
            and source_uri_info["operation"] == target_uri_info["operation"]
        ) else 0.0

        root_level_call = 1.0 if is_call and depth <= 0.0 else 0.0
        root_level_return = 1.0 if is_return and depth <= 0.0 else 0.0

        previous_was_return = 1.0 if previous_type == "return" else 0.0
        next_is_call = 1.0 if next_type == "call" else 0.0

        numeric_features = [
            is_call,
            is_return,
            is_other,

            # Depth-related behavior
            self._log_scaled(depth),
            self._signed_log_scaled(depth_delta),
            self._signed_log_scaled(next_depth_delta),

            # Position inside the current coarse segment
            normalized_index,

            # Call signature complexity
            self._log_scaled(source_param_count),
            self._log_scaled(target_param_count),

            # Source-target static context
            same_root_context,
            same_parent_context,
            same_operation,

            # Episode-transition hints
            root_level_call,
            root_level_return,
            previous_was_return,
            next_is_call,

            #Summary availability
            1.0 if source_summary_text else 0.0,
            1.0 if target_summary_text else 0.0,
        ]

        structural_tokens = []

        structural_tokens.extend(
            self._uri_context_tokens(source_id, role="source")
        )

        structural_tokens.extend(
            self._uri_context_tokens(target_id, role="target")
        )

        structural_tokens.extend(
            self._source_target_pair_tokens(source_uri_info, target_uri_info)
        )

        lexical_payload = " ".join(
            [
                source_id,
                target_id,
                source_summary_text,
                target_summary_text
            ]
        )

        lexical_features = self._hashed_text_vector(
            lexical_payload, 
            self.text_hash_dim
        )

        structural_features = self._hashed_text_vector(
            " ".join(structural_tokens),
            self.structure_hash_dim,
        )


        return (
            numeric_features 
            + lexical_features 
            + structural_features
        )

    def _apply_context_window(self, base_vectors):
        contextual_vectors = []

        if not base_vectors:
            return contextual_vectors
        
        vector_size = len(base_vectors[0])

        for index in range(len(base_vectors)):
            start = max(0, index - self.context_radius)
            end = min(len(base_vectors), index + self.context_radius + 1)
            window = base_vectors[start:end]

            context_avg = [0.0] * vector_size

            for vector in window:
                for dim in range(vector_size):
                    context_avg[dim] += vector[dim]

            window_size = float(len(window))
            context_avg = [value / window_size for value in context_avg]

            contextual_vectors.append(base_vectors[index] + context_avg)

        return contextual_vectors
    
    def _summary_to_text(self, summary):
        if isinstance(summary, str):
            return summary

        if isinstance(summary, dict):
            description = str(summary.get("description") or "")
            return f"{description}".strip()

        return ""
    
    def _extract_uri_info(self, uri):
        value = str(uri or "")

        if ":///" in value:
            value = value.split(":///", 1)[1]

        value_without_signature = value.split("(", 1)[0]
        value_without_signature = (
            value_without_signature
            .replace("\\", "/")
            .replace("::", "/")
        )

        parts = [
            part.lower()
            for part in re.split(r"[/#.$]+", value_without_signature)
            if part
        ]

        operation = parts[-1] if parts else ""
        parent = parts[-2] if len(parts) > 1 else ""
        root = parts[0] if parts else ""

        return {
            "root": root,
            "parent": parent,
            "operation": operation,
            "parts": parts,
        }

    def _uri_context_tokens(self, uri, role):
        info = self._extract_uri_info(uri)

        tokens = []

        if info["root"]:
            tokens.append(f"{role}:root:{info['root']}")

        if info["parent"]:
            tokens.append(f"{role}:parent:{info['parent']}")

        if info["operation"]:
            tokens.append(f"{role}:operation:{info['operation']}")

        # Add the last few context parts because these usually capture
        # namespace/class/file context without making the vector too noisy.
        for part in info["parts"][:-1][-4:]:
            tokens.append(f"{role}:context:{part}")

        # Add parameter/type tokens from the signature.
        for token in self._signature_tokens(uri):
            tokens.append(f"{role}:signature:{token}")

        return tokens
    
    def _source_target_pair_tokens(self, source_info, target_info):
        tokens = []

        if source_info["root"] and target_info["root"]:
            tokens.append(f"pair:root:{source_info['root']}->{target_info['root']}")

            if source_info["root"] == target_info["root"]:
                tokens.append(f"pair:same_root:{source_info['root']}")

        if source_info["parent"] and target_info["parent"]:
            tokens.append(
                f"pair:parent:{source_info['parent']}->{target_info['parent']}"
            )

            if source_info["parent"] == target_info["parent"]:
                tokens.append(f"pair:same_parent:{source_info['parent']}")

        if source_info["operation"] and target_info["operation"]:
            tokens.append(
                f"pair:operation:{source_info['operation']}->{target_info['operation']}"
            )

        return tokens
    
    def _signature_tokens(self, uri):
        value = str(uri or "")

        if "(" not in value or ")" not in value:
            return []

        start = value.find("(") + 1
        end = value.rfind(")")

        if end <= start:
            return []

        signature = value[start:end].strip()

        if not signature:
            return []

        tokens = []

        for parameter in signature.split(","):
            parameter = parameter.strip()

            if not parameter:
                continue

            for token in self._tokenize(parameter):
                tokens.append(token)

        return tokens

    def _count_uri_parameters(self, uri):
        if not uri or "(" not in uri or ")" not in uri:
            return 0

        start = uri.find("(") + 1
        end = uri.rfind(")")
        if end <= start:
            return 0

        params = uri[start:end].strip()
        if not params:
            return 0

        return len([p for p in params.split(",") if p.strip()])

    def _hashed_text_vector(self, text, dim):
        vector = [0.0] * dim

        if not text:
            return vector

        tokens = self._tokenize(text)

        if not tokens:
            return vector

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
            bucket = int(digest[:8], 16) % dim
            vector[bucket] += 1.0

        norm = math.sqrt(sum(value * value for value in vector))

        if norm > 0:
            vector = [value / norm for value in vector]

        return vector

    def _tokenize(self, text):
        if not text:
            return []

        raw_tokens = re.findall(r"[A-Za-z0-9_]+", str(text))
        tokens = []

        for raw_token in raw_tokens:
            camel_parts = re.findall(
                r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|\d+",
                raw_token,
            )

            candidates = [raw_token] + camel_parts

            if "_" in raw_token:
                candidates.extend(raw_token.split("_"))

            for candidate in candidates:
                normalized = self._normalize_token(candidate)
                if normalized:
                    tokens.append(normalized)

        return tokens

    def _normalize_token(self, token):
        token = str(token or "").strip().lower()
        token = re.sub(r"[^a-z0-9_]+", "", token)
        return token
    
    def _log_scaled(self, value):
        value = max(0.0, self.utils.safe_float(value, 0.0))
        return math.log1p(value)

    def _signed_log_scaled(self, value):
        value = self.utils.safe_float(value, 0.0)

        if value == 0.0:
            return 0.0

        sign = 1.0 if value > 0.0 else -1.0
        return sign * math.log1p(abs(value))