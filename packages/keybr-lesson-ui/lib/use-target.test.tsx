import { test } from "node:test";
import {
  KeyboardContext,
  keyboardProps,
  Language,
  Layout,
  loadKeyboard,
} from "@keybr/keyboard";
import { lessonProps } from "@keybr/lesson";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { render } from "@testing-library/react";
import { equal } from "rich-assert";
import { useTarget } from "./use-target.ts";

function Probe() {
  const target = useTarget();
  return <span data-testid="speed">{target.targetSpeed}</span>;
}

test("useTarget resolves settings without KeyboardProvider and overrides via KeyboardContext", () => {
  const settings = new Settings()
    .set(keyboardProps.language, Language.EN)
    .set(keyboardProps.layout, Layout.EN_US)
    .set(lessonProps.targetSpeed, 210)
    .set(lessonProps.zhTargetSpeed, 110);

  // Fallback without KeyboardProvider -> uses settings (EN = 210)
  const r1 = render(
    <FakeSettingsContext initialSettings={settings}>
      <Probe />
    </FakeSettingsContext>,
  );
  equal(r1.getByTestId("speed").textContent, "210");
  r1.unmount();

  // With KeyboardContext set to ZH_SP (e.g. Profile ResultGrouper) -> uses ZH = 110
  const zhKeyboard = loadKeyboard(Layout.ZH_SP);
  const r2 = render(
    <FakeSettingsContext initialSettings={settings}>
      <KeyboardContext.Provider value={zhKeyboard}>
        <Probe />
      </KeyboardContext.Provider>
    </FakeSettingsContext>,
  );
  equal(r2.getByTestId("speed").textContent, "110");
  r2.unmount();
});
