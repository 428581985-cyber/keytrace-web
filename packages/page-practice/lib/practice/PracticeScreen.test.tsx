import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  keyboardProps,
  type Language as KeyboardLanguage,
  Language,
  Layout,
} from "@keybr/keyboard";
import { lessonProps, LessonType } from "@keybr/lesson";
import { names } from "@keybr/lesson-ui";
import { FakePhoneticModel, type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { FakeResultContext, ResultFaker } from "@keybr/result";
import {
  FakeSettingsContext,
  Settings,
  SettingsContext,
} from "@keybr/settings";
import { act, fireEvent, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { equal, includes, isNotNull, isNull } from "rich-assert";
import { PracticeScreen } from "./PracticeScreen.tsx";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

test("EN <-> ZH toggle retains #id_indicators, #id_text_input, and #id_keyboard DOM nodes with zero LoadingProgress flash", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const deferreds = new Map<
    string,
    ReturnType<typeof createDeferred<PhoneticModel>>
  >();

  PhoneticModelLoader.loader = (language: KeyboardLanguage) => {
    let deferred = deferreds.get(language.id);
    if (deferred == null) {
      deferred = createDeferred<PhoneticModel>();
      deferreds.set(language.id, deferred);
    }
    return deferred.promise;
  };

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
        <FakeResultContext initialResults={faker.nextResultList(20)}>
          <PracticeScreen />
        </FakeResultContext>
      </TestSettingsProvider>
    </FakeIntlProvider>,
  );

  try {
    await act(async () => {
      deferreds.get("en")!.resolve(new FakePhoneticModel(["en"]));
    });

    await r.findByText("EN");
    const indicatorsEl = r.container.querySelector(`#${names.indicators}`)!;
    const textInputEl = r.container.querySelector(`#${names.textInput}`)!;
    const keyboardEl = r.container.querySelector(`#${names.keyboard}`)!;
    isNotNull(indicatorsEl);
    isNotNull(textInputEl);
    isNotNull(keyboardEl);
    isNull(r.container.querySelector("[role='progressbar']"));

    // Click ZH while ZH phonetic model is still pending -> zero unmount & zero LoadingProgress flash.
    fireEvent.click(r.getByText("ZH"));
    await act(async () => {
      await Promise.resolve();
    });

    isNull(r.container.querySelector("[role='progressbar']"));
    equal(r.container.querySelector(`#${names.indicators}`), indicatorsEl);
    equal(r.container.querySelector(`#${names.textInput}`), textInputEl);
    equal(r.container.querySelector(`#${names.keyboard}`), keyboardEl);

    // Resolve ZH phonetic model and let useProgress schedule complete.
    await act(async () => {
      deferreds.get("zh-sp")!.resolve(new FakePhoneticModel(["zh"]));
    });
    await r.findByText((_, el) => {
      return (
        el?.tagName === "BUTTON" &&
        el.textContent === "ZH" &&
        el.getAttribute("aria-pressed") === "true"
      );
    });

    isNull(r.container.querySelector("[role='progressbar']"));
    equal(r.container.querySelector(`#${names.indicators}`), indicatorsEl);
    equal(r.container.querySelector(`#${names.textInput}`), textInputEl);
    equal(r.container.querySelector(`#${names.keyboard}`), keyboardEl);

    // Switch back to EN -> zero unmount & zero LoadingProgress flash.
    fireEvent.click(r.getByText("EN"));
    await r.findByText((_, el) => {
      return (
        el?.tagName === "BUTTON" &&
        el.textContent === "EN" &&
        el.getAttribute("aria-pressed") === "true"
      );
    });

    isNull(r.container.querySelector("[role='progressbar']"));
    equal(r.container.querySelector(`#${names.indicators}`), indicatorsEl);
    equal(r.container.querySelector(`#${names.textInput}`), textInputEl);
    equal(r.container.querySelector(`#${names.keyboard}`), keyboardEl);

    // Rapid toggle EN -> ZH (already cached model, async seed) -> EN.
    fireEvent.click(r.getByText("ZH"));
    fireEvent.click(r.getByText("EN"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    equal(r.getByText("EN").getAttribute("aria-pressed"), "true");
    equal(r.container.querySelector(`#${names.indicators}`), indicatorsEl);
    equal(r.container.querySelector(`#${names.textInput}`), textInputEl);
    equal(r.container.querySelector(`#${names.keyboard}`), keyboardEl);
  } finally {
    PhoneticModelLoader.loader = prevLoader;
    r.unmount();
  }
});
