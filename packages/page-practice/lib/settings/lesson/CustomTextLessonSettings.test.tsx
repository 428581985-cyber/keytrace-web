import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Language, Layout, loadKeyboard } from "@keybr/keyboard";
import {
  CustomTextLesson,
  lessonProps,
  loadZhPinyinEngine,
} from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { Settings, SettingsContext } from "@keybr/settings";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { equal, isNotNull, isNull } from "rich-assert";
import { CustomTextLessonSettings } from "./CustomTextLessonSettings.tsx";

class LangFakePhoneticModel extends FakePhoneticModel {
  override readonly language: Language;

  constructor(language: Language) {
    super(["ab", "cd"]);
    this.language = language;
  }
}

test("CustomTextLessonSettings separates EN vs ZH controls, cycles polyphone pills, toggles tolerance, and imports .txt", async () => {
  const engine = await loadZhPinyinEngine();

  // 1. EN mode shows English stats and Transform to lowercase, hides polyphone controls.
  const enSettings = new Settings()
    .set(lessonProps.customText.content, "hello world")
    .set(lessonProps.customText.zhContent, "银行行长");
  const enLesson = new CustomTextLesson(
    enSettings,
    loadKeyboard(Layout.EN_US),
    new LangFakePhoneticModel(Language.EN),
    null,
  );
  const rEn = render(
    <FakeIntlProvider>
      <SettingsContext.Provider
        value={{ settings: enSettings, updateSettings: () => {} }}
      >
        <CustomTextLessonSettings lesson={enLesson} />
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );
  try {
    isNotNull(rEn.queryByText("All words:"));
    isNotNull(rEn.queryByText("Transform to lowercase"));
    isNull(rEn.queryByText("Allow any valid polyphone reading"));
    equal(rEn.container.querySelectorAll("[data-polyphone-pill]").length, 0);
  } finally {
    rEn.unmount();
  }

  // 2. ZH mode renders polyphone review pills, cycles inline pinning, toggles tolerance, and imports .txt.
  let latestSettings = new Settings()
    .set(lessonProps.customText.content, "hello world")
    .set(lessonProps.customText.zhContent, "银行行长");

  function StatefulZh() {
    const [settings, setSettings] = useState(latestSettings);
    const lesson = new CustomTextLesson(
      settings,
      loadKeyboard(Layout.ZH_SP),
      new LangFakePhoneticModel(Language.ZH_SP),
      engine,
    );
    return (
      <FakeIntlProvider>
        <SettingsContext.Provider
          value={{
            settings,
            updateSettings: (next) => {
              latestSettings = next;
              setSettings(next);
            },
          }}
        >
          <CustomTextLessonSettings lesson={lesson} />
        </SettingsContext.Provider>
      </FakeIntlProvider>
    );
  }

  const rZh = render(<StatefulZh />);
  try {
    isNotNull(rZh.queryByText("Hanzi count:"));
    isNull(rZh.queryByText("Transform to lowercase"));
    isNotNull(rZh.queryByText("Allow any valid polyphone reading"));

    const pills = [
      ...rZh.container.querySelectorAll<HTMLElement>("[data-polyphone-pill]"),
    ];
    equal(pills.length > 0, true);
    const firstHang = pills.find((p) => p.dataset.hanzi === "行")!;
    equal(firstHang.dataset.reading, "hang");

    // Clicking pill cycles hang -> heng and rewrites zhContent with inline annotation; EN stays intact!
    fireEvent.click(firstHang);
    equal(
      latestSettings.get(lessonProps.customText.zhContent),
      "银行(heng)行长",
    );
    equal(latestSettings.get(lessonProps.customText.content), "hello world");

    const updatedPill = [
      ...rZh.container.querySelectorAll<HTMLElement>("[data-polyphone-pill]"),
    ].find((p) => p.dataset.hanzi === "行")!;
    equal(updatedPill.dataset.reading, "heng");
    equal(updatedPill.dataset.pinned, "1");

    // Toggling polyphone tolerance checkbox updates settings.
    fireEvent.click(rZh.getByText("Allow any valid polyphone reading"));
    equal(
      latestSettings.get(lessonProps.customText.zhPolyphoneTolerance),
      true,
    );

    // Importing a .txt file updates zhContent without overwriting EN content.
    const fileInput =
      rZh.container.querySelector<HTMLInputElement>("input[type='file']")!;
    const file = new File(["重庆人工智能"], "custom.txt", {
      type: "text/plain",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() =>
      equal(
        latestSettings.get(lessonProps.customText.zhContent),
        "重庆人工智能",
      ),
    );
    equal(latestSettings.get(lessonProps.customText.content), "hello world");
  } finally {
    rZh.unmount();
  }
});
