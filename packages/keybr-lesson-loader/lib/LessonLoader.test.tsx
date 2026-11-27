import { test } from "node:test";
import {
  KeyboardContext,
  keyboardProps,
  KeyboardProvider,
  Language,
  Layout,
  loadKeyboard,
} from "@keybr/keyboard";
import {
  CustomTextLesson,
  type GuidedLesson,
  type Lesson,
  lessonProps,
  LessonType,
} from "@keybr/lesson";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakePhoneticModel, type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import {
  type Result,
  ResultContext,
  ResultFaker,
  TextType,
} from "@keybr/result";
import {
  FakeSettingsContext,
  Settings,
  SettingsContext,
} from "@keybr/settings";
import { act, render } from "@testing-library/react";
import { type ReactNode, useEffect, useState } from "react";
import { equal, includes, isNotNull, isNull } from "rich-assert";
import { LessonLoader } from "./LessonLoader.tsx";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("load", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;
  const keyboard = loadKeyboard(Layout.EN_US);

  const r = render(
    <FakeSettingsContext initialSettings={new Settings()}>
      <KeyboardContext.Provider value={keyboard}>
        <LessonLoader>
          {({ model }) => <TestChild model={model} />}
        </LessonLoader>
      </KeyboardContext.Provider>
    </FakeSettingsContext>,
  );

  includes((await r.findByTitle("letters")).textContent!, "ABCDEFGHIJ");

  r.unmount();
});

test("retains mounted child across EN <-> ZH_SP_MS switches and blocks mismatched settings_ZH + model_EN while model is loading", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const deferreds = new Map<
    string,
    ReturnType<typeof createDeferred<PhoneticModel>>
  >();

  PhoneticModelLoader.loader = (language: Language) => {
    let deferred = deferreds.get(language.id);
    if (deferred == null) {
      deferred = createDeferred<PhoneticModel>();
      deferreds.set(language.id, deferred);
    }
    return deferred.promise;
  };

  let mountCount = 0;
  const emittedLessons: Lesson[] = [];

  function Child({ lesson }: { readonly lesson: Lesson }) {
    useEffect(() => {
      mountCount += 1;
    }, []);
    emittedLessons.push(lesson);
    return (
      <span data-testid="lesson">
        {lesson.keyboard.layout.id}:{lesson.model.letters.length}
      </span>
    );
  }

  function Harness({ settings }: { readonly settings: Settings }) {
    const [current] = useState(settings);
    void current;
    return (
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <KeyboardProvider>
          <LessonLoader fallback={<span data-testid="fallback">loading</span>}>
            {(lesson) => <Child lesson={lesson} />}
          </LessonLoader>
        </KeyboardProvider>
      </SettingsContext.Provider>
    );
  }

  const enSettings = new Settings()
    .set(keyboardProps.language, Language.EN)
    .set(keyboardProps.layout, Layout.EN_US);
  const zhSettings = new Settings()
    .set(keyboardProps.language, Language.ZH_SP)
    .set(keyboardProps.layout, Layout.ZH_SP_MS);

  try {
    const r = render(<Harness settings={enSettings} />);

    isNotNull(r.queryByTestId("fallback"));
    equal(mountCount, 0);

    const modelEn = new FakePhoneticModel(["en"]);
    await act(async () => {
      deferreds.get("en")!.resolve(modelEn);
    });

    await r.findByTestId("lesson");
    isNull(r.queryByTestId("fallback"));
    equal(mountCount, 1);
    equal(emittedLessons.at(-1)!.keyboard.layout, Layout.EN_US);
    equal(emittedLessons.at(-1)!.settings, enSettings);

    // Switch to ZH_SP_MS (synchronous Shuangpin word list, pending phonetic model):
    // LessonLoader must keep EN lesson mounted, NOT render fallback, and NEVER emit ZH_SP_MS + modelEn.
    r.rerender(<Harness settings={zhSettings} />);
    await act(async () => {
      await Promise.resolve();
    });

    isNull(r.queryByTestId("fallback"));
    equal(mountCount, 1);
    for (const lesson of emittedLessons) {
      if (lesson.keyboard.layout === Layout.ZH_SP_MS) {
        throw new Error("Unexpected mismatched ZH_SP_MS + EN model emitted");
      }
    }
    equal(r.getByTestId("lesson").textContent, "en-us:10");

    // Resolve ZH phonetic model -> switches atomically to ZH_SP_MS + modelZh without unmount.
    const modelZh = new FakePhoneticModel(["zh"]);
    await act(async () => {
      deferreds.get("zh-sp")!.resolve(modelZh);
    });

    isNull(r.queryByTestId("fallback"));
    equal(mountCount, 1);
    equal(r.getByTestId("lesson").textContent, "zh-sp-ms:10");
    equal(emittedLessons.at(-1)!.keyboard.layout, Layout.ZH_SP_MS);
    equal(emittedLessons.at(-1)!.settings, zhSettings);

    // Switch back to EN: cached model, retains child with zero fallback flash.
    r.rerender(<Harness settings={enSettings} />);
    await act(async () => {
      await Promise.resolve();
    });

    isNull(r.queryByTestId("fallback"));
    equal(mountCount, 1);
    equal(r.getByTestId("lesson").textContent, "en-us:10");
    equal(emittedLessons.at(-1)!.keyboard.layout, Layout.EN_US);
    equal(emittedLessons.at(-1)!.settings, enSettings);

    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});

test("rapid toggle EN -> ZH_SP_MS (pending) -> EN restores EN without stale ZH overwrite", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const deferreds = new Map<
    string,
    ReturnType<typeof createDeferred<PhoneticModel>>
  >();

  PhoneticModelLoader.loader = (language: Language) => {
    let deferred = deferreds.get(language.id);
    if (deferred == null) {
      deferred = createDeferred<PhoneticModel>();
      deferreds.set(language.id, deferred);
    }
    return deferred.promise;
  };

  function Harness({ settings }: { readonly settings: Settings }): ReactNode {
    return (
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <KeyboardProvider>
          <LessonLoader>
            {(lesson) => (
              <span data-testid="layout">{lesson.keyboard.layout.id}</span>
            )}
          </LessonLoader>
        </KeyboardProvider>
      </SettingsContext.Provider>
    );
  }

  const enSettings = new Settings()
    .set(keyboardProps.language, Language.EN)
    .set(keyboardProps.layout, Layout.EN_US);
  const zhSettings = new Settings()
    .set(keyboardProps.language, Language.ZH_SP)
    .set(keyboardProps.layout, Layout.ZH_SP_MS);

  try {
    const r = render(<Harness settings={enSettings} />);

    const modelEn = new FakePhoneticModel(["en"]);
    await act(async () => {
      deferreds.get("en")!.resolve(modelEn);
    });
    equal((await r.findByTestId("layout")).textContent, "en-us");

    // Toggle EN -> ZH_SP_MS (slow) -> EN before ZH resolves.
    await act(async () => {
      r.rerender(<Harness settings={zhSettings} />);
    });
    await act(async () => {
      r.rerender(<Harness settings={enSettings} />);
    });

    const modelZh = new FakePhoneticModel(["zh"]);
    await act(async () => {
      deferreds.get("zh-sp")!.resolve(modelZh);
      await Promise.resolve();
    });

    equal(r.getByTestId("layout").textContent, "en-us");

    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});

function TestChild({ model }: { model: PhoneticModel }) {
  return <span title="letters">{model.letters.map(String).join("")}</span>;
}

test("resolves GuidedLesson unlockAllKeys from PageDataContext, ResultContext, and keytraceMode reactively", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const emitted: GuidedLesson[] = [];

  function Inspector({ lesson }: { readonly lesson: Lesson }) {
    const guided = lesson as GuidedLesson;
    emitted.push(guided);
    return (
      <span data-testid="unlock-all">
        {String(guided.unlockAllKeys)}:{emitted.length}
      </span>
    );
  }

  function Harness({
    settings,
    keytraceAvailable,
    results,
  }: {
    readonly settings: Settings;
    readonly keytraceAvailable?: boolean;
    readonly results?: readonly Result[];
  }) {
    const content = (
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <KeyboardProvider>
          <LessonLoader>
            {(lesson) => <Inspector lesson={lesson} />}
          </LessonLoader>
        </KeyboardProvider>
      </SettingsContext.Provider>
    );
    const withResults =
      results !== undefined ? (
        <ResultContext.Provider
          value={{
            results,
            appendResults: () => {},
            replaceResults: () => {},
            clearResults: () => {},
          }}
        >
          {content}
        </ResultContext.Provider>
      ) : (
        content
      );
    return keytraceAvailable !== undefined ? (
      <PageDataContext.Provider value={{ keytraceAvailable } as PageData}>
        {withResults}
      </PageDataContext.Provider>
    ) : (
      withResults
    );
  }

  const autoSettings = new Settings();
  const standaloneSettings = new Settings().set(
    lessonProps.keytraceMode,
    "standalone",
  );
  const keytraceSettings = new Settings().set(
    lessonProps.keytraceMode,
    "keytrace",
  );
  const faker = new ResultFaker();
  const nativeResult = faker.nextResult({ textType: TextType.GENERATED });
  const keytraceResult = faker.nextResult({ textType: TextType.KEYTRACE });

  try {
    // 1. Without PageDataContext / ResultContext -> defaults to standalone (unlockAllKeys = false).
    const r = render(<Harness settings={autoSettings} />);
    await r.findByTestId("unlock-all");
    equal(emitted.at(-1)!.unlockAllKeys, false);

    // 2. keytraceAvailable: false + native-only results -> still standalone.
    r.rerender(
      <Harness
        settings={autoSettings}
        keytraceAvailable={false}
        results={[nativeResult]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(emitted.at(-1)!.unlockAllKeys, false);

    // 3. Async KeyTrace sync adds a TextType.KEYTRACE result -> immediately recreates GuidedLesson with unlockAllKeys = true!
    const prevLesson = emitted.at(-1)!;
    r.rerender(
      <Harness
        settings={autoSettings}
        keytraceAvailable={false}
        results={[nativeResult, keytraceResult]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(emitted.at(-1)!.unlockAllKeys, true);
    equal(emitted.at(-1) !== prevLesson, true);

    // 4. Explicit standalone mode overrides both keytraceAvailable=true and KEYTRACE results.
    r.rerender(
      <Harness
        settings={standaloneSettings}
        keytraceAvailable={true}
        results={[keytraceResult]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(emitted.at(-1)!.unlockAllKeys, false);

    // 5. Explicit keytrace mode enables unlockAllKeys even when unavailable and no results.
    r.rerender(
      <Harness
        settings={keytraceSettings}
        keytraceAvailable={false}
        results={[]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(emitted.at(-1)!.unlockAllKeys, true);

    // 6. Auto mode with keytraceAvailable: true and empty results -> unlockAllKeys = true.
    r.rerender(
      <Harness settings={autoSettings} keytraceAvailable={true} results={[]} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(emitted.at(-1)!.unlockAllKeys, true);

    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});

test("loads CustomTextLesson with null zhEngine for EN and lazy ZhPinyinEngine for ZH", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  PhoneticModelLoader.loader = async (language) =>
    new (class extends FakePhoneticModel {
      override readonly language = language;
    })();

  const emitted: Lesson[] = [];

  function Inspector({ lesson }: { readonly lesson: Lesson }) {
    emitted.push(lesson);
    return (
      <span data-testid="custom-kind">
        {lesson instanceof CustomTextLesson
          ? lesson.keyboard.layout.id
          : "other"}
      </span>
    );
  }

  function Harness({ settings }: { readonly settings: Settings }) {
    return (
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <KeyboardProvider>
          <LessonLoader>
            {(lesson) => <Inspector lesson={lesson} />}
          </LessonLoader>
        </KeyboardProvider>
      </SettingsContext.Provider>
    );
  }

  const enSettings = new Settings()
    .set(keyboardProps.language, Language.EN)
    .set(keyboardProps.layout, Layout.EN_US)
    .set(lessonProps.type, LessonType.CUSTOM)
    .set(lessonProps.customText.content, "hello world");

  const zhSettings = new Settings()
    .set(keyboardProps.language, Language.ZH_QP)
    .set(keyboardProps.layout, Layout.ZH_QP)
    .set(lessonProps.type, LessonType.CUSTOM)
    .set(lessonProps.customText.zhContent, "银行行长");

  try {
    const r = render(<Harness settings={enSettings} />);
    await r.findByText("en-us");
    const enLesson = emitted.at(-1) as CustomTextLesson;
    equal(enLesson.zhEngine, null);
    equal(enLesson.zhAnalysis, null);

    r.rerender(<Harness settings={zhSettings} />);
    await r.findByText("zh-qp");
    const zhLesson = emitted.at(-1) as CustomTextLesson;
    isNotNull(zhLesson.zhEngine);
    isNotNull(zhLesson.zhAnalysis);
    equal(zhLesson.zhAnalysis!.totalHanzi, 4);
    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});
