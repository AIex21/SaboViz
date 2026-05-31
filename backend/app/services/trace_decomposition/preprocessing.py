class TracePreprocessor:
    def __init__(self, graph_service):
        self.graph_service = graph_service

    def preprocess_trace(self, trace_data, project_id):
        operation_nodes = self.graph_service.get_summary_map(project_id)

        elements = trace_data.get("elements", {}) if isinstance(trace_data, dict) else {}
        steps = elements.get("nodes", []) if isinstance(elements, dict) else []

        preprocessed_steps = []

        for step in steps:
            if not isinstance(step, dict):
                continue

            step_data = step.get("data", {})
            if not isinstance(step_data, dict):
                continue

            labels = step_data.get("labels", [])
            if "Action" not in labels:
                continue

            properties = step_data.get("properties", {})
            if not isinstance(properties, dict):
                continue

            operation_resolution = properties.get("operationResolution")
            if operation_resolution != "resolved":
                continue

            source_id = properties.get("sourceId")
            target_id = properties.get("targetId")

            enriched_properties = {
                **properties,
                "sourceSummary": operation_nodes.get(source_id, {}),
                "targetSummary": operation_nodes.get(target_id, {}),
            }

            enriched_step = {
                **step,
                "data": {
                    **step_data,
                    "properties": enriched_properties,
                },
            }

            preprocessed_steps.append(enriched_step)

        preprocessed_steps.sort(
            key=lambda step: self._safe_step_number(step)
        )

        return preprocessed_steps

    def _safe_step_number(self, step):
        properties = (
            step.get("data", {})
            .get("properties", {})
            if isinstance(step, dict)
            else {}
        )

        value = properties.get("step", 0)

        try:
            return int(value)
        except (TypeError, ValueError):
            return 0