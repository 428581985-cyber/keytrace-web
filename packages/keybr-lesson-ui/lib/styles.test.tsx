import { test } from "node:test";
import { parseColor } from "@keybr/color";
import {
  DynamicStylesContext,
  staticTheme,
  ThemeContext,
} from "@keybr/themes";
import { render } from "@testing-library/react";
import { equal, isTrue } from "rich-assert";
import { useKeyStyles } from "./styles.ts";

function Probe({ confidence }: { confidence: number }) {
  const { confidenceColor } = useKeyStyles();
  const rgb = parseColor(String(confidenceColor(confidence))).toRgb();
  return (
    <div
      data-testid="probe"
      data-r={Math.round(rgb.r * 255)}
      data-g={Math.round(rgb.g * 255)}
      data-b={Math.round(rgb.b * 255)}
    />
  );
}

function measureColor(slow: string, fast: string, confidence: number) {
  const host = document.createElement("div");
  host.style.setProperty("--slow-key-color", slow);
  host.style.setProperty("--fast-key-color", fast);
  document.body.appendChild(host);
  try {
    const r = render(
      <ThemeContext.Provider
        value={staticTheme({ color: "light", font: "normal" })}
      >
        <DynamicStylesContext.Provider value={{ getStyledElement: () => host }}>
          <Probe confidence={confidence} />
        </DynamicStylesContext.Provider>
      </ThemeContext.Provider>,
    );
    const el = r.getByTestId("probe");
    const result = {
      r: Number(el.getAttribute("data-r")),
      g: Number(el.getAttribute("data-g")),
      b: Number(el.getAttribute("data-b")),
    };
    r.unmount();
    return result;
  } finally {
    host.remove();
  }
}

test("confidenceColor keeps mid-range (0.5, 0.7) red/amber and reaches fast green at 1.0 in light & dark themes", () => {
  // Light theme (#cc0000 -> #60d788)
  const light05 = measureColor("#cc0000", "#60d788", 0.5);
  const light07 = measureColor("#cc0000", "#60d788", 0.7);
  const light10 = measureColor("#cc0000", "#60d788", 1.0);
  isTrue(light05.r > light05.g);
  isTrue(light07.r > light07.g);
  equal(light10.r, 96);
  equal(light10.g, 215);
  equal(light10.b, 136);

  // Dark theme (#8c1818 -> #448154)
  const dark05 = measureColor("#8c1818", "#448154", 0.5);
  const dark07 = measureColor("#8c1818", "#448154", 0.7);
  const dark10 = measureColor("#8c1818", "#448154", 1.0);
  isTrue(dark05.r > dark05.g);
  isTrue(dark07.r > dark07.g);
  equal(dark10.r, 68);
  equal(dark10.g, 129);
  equal(dark10.b, 84);
});
