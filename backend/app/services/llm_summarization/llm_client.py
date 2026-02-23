import json
import os
import re
from openai import OpenAI

class LLMClient:
    def __init__(self):
        self.base_url = os.getenv("LLM_BASE_URL")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder")

        self.is_enabled = bool(self.base_url and self.base_url.strip())

        if self.is_enabled:
            self.client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key
            )
        else:
            self.client = None

    def generate_json(self, prompt: str, tools: list) -> dict:
        try:
            tool_name = tools[0]["function"]["name"]

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert system architecture analyzer. You must analyze the provided code/context and respond strictly by calling the provided tool with the correct JSON schema."
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

            tool_calls = response.choices[0].message.tool_calls
            if tool_calls:
                json_string = tool_calls[0].function.arguments
                result_dict = json.loads(json_string)
            else:
                content = response.choices[0].message.content
                if content:
                    clean_content = re.sub(r'```(?:json)?\n?(.*?)\n?```', r'\1', content, flags=re.DOTALL).strip()

                    try: 
                        result_dict = json.loads(clean_content)
                    except json.JSONDecodeError:
                        raise ValueError(f"LLM failed to use the tool AND output invalid JSON. Raw output: {content[:200]}")

            if result_dict is None:
                raise ValueError("LLM did not return a tool call.")
            
            if "arguments" in result_dict and isinstance(result_dict["arguments"], dict):
                return result_dict["arguments"]
            
            if tool_name in result_dict and isinstance(result_dict[tool_name], dict):
                return result_dict[tool_name]
            
            return result_dict
            
        except Exception as e:
            print(f"[LLM Error] Failed to generate JSON for prompt. Error: {e}")
            return {
                "description": "(Analysis failed)",
                "error": str(e)
            }