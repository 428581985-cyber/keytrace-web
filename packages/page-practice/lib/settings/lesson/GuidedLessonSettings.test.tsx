import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  Language,
  Layout,
  loadKeyboard,
} from "@keybr/keyboard";
import { GuidedLesson, lessonProps } from "@keybr/lesson";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { FakeResultContext, ResultFaker, TextType } from "@keybr/result";
import { Settings, SettingsContext } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { equal, isNotNull, isNull } from "rich-assert";
import { GuidedLessonSettings } from "./GuidedLessonSettings.tsx";

class LangFakePhoneticModel extends FakePhoneticModel {
  override readonly language: Language;

  constructor(language: Language) {
    super(["ab", "cd", "ef", "gh"]);
    this.language = language;
  }
}

function makeLesson(
  settings: Settings,
  layout: Layout,
  unlockAllKeys = false,
): GuidedLesson {
  const keyboard = loadKeyboard(layout);
  const model = new LangFakePhoneticModel(layout.language);
  return new GuidedLesson(settings, keyboard, model, ["ab", "cd", "ef"], {
    unlockAllKeys,
  });
}

test("standalone ZH shows progressive unlock controls without ResultProvider and hides NaturalWordsProp", () => {
  const settings = KeyboardOptions.default()
    .withLanguage(Language.ZH_SP)
    .withLayout(Layout.ZH_SP)
    .save(new Settings());
  const lesson = makeLesson(settings, Layout.ZH_SP, false);

  const r = render(
    <FakeIntlProvider>
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <GuidedLessonSettings lesson={lesson} />
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(r.queryByText("Target typing speed (Chinese):"));
    isNotNull(r.queryByText("Unlock a next key only when:"));
    isNotNull(r.queryByText("Sort letters in the order of keyboard keys"));
    isNotNull(r.queryByText("Unlock more letters:"));
    isNull(r.queryByText("Prefer natural words"));
    isNull(r.queryByText("Practice mode:"));
  } finally {
    r.unmount();
  }
});

test("KeyTrace mode hides progressive unlock controls and mode selector switches to standalone live", async () => {
  let latestSettings = new Settings();

  function StatefulView() {
    const [settings, setSettings] = useState(latestSettings);
    const lesson = makeLesson(
      settings,
      Layout.EN_US,
      settings.get(lessonProps.keytraceMode) !== "standalone",
    );
    return (
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: true } as PageData}
        >
          <SettingsContext.Provider
            value={{
              settings,
              updateSettings: (next) => {
                latestSettings = next;
                setSettings(next);
              },
            }}
          >
            <GuidedLessonSettings lesson={lesson} />
          </SettingsContext.Provider>
        </PageDataContext.Provider>
      </FakeIntlProvider>
    );
  }

  const r = render(<StatefulView />);
  try {
    // Initially auto + keytraceAvailable=true -> KeyTrace all-unlocked mode.
    isNotNull(r.queryByText("Practice mode:"));
    isNotNull(r.queryByText("Prefer natural words"));
    isNull(r.queryByText("Unlock a next key only when:"));
    isNull(r.queryByText("Sort letters in the order of keyboard keys"));
    isNull(r.queryByText("Unlock more letters:"));

    // Switch mode selector (OptionList) to standalone -> progressive controls appear.
    fireEvent.click(r.getByText("Auto detect"));
    fireEvent.click(
      await r.findByText("Standalone web course (progressive unlock)"),
    );
    equal(latestSettings.get(lessonProps.keytraceMode), "standalone");

    isNotNull(r.queryByText("Practice mode:"));
    isNotNull(r.queryByText("Unlock a next key only when:"));
    isNotNull(r.queryByText("Sort letters in the order of keyboard keys"));
    isNotNull(r.queryByText("Unlock more letters:"));
  } finally {
    r.unmount();
  }
});

test("offline KeyTrace results trigger KeyTrace mode and expose mode selector even when keytraceAvailable is false", () => {
  const settings = new Settings();
  const lesson = makeLesson(settings, Layout.EN_US, true);
  const faker = new ResultFaker();
  const ktResult = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.KEYTRACE,
  });

  const r = render(
    <FakeIntlProvider>
      <PageDataContext.Provider
        value={{ keytraceAvailable: false } as PageData}
      >
        <SettingsContext.Provider
          value={{ settings, updateSettings: () => {} }}
        >
          <FakeResultContext initialResults={[ktResult]}>
            <GuidedLessonSettings lesson={lesson} />
          </FakeResultContext>
        </SettingsContext.Provider>
      </PageDataContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(r.queryByText("Practice mode:"));
    isNull(r.queryByText("Unlock a next key only when:"));
    isNull(r.queryByText("Unlock more letters:"));
  } finally {
    r.unmount();
  }
});
