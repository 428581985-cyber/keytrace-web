import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { CustomTextLesson } from "@keybr/lesson";
import { names } from "@keybr/lesson-ui";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { act, render } from "@testing-library/react";
import { equal, isNotNull } from "rich-assert";
import { Indicators, resetKeyTraceInfoCache } from "./Indicators.tsx";
import { LessonState, Progress } from "./state/index.ts";

function makeLessonState(): LessonState {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(settings, keyboard, model);
  const progress = new Progress(settings, lesson);
  return new LessonState(progress, () => {});
}

test("KeyTracePracticePill reserves space on initial render and caches fetched info across remounts", async () => {
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
        <FakeSettingsContext initialSettings={state.settings}>
          <Indicators state={state} />
        </FakeSettingsContext>
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
            status: { active: true, lastEventTs: 1700000000000 },
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
        <FakeSettingsContext initialSettings={state.settings}>
          <Indicators state={state} />
        </FakeSettingsContext>
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
