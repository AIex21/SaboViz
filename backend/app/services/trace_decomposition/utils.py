from typing import Any


class TraceDecompositionUtils:
    def __init__(self):
        pass

    def get_step_properties(self, step):
        if not isinstance(step, dict):
            return {}

        direct_properties = step.get("properties")
        if isinstance(direct_properties, dict):
            return direct_properties

        data = step.get("data")
        if isinstance(data, dict):
            nested_properties = data.get("properties")
            if isinstance(nested_properties, dict):
                return nested_properties

        return {}
    
    def summary_to_text(self, summary):
        if isinstance(summary, str):
            return summary

        if isinstance(summary, dict):
            description = str(summary.get("description") or "")
            return f"{description}".strip()

        return ""

    def safe_float(self, value, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
        
    def extract_step_numbers(self, segment_steps) -> list[int]:
        step_numbers = []

        for step in segment_steps:
            properties = self.get_step_properties(step)
            value: Any = properties.get("step")

            if isinstance(value, (int, float)):
                step_numbers.append(int(value))
            elif isinstance(value, str):
                stripped = value.strip()
                if stripped.isdigit():
                    step_numbers.append(int(stripped))

        return step_numbers
        