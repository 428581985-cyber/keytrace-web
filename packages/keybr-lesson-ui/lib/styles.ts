import { mixColors, parseColor } from "@keybr/color";
import { clamp } from "@keybr/lang";
import { useComputedStyles } from "@keybr/themes";
import { type CSSProperties, useMemo } from "react";

export function useKeyStyles() {
  const { getPropertyValue } = useComputedStyles();
  const slow = getPropertyValue("--slow-key-color") || "#cc0000";
  const fast = getPropertyValue("--fast-key-color") || "#60d788";

  return useMemo(() => {
    const min = parseColor(slow);
    const max = parseColor(fast);

    function confidenceColor(confidence: number) {
      const calibrated = Math.pow(clamp(confidence, 0, 1), 2.2);
      return mixColors(min, max, calibrated);
    }

    function keyStyles(
      isIncluded: boolean,
      confidence: number | null,
    ): CSSProperties {
      if (isIncluded && confidence != null) {
        return {
          backgroundColor: String(confidenceColor(confidence)),
        };
      } else {
        return {};
      }
    }

    return { confidenceColor, keyStyles };
  }, [slow, fast]);
}
