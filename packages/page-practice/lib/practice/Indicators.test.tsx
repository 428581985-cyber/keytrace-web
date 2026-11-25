import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import {
  CustomTextLesson,
  GuidedLesson,
  LessonKey,
  LessonKeys,
  lessonProps,
} from "@keybr/lesson";
import { names } from "@keybr/lesson-ui";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { act, render } from "@testing-library/react";
import { equal, isNotNull, isNull } from "rich-assert";
import { Indicators, resetKeyTraceInfoCache } from "./Indicators.tsx";
import { LessonState, Progress } from "./state/index.ts";

function makeLessonState(settings = new Settings()): LessonState {
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(settings, keyboard, model);
  const progress = new Progress(settings, lesson);
  return new LessonState(progress, () => {});
}

test("KeyTracePracticePill reserves space on initial render and caches fetched info across remounts when KeyTrace is available", async () => {
  const prevFetch = globalThis.fetch;
  let resolveFetch!: (value: Response) => void;

  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

  resetKeyTraceInfoCache();

  try {
    const state = makeLessonState();
    const r = render(
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: true } as PageData}
        >
          <FakeSettingsContext initialSettings={state.settings}>
            <Indicators state={state} />
          </FakeSettingsContext>
        </PageDataContext.Provider>
      </FakeIntlProvider>,
    );

    try {
      // Space-reserving placeholder exists immediately before fetch resolves.
      const placeholder = r.container.querySelector(
        `#${names.indicators} [aria-hidden='true']`,
      );
      isNotNull(placeholder);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({
            status: {
              available: true,
              active: true,
              lastEventTs: 1700000000000,
            },
            today: { totalKeys: 456 },
          }),
        } as unknown as Response);
      });

      isNotNull(await r.findByText(/456/));
    } finally {
      r.unmount();
    }

    // Subsequent mount with slow/pending fetch renders cached KeyTrace summary synchronously.
    globalThis.fetch = () => new Promise<Response>(() => {});
    const r2 = render(
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: true } as PageData}
        >
          <FakeSettingsContext initialSettings={state.settings}>
            <Indicators state={state} />
          </FakeSettingsContext>
        </PageDataContext.Provider>
      </FakeIntlProvider>,
    );
    try {
      isNotNull(r2.queryByText(/456/));
      equal(
        r2.container.querySelector(`#${names.indicators} [aria-hidden='true']`),
        null,
      );
    } finally {
      r2.unmount();
    }
  } finally {
    globalThis.fetch = prevFetch;
    resetKeyTraceInfoCache();
  }
});

test("KeyTracePracticePill is hidden with zero fetches when keytraceAvailable is false or mode is standalone", () => {
  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("unexpected fetch");
  };

  resetKeyTraceInfoCache();

  try {
    const unavailableState = makeLessonState();
    const r1 = render(
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: false } as PageData}
        >
          <FakeSettingsContext initialSettings={unavailableState.settings}>
            <Indicators state={unavailableState} />
          </FakeSettingsContext>
        </PageDataContext.Provider>
      </FakeIntlProvider>,
    );
    try {
      isNull(
        r1.container.querySelector(`#${names.indicators} [aria-hidden='true']`),
      );
      isNull(r1.queryByText(/Monitor|查看监控面板/));
      equal(fetchCalls, 0);
    } finally {
      r1.unmount();
    }

    const standaloneSettings = new Settings().set(
      lessonProps.keytraceMode,
      "standalone",
    );
    const standaloneState = makeLessonState(standaloneSettings);
    const r2 = render(
      <FakeIntlProvider>
        <PageDataContext.Provider
          value={{ keytraceAvailable: true } as PageData}
        >
          <FakeSettingsContext initialSettings={standaloneSettings}>
            <Indicators state={standaloneState} />
          </FakeSettingsContext>
        </PageDataContext.Provider>
      </FakeIntlProvider>,
    );
    try {
      isNull(
        r2.container.querySelector(`#${names.indicators} [aria-hidden='true']`),
      );
      isNull(r2.queryByText(/Monitor|查看监控面板/));
      equal(fetchCalls, 0);
    } finally {
      r2.unmount();
    }
  } finally {
    globalThis.fetch = prevFetch;
    resetKeyTraceInfoCache();
  }
});

test("CurrentKeyRow passes allUnlockedMode from GuidedLesson unlockAllKeys", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const wordList = ["abc", "def", "ghi", "jkl", "bcd", "efg"];

  const ktLesson = new GuidedLesson(settings, keyboard, model, wordList, {
    unlockAllKeys: true,
  });
  const ktProgress = new Progress(settings, ktLesson);
  const ktState = new LessonState(ktProgress, () => {});
  // Simulate all keys above target (no focused key).
  Object.defineProperty(ktState, "lessonKeys", {
    value: new LessonKeys(
      [...ktState.lessonKeys].map(
        (key) => new LessonKey({ ...key, isIncluded: true, isFocused: false }),
      ),
    ),
  });

  const r1 = render(
    <FakeIntlProvider>
      <FakeSettingsContext initialSettings={settings}>
        <Indicators state={ktState} />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  try {
    isNotNull(r1.queryByText("All keys are above target speed."));
  } finally {
    r1.unmount();
  }

  const standaloneLesson = new GuidedLesson(
    settings,
    keyboard,
    model,
    wordList,
    {
      unlockAllKeys: false,
    },
  );
  const standaloneProgress = new Progress(settings, standaloneLesson);
  const standaloneState = new LessonState(standaloneProgress, () => {});
  Object.defineProperty(standaloneState, "lessonKeys", {
    value: new LessonKeys(
      [...standaloneState.lessonKeys].map(
        (key) => new LessonKey({ ...key, isIncluded: true, isFocused: false }),
      ),
    ),
  });

  const r2 = render(
    <FakeIntlProvider>
      <FakeSettingsContext initialSettings={settings}>
        <Indicators state={standaloneState} />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  try {
    isNotNull(r2.queryByText("All keys are unlocked."));
  } finally {
    r2.unmount();
  }
});
