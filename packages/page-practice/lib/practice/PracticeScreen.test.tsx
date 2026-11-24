import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  keyboardProps,
  Language,
  Layout,
} from "@keybr/keyboard";
import { lessonProps, LessonType } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { FakeResultContext, ResultFaker } from "@keybr/result";
import {
  FakeSettingsContext,
  Settings,
  SettingsContext,
} from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { equal, includes, isNotNull } from "rich-assert";
import { PracticeScreen } from "./PracticeScreen.tsx";

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

const faker = new ResultFaker();

test("render", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings()
          .set(lessonProps.type, LessonType.CUSTOM)
          .set(lessonProps.customText.content, "abcdefghij")}
      >
        <FakeResultContext initialResults={faker.nextResultList(100)}>
          <PracticeScreen />
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(
      await r.findByTitle("Change practice settings", { exact: false }),
    );
    includes(r.container.textContent!, "abcdefghij");
  } finally {
    r.unmount();
  }
});

test("Controls ZH/EN quick toggle activates saved zhScheme and restores English cleanly", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  let latestSettings = new Settings()
    .set(keyboardProps.zhScheme, Layout.ZH_SP_MS)
    .set(lessonProps.type, LessonType.CUSTOM)
    .set(lessonProps.customText.content, "abcdefghij");

  const r = render(
    <FakeIntlProvider>
      <TestSettingsProvider
        initialSettings={latestSettings}
        onChange={(next) => {
          latestSettings = next;
        }}
      >
        <FakeResultContext initialResults={faker.nextResultList(100)}>
          <PracticeScreen />
        </FakeResultContext>
      </TestSettingsProvider>
    </FakeIntlProvider>,
  );

  try {
    const zhButton = await r.findByText("ZH");
    const enButton = await r.findByText("EN");
    equal(zhButton.getAttribute("aria-pressed"), "false");
    equal(enButton.getAttribute("aria-pressed"), "true");

    fireEvent.click(zhButton);
    equal(KeyboardOptions.from(latestSettings).language, Language.ZH_SP);
    equal(KeyboardOptions.from(latestSettings).layout, Layout.ZH_SP_MS);
    equal(latestSettings.get(keyboardProps.zhScheme), Layout.ZH_SP_MS);
    const activeZhButton = await r.findByText("ZH");
    equal(activeZhButton.getAttribute("aria-pressed"), "true");

    const activeEnButton = await r.findByText("EN");
    fireEvent.click(activeEnButton);
    equal(KeyboardOptions.from(latestSettings).language, Language.EN);
    equal(KeyboardOptions.from(latestSettings).layout, Layout.EN_US);
    equal(latestSettings.get(keyboardProps.zhScheme), Layout.ZH_SP_MS);
    const restoredEnButton = await r.findByText("EN");
    equal(restoredEnButton.getAttribute("aria-pressed"), "true");
  } finally {
    r.unmount();
  }
});
