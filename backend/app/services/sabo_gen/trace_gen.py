import re
import sys
import json
from typing import List, Optional

class TraceEntry:
    def __init__(self, component: str, field2: str, process: str, timestamp: str, function_name: str, fields: str, pid: str, extra: str, direction: str, message: str, raw_line: str, line_number: int):
        self.component = component
        self.field2 = field2
        self.process = process
        self.timestamp = timestamp
        self.function_name = function_name
        self.fields = fields
        self.pid = pid
        self.extra = extra
        self.direction = direction
        self.message = message
        self.raw_line = raw_line
        self.line_number = line_number

    def is_function_entry(self):
        return self.direction == '>'
    
    def is_function_exit(self):
        return self.direction == '<'
    
    def microseconds(self):
        match = re.search(r'(\d+)us', self.timestamp)
        return int(match.group(1)) if match else 0
    
    def get_clean_function_name(self) -> str:
        clean_name = self.function_name
        
        # Handle C++ function signatures - extract just the function name
        if "::" in clean_name:
            # Extract the actual function name from C++ signature
            parts = clean_name.split("::")
            if len(parts) > 1:
                clean_name = parts[-1]  # Get the last part (actual function name)
        
        # Remove template parameters and function signatures
        if "(" in clean_name:
            clean_name = clean_name.split("(")[0]
        
        # Remove virtual/const keywords
        clean_name = clean_name.replace("virtual ", "").replace("const ", "").strip()
        
        # Remove common prefixes to make diagrams more readable
        prefixes_to_remove = [
            f"{self.component}_",
            f"{self.component.lower()}_",
            "rq_",
            "APP_",
            "CTRL_",
            "impl",
            "_impl",
        ]
        
        for prefix in prefixes_to_remove:
            if clean_name.startswith(prefix):
                clean_name = clean_name[len(prefix):]
                break
        
        # Remove trailing _impl suffix
        if clean_name.endswith("_impl"):
            clean_name = clean_name[:-5]
        
        # Limit function name length
        if len(clean_name) > 35:
            clean_name = clean_name[:32] + "..."
                
        return clean_name
    
    def get_display_parameters(self):
        if not self.message:
            return ""
            
        # Extract parameters from the message
        params = self.message.strip()
        
        # For function entries, extract parameters from parentheses
        if self.is_function_entry():
            # Look for patterns like "component (params)" or just "(params)"
            paren_match = re.search(r'\(([^)]*)\)', params)
            if paren_match:
                params = paren_match.group(1)
        
        # For function exits, extract return values
        elif self.is_function_exit():
            return_val = self.extract_return_value()
            return return_val if return_val else ""
            
        # Limit parameter length for readability
        # if len(params) > 60:
        #     params = params[:57] + "..."
            
        return params
    
    def extract_return_value(self):
        if self.direction != '<' or not self.message:
            return None
            
        message = self.message.strip()
        
        # Look for returnValue= patterns
        return_patterns = [
            r'returnValue="([^"]*)"',
            r'returnValue=([^,)]+)',
            r'= "([^"]*)"',
            r'= ([^,)]+)$',
            r'"(OK|ERROR|FAIL|NOK)"$',
        ]
        
        for pattern in return_patterns:
            match = re.search(pattern, message)
            if match:
                return match.group(1)
        
        # If message ends with "OK" or similar, use that
        if message.endswith('"OK"') or message.endswith('="OK"'):
            return "OK"
                
        return None
    
    def extract_target_component(self) -> Optional[str]:
        """Extract target component from function entry message."""
        if not self.is_function_entry():
            return None
            
        # Look for patterns like "> COMPONENT_NAME" at the start of message
        target_match = re.match(r'^(\w+)\s*\(', self.message)
        if target_match:
            return target_match.group(1)
            
        return None
    
class TraceParser:
    def __init__(self):
        pass

    def parse_file(self, content: str):
        entries = []

        lines = content.splitlines()

        for line_num, line in enumerate(lines, 1):
            line = line.strip()

            if (line.startswith('***') or line.startswith('//') or not line or line.startswith('#')):
                continue

            entry = self.parse_line(line, line_num)
            if entry:
                entries.append(entry)

        return entries
    
    def parse_line(self, line: str, line_num: int):
        direction_match = re.search(r',([><])\s*(.*)$', line)
        if not direction_match:
            return None
        
        direction = direction_match.group(1)
        message = direction_match.group(2).strip()

        line_without_message = line[:direction_match.start()]

        parts = line_without_message.split(',')

        if len(parts) < 8:
            return None
        
        component = parts[0].strip()
        field2 = parts[1].strip()
        process = parts[2].strip()

        if len(parts) >= 5:
            timestamp = f"{parts[3]},{parts[4]}".strip()
            function_name = parts[5].strip() if len(parts) > 5 else ""
            fields = parts[6].strip() if len(parts) > 6 else ""
            pid = parts[7].strip() if len(parts) > 7 else ""
            extra = parts[8].strip() if len(parts) > 8 else ""
        else:
            timestamp = parts[3].strip()
            function_name = parts[4].strip() if len(parts) > 4 else ""
            fields = ""
            pid = ""
            extra = ""
            
        entry = TraceEntry(
            component=component,
            field2=field2,
            process=process,
            timestamp=timestamp,
            function_name=function_name,
            fields=fields,
            pid=pid,
            extra=extra,
            direction=direction,
            message=message,
            raw_line=line,
            line_number=line_num
        )

        entry.function_name = entry.get_clean_function_name()

        return entry
    
class SequenceBuilder:
    def __init__(self):
        self.sequence = []
        self.stack = []

    def process_entries(self, entries: List[TraceEntry]):
        for entry in entries:
            func = entry.function_name

            event_type = "unknown"
            depth = len(self.stack)

            if entry.is_function_entry():
                event_type = "call"
                self.stack.append(func)
            elif entry.is_function_exit():
                event_type = "return"
                if self.stack:
                    self.stack.pop()
                    depth = len(self.stack)

            event_obj = {
                "step": len(self.sequence) + 1,
                "type": event_type,
                "function": func,
                "parameters": entry.get_display_parameters(),
                "timestamp": entry.timestamp,
                "depth": depth,
                "message": entry.message
            }

            self.sequence.append(event_obj)

    def get_sequence(self):
        return self.sequence