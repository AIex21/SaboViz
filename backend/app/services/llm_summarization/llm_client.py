import json
import os
import re
import httpx
from openai import OpenAI


class LLMClient:
    MAX_ATTEMPTS = 3

    def __init__(self):
        self.base_url = os.getenv("LLM_BASE_URL")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder")

        self.is_enabled = bool(self.base_url and self.base_url.strip())

        if self.is_enabled:
            custom_http_client = httpx.Client(verify=False)

            self.client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                http_client=custom_http_client
            )
        else:
            self.client = None

    def generate_json(self, prompt: str, tools: list) -> dict:
        last_error = None

        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            try:
                result_dict, result_schema = self._request_json(prompt, tools)
                self._validate_json_schema(result_dict, result_schema)
                return result_dict
            except Exception as error:
                last_error = error
                print(
                    f"[LLM Error] Attempt {attempt}/{self.MAX_ATTEMPTS} "
                    f"failed to generate valid JSON. Error: {error}"
                )

        return {
            "description": "(Analysis failed)",
            "error": str(last_error)
        }

    def _request_json(self, prompt: str, tools: list) -> tuple[dict, dict]:
        tool = tools[0]["function"]
        tool_name = tool["name"]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert system architecture analyzer. You must analyze the provided code/context and respond strictly by calling the provided tool with the correct JSON schema. Do not guess, expand, or reinterpret abbreviations/acronyms from names, identifiers, or snippets. Keep abbreviations exactly as written unless the full form is explicitly provided in the given context."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            tools=tools,
            tool_choice={
                "type": "function",
                "function": {
                    "name": tool_name
                }
            },
            temperature=0.0
        )

        result_dict = None
        message = response.choices[0].message
        tool_calls = message.tool_calls

        if tool_calls:
            result_dict = json.loads(tool_calls[0].function.arguments)
        elif message.content:
            clean_content = re.sub(
                r'```(?:json)?\n?(.*?)\n?```',
                r'\1',
                message.content,
                flags=re.DOTALL
            ).strip()

            try:
                result_dict = json.loads(clean_content)
            except json.JSONDecodeError as error:
                raise ValueError(
                    "LLM failed to use the tool and returned invalid JSON. "
                    f"Raw output: {message.content[:200]}"
                ) from error

        if result_dict is None:
            raise ValueError("LLM did not return a tool call or JSON content.")

        if "arguments" in result_dict and isinstance(result_dict["arguments"], dict):
            result_dict = result_dict["arguments"]
        elif tool_name in result_dict and isinstance(result_dict[tool_name], dict):
            result_dict = result_dict[tool_name]

        return result_dict, tool.get("parameters", {})

    def _validate_json_schema(self, value, schema: dict, path: str = "result"):
        expected_type = schema.get("type")
        type_matches = {
            "object": lambda item: isinstance(item, dict),
            "array": lambda item: isinstance(item, list),
            "string": lambda item: isinstance(item, str),
            "number": lambda item: isinstance(item, (int, float)) and not isinstance(item, bool),
            "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
            "boolean": lambda item: isinstance(item, bool),
            "null": lambda item: item is None,
        }

        if expected_type in type_matches and not type_matches[expected_type](value):
            raise ValueError(f"{path} must be of type {expected_type}.")

        if expected_type == "object":
            properties = schema.get("properties", {})
            missing_fields = [
                field for field in schema.get("required", []) if field not in value
            ]
            if missing_fields:
                raise ValueError(
                    f"{path} is missing required fields: {', '.join(missing_fields)}."
                )

            if schema.get("additionalProperties") is False:
                unexpected_fields = set(value) - set(properties)
                if unexpected_fields:
                    raise ValueError(
                        f"{path} contains unexpected fields: "
                        f"{', '.join(sorted(unexpected_fields))}."
                    )

            for field, field_value in value.items():
                if field in properties:
                    self._validate_json_schema(
                        field_value,
                        properties[field],
                        f"{path}.{field}"
                    )

        elif expected_type == "array":
            item_schema = schema.get("items")
            if item_schema:
                for index, item in enumerate(value):
                    self._validate_json_schema(item, item_schema, f"{path}[{index}]")

        elif expected_type == "string":
            min_length = schema.get("minLength")
            if min_length is not None and len(value) < min_length:
                raise ValueError(
                    f"{path} must contain at least {min_length} characters."
                )
