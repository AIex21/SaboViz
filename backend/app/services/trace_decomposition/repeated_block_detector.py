class RepeatedBlockDetector:
    def __init__(
            self,
            utils,
            max_block_size: int = 20,
            min_repeats: int = 2,
            min_saved_steps: int = 3,
            ):
        self.utils = utils
        self.max_block_size = max_block_size
        self.min_repeats = min_repeats
        self.min_saved_steps = min_saved_steps

    def compress(self, steps):
        tokens = [self._step_signauture(step) for step in steps]
        result = []

        index = 0
        while index < len(tokens):
            repeat = self._find_best_repeat(tokens, index)

            if repeat is None:
                result.append({
                    "type": "step",
                    **self._step_summary(steps[index]),
                })
                index += 1
                continue

            block_size, repeat_count = repeat
            block_steps = steps[index:index + block_size]

            result.append({
                "type": "repeat",
                "repeatCount": repeat_count,
                "startStep": self._step_number(steps[index]),
                "endStep": self._step_number(steps[index + (block_size * repeat_count) - 1]),
                "steps": [self._step_summary(step) for step in block_steps],
            })

            index += block_size * repeat_count

        return result
    
    def _find_best_repeat(self, tokens, start_index):
        remaining = len(tokens) - start_index
        max_block_size = min(self.max_block_size, remaining // 2)

        best = None
        best_score = -1

        for block_size in range(1, max_block_size + 1):
            pattern = tokens[start_index:start_index + block_size]
            repeat_count = 1

            cursor = start_index + block_size
            while (cursor + block_size <= len(tokens) and tokens[cursor:cursor + block_size] == pattern):
                repeat_count += 1
                cursor += block_size

            if repeat_count < self.min_repeats:
                continue

            saved_steps = block_size * (repeat_count - 1)

            if saved_steps < self.min_saved_steps:
                continue

            score = saved_steps

            if score > best_score:
                best_score = score
                best = (block_size, repeat_count)

        return best
    
    def _step_signauture(self, step):
        properties = self.utils.get_step_properties(step)

        return (
            str(properties.get("type") or "").lower(),
            str(properties.get("sourceId") or ""),
            str(properties.get("targetId") or ""),
        )
    
    def _step_summary(self, step):
        properties = self.utils.get_step_properties(step)

        return {
            "step": self._step_number(step),
            "kind": str(properties.get("type") or "step").lower(),
            "depth": properties.get("depth"),
            "sourceId": properties.get("sourceId"),
            "targetId": properties.get("targetId"),
        }

    def _step_number(self, step):
        properties = self.utils.get_step_properties(step)
        value = properties.get("step")

        try:
            return int(value)
        except (TypeError, ValueError):
            return None