import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  keyboardProps,
  KeyboardProvider,
  Language,
  Layout,
} from "@keybr/keyboard";
import { Settings, SettingsContext } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { equal, isNotNull, isNull } from "rich-assert";
import { KeyboardSettings } from "./KeyboardSettings.tsx";

function TestSettingsProvider({
  initialSettings,
  onChange,
  children,
}: {
  readonly initialSettings: Settings;
  readonly onChange: (next: Settings) => void;
  readonly children: ReactNode;
}): ReactNode {
  const [settings, setSettings] = useState(initialSettings);
  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings: (next) => {
          setSettings(next);
          onChange(next);
        },
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

test("KeyboardSettings separates persistent Chinese scheme preference from Chinese/English switch", async () => {
  let latestSettings = new Settings();
  const r = render(
    <FakeIntlProvider>
      <TestSettingsProvider
        initialSettings={latestSettings}
        onChange={(next) => {
          latestSettings = next;
        }}
      >
        <KeyboardProvider>
          <KeyboardSettings />
        </KeyboardProvider>
      </TestSettingsProvider>
    </FakeIntlProvider>,
  );

  try {
    // Switch language to Chinese -> defaults to Xiaohe Shuangpin.
    fireEvent.click(await r.findByText("English"));
    fireEvent.click(await r.findByText("Chinese"));
    equal(KeyboardOptions.from(latestSettings).language, Language.ZH_SP);
    equal(KeyboardOptions.from(latestSettings).layout, Layout.ZH_SP);
    equal(latestSettings.get(keyboardProps.zhScheme), Layout.ZH_SP);

    // Select Microsoft Shuangpin -> updates scheme and virtual keyboard preview (; = ing).
    fireEvent.click(await r.findByText("Xiaohe Shuangpin"));
    fireEvent.click(await r.findByText("Microsoft Shuangpin"));
    equal(latestSettings.get(keyboardProps.zhScheme), Layout.ZH_SP_MS);
    equal(KeyboardOptions.from(latestSettings).layout, Layout.ZH_SP_MS);
    const semicolonKey = r.container.querySelector('[data-key="Semicolon"]');
    isNotNull(semicolonKey);
    equal(semicolonKey.textContent, ";ing");

    // Switch to English -> hint appears while Microsoft Shuangpin stays selected & persisted!
    fireEvent.click(await r.findByText("Chinese"));
    fireEvent.click(await r.findByText("English"));
    equal(KeyboardOptions.from(latestSettings).language, Language.EN);
    equal(KeyboardOptions.from(latestSettings).layout, Layout.EN_US);
    equal(latestSettings.get(keyboardProps.zhScheme), Layout.ZH_SP_MS);
    isNotNull(
      r.queryByText(
        "Currently practicing English; this scheme will be used when switching to Chinese.",
      ),
    );
  } finally {
    r.unmount();
  }

  // Simulate full reload from serialized JSON, then switch back to Chinese -> restores Microsoft Shuangpin!
  const reloaded = new Settings(latestSettings.toJSON());
  let afterReload = reloaded;
  const r2 = render(
    <FakeIntlProvider>
      <TestSettingsProvider
        initialSettings={reloaded}
        onChange={(next) => {
          afterReload = next;
        }}
      >
        <KeyboardProvider>
          <KeyboardSettings />
        </KeyboardProvider>
      </TestSettingsProvider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(r2.queryByText("Microsoft Shuangpin"));
    fireEvent.click(await r2.findByText("English"));
    fireEvent.click(await r2.findByText("Chinese"));
    equal(KeyboardOptions.from(afterReload).language, Language.ZH_SP);
    equal(KeyboardOptions.from(afterReload).layout, Layout.ZH_SP_MS);
    isNull(
      r2.queryByText(
        "Currently practicing English; this scheme will be used when switching to Chinese.",
      ),
    );
  } finally {
    r2.unmount();
  }
});
