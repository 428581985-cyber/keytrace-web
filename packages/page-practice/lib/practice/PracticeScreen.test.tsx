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
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakePhoneticModel, type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import {
  FakeResultContext,
  type Result,
  ResultContext,
  ResultFaker,
  speedToTime,
  TextType,
} from "@keybr/result";
import {
  FakeSettingsContext,
  Settings,
  SettingsContext,
} from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
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

test("live-sync append and replaceResults update PracticeScreen immediately without reload", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const prevFetch = globalThis.fetch;
  PhoneticModelLoader.loader = FakePhoneticModel.loader;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: { available: true, active: false, lastEventTs: null },
        today: { totalKeys: 0 },
      }),
    }) as unknown as Response;

  let pushResults!: (next: readonly Result[]) => void;
  let swapResults!: (next: readonly Result[]) => void;

  function LiveResultProvider({ children }: { readonly children: ReactNode }) {
    const [results, setResults] = useState<readonly Result[]>([]);
    pushResults = (added) => {
      setResults((prev) => [...prev, ...added]);
    };
    swapResults = (next) => {
      setResults([...next]);
    };
    return (
      <ResultContext.Provider
        value={{
          results,
          appendResults: pushResults,
          replaceResults: swapResults,
          clearResults: () => {
            setResults([]);
          },
        }}
      >
        {children}
      </ResultContext.Provider>
    );
  }

  const settings = new Settings()
    .set(lessonProps.type, LessonType.CUSTOM)
    .set(lessonProps.customText.content, "abcdefghij");

  const r = render(
    <FakeIntlProvider>
      <PageDataContext.Provider value={{ keytraceAvailable: true } as PageData}>
        <FakeSettingsContext initialSettings={settings}>
          <LiveResultProvider>
            <PracticeScreen />
          </LiveResultProvider>
        </FakeSettingsContext>
      </PageDataContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    await r.findByTitle("Change practice settings", { exact: false });
    const indicators = () =>
      r.container.querySelector(`#${names.indicators}`)!.textContent ?? "";
    equal(indicators().includes("60.0wpm"), false);

    // Simulate async KeyTrace sync appending a low-speed result:
    // SummaryStats (top speed gauge) must ignore KEYTRACE records.
    const syncedKeytrace = faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.KEYTRACE,
      length: 100,
      time: 70_588, // ~17.0 WPM
      errors: 0,
      histogram: new Histogram([
        {
          codePoint: 0x0061,
          hitCount: 20,
          missCount: 0,
          timeToType: speedToTime(300),
        },
      ]),
    });
    await act(async () => {
      pushResults([syncedKeytrace]);
    });
    equal(indicators().includes("17.0wpm"), false);

    // Push a native 60 WPM (300 CPM) web practice result -> appears in SpeedGauge.
    const native60 = faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.GENERATED,
      length: 100,
      time: 20_000,
      errors: 0,
      histogram: new Histogram([
        {
          codePoint: 0x0061,
          hitCount: 20,
          missCount: 0,
          timeToType: speedToTime(300),
        },
      ]),
    });
    await act(async () => {
      pushResults([native60]);
    });
    await r.findByText("60.0wpm");

    // Replacing results with native 40 WPM + KEYTRACE 17 WPM shows 40.0wpm (not 60.0 or 17.0).
    const native40 = faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.GENERATED,
      length: 100,
      time: 30_000,
      errors: 0,
      histogram: new Histogram([
        {
          codePoint: 0x0061,
          hitCount: 20,
          missCount: 0,
          timeToType: speedToTime(200),
        },
      ]),
    });
    await act(async () => {
      swapResults([native40, syncedKeytrace]);
    });
    await r.findByText("40.0wpm");
    equal(indicators().includes("60.0wpm"), false);
    equal(indicators().includes("17.0wpm"), false);
  } finally {
    PhoneticModelLoader.loader = prevLoader;
    globalThis.fetch = prevFetch;
    r.unmount();
  }
});

test("standalone mode isolates TextType.KEYTRACE results and restores unlock state when switching back without altering SpeedGauge", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const prevFetch = globalThis.fetch;
  PhoneticModelLoader.loader = async () =>
    new FakePhoneticModel(["abc", "def", "afe"]);
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: { available: true, active: false, lastEventTs: null },
        today: { totalKeys: 0 },
      }),
    }) as unknown as Response;

  const native40 = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.GENERATED,
    length: 100,
    time: 30_000, // 200 CPM = 40.0 WPM
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: 0x0061,
        hitCount: 20,
        missCount: 0,
        timeToType: speedToTime(200),
      },
    ]),
  });
  const keytrace80 = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.KEYTRACE,
    length: 100,
    time: 15_000, // 400 CPM = 80.0 WPM
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: 0x0067, // 'g'
        hitCount: 20,
        missCount: 0,
        timeToType: speedToTime(400),
      },
    ]),
  });

  let setMode!: (mode: "standalone" | "keytrace") => void;

  function ModeHarness() {
    const [settings, setSettings] = useState(() =>
      new Settings().set(lessonProps.keytraceMode, "standalone"),
    );
    setMode = (mode) => {
      setSettings((prev) => prev.set(lessonProps.keytraceMode, mode));
    };
    return (
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: true } as PageData}
        >
          <SettingsContext.Provider
            value={{ settings, updateSettings: setSettings }}
          >
            <FakeResultContext initialResults={[native40, keytrace80]}>
              <PracticeScreen />
            </FakeResultContext>
          </SettingsContext.Provider>
        </PageDataContext.Provider>
      </FakeIntlProvider>
    );
  }

  const r = render(<ModeHarness />);
  try {
    // In standalone mode, progressive unlocking keeps g..j locked (4 <svg> cross marks)
    // and SpeedGauge shows native 40.0wpm (not KEYTRACE 80.0wpm).
    await r.findByText("40.0wpm");
    const lockedCount = () =>
      r.container.querySelectorAll(`#${names.keySet} svg`).length;
    const indicators = () =>
      r.container.querySelector(`#${names.indicators}`)!.textContent ?? "";
    equal(lockedCount(), 4);
    equal(indicators().includes("80.0wpm"), false);

    // Switching back to keytrace mode unlocks all keys (0 locked) asynchronously
    // after LessonLoader reloads, while SpeedGauge still displays native 40.0wpm.
    await act(async () => {
      setMode("keytrace");
    });
    await waitFor(() => {
      equal(lockedCount(), 0);
    });
    await r.findByText("40.0wpm");
    equal(indicators().includes("80.0wpm"), false);
  } finally {
    PhoneticModelLoader.loader = prevLoader;
    globalThis.fetch = prevFetch;
    r.unmount();
  }
});
