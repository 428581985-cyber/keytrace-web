import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  Language,
  Layout,
  switchPracticeLanguage,
} from "@keybr/keyboard";
import { lessonProps } from "@keybr/lesson";
import { Settings, SettingsContext } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { equal, isNotNull } from "rich-assert";
import { TargetSpeedProp } from "./TargetSpeedProp.tsx";

function Harness({
  initialSettings,
  onSettingsChange,
  children,
}: {
  readonly initialSettings: Settings;
  readonly onSettingsChange: (next: Settings) => void;
  readonly children: ReactNode;
}): ReactNode {
  const [settings, setSettings] = useState(initialSettings);
  const updateSettings = (next: Settings) => {
    setSettings(next);
    onSettingsChange(next);
  };
  return (
    <FakeIntlProvider>
      <SettingsContext.Provider value={{ settings, updateSettings }}>
        {children}
        <button
          type="button"
          onClick={() => {
            updateSettings(switchPracticeLanguage(settings, "zh"));
          }}
        >
          switch-zh
        </button>
        <button
          type="button"
          onClick={() => {
            updateSettings(switchPracticeLanguage(settings, "en"));
          }}
        >
          switch-en
        </button>
        <button
          type="button"
          onClick={() => {
            updateSettings(settings.reset());
          }}
        >
          reset-all
        </button>
      </SettingsContext.Provider>
    </FakeIntlProvider>
  );
}

test("edits EN and ZH target speeds independently and resets both to defaults", () => {
  let latest = new Settings();
  const r = render(
    <Harness
      initialSettings={latest}
      onSettingsChange={(next) => {
        latest = next;
      }}
    >
      <TargetSpeedProp />
    </Harness>,
  );

  try {
    // Default English context: targetSpeed=175 (35.0wpm), min=75, max=750.
    isNotNull(r.queryByText("Target typing speed (English):"));
    isNotNull(
      r.queryByText(/Chinese and English target typing speeds are saved/),
    );
    const sliderEn = r.getByRole("slider") as HTMLInputElement;
    equal(sliderEn.min, "75");
    equal(sliderEn.max, "750");
    equal(sliderEn.value, "175");

    // Change EN target speed to 225 CPM (45 WPM).
    fireEvent.change(sliderEn, { target: { value: "225" } });
    equal(latest.get(lessonProps.targetSpeed), 225);
    equal(latest.get(lessonProps.zhTargetSpeed), 125);

    // Switch to Chinese: label, bounds, and value switch to zhTargetSpeed (default 125, min 50).
    fireEvent.click(r.getByText("switch-zh"));
    isNotNull(r.queryByText("Target typing speed (Chinese):"));
    const sliderZh = r.getByRole("slider") as HTMLInputElement;
    equal(sliderZh.min, "50");
    equal(sliderZh.max, "750");
    equal(sliderZh.value, "125");

    // Adjust ZH target speed down to 95 CPM (below EN min 75 is also allowed, test 60).
    fireEvent.change(sliderZh, { target: { value: "60" } });
    equal(latest.get(lessonProps.zhTargetSpeed), 60);
    equal(latest.get(lessonProps.targetSpeed), 225);

    // Switch back to EN: still 225.
    fireEvent.click(r.getByText("switch-en"));
    equal((r.getByRole("slider") as HTMLInputElement).value, "225");
    equal(latest.get(lessonProps.zhTargetSpeed), 60);

    // Reset restores both EN (175) and ZH (125).
    fireEvent.click(r.getByText("reset-all"));
    equal(latest.get(lessonProps.targetSpeed), 175);
    equal(latest.get(lessonProps.zhTargetSpeed), 125);
  } finally {
    r.unmount();
  }
});

test("uses legacy target speed label for non-EN non-ZH languages", () => {
  const settings = KeyboardOptions.default()
    .withLanguage(Language.DE)
    .withLayout(Layout.DE_DE)
    .save(new Settings());

  const r = render(
    <FakeIntlProvider>
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <TargetSpeedProp />
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(r.queryByText("Target typing speed:"));
  } finally {
    r.unmount();
  }
});
