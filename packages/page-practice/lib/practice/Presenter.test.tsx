import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { KeyboardContext, Layout, loadKeyboard } from "@keybr/keyboard";
import { CustomTextLesson, lessonProps, LessonType } from "@keybr/lesson";
import { names } from "@keybr/lesson-ui";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { PortalContainer } from "@keybr/widget";
import { act, fireEvent, render } from "@testing-library/react";
import { equal, includes, isNotNull, isNull } from "rich-assert";
import { Presenter } from "./Presenter.tsx";
import { LessonState, Progress } from "./state/index.ts";

const ZOOMER_STORAGE_KEY = "keybr.zoomer.positions";

function makeState(isNew = false): LessonState {
  const settings = new Settings({}, isNew)
    .set(lessonProps.type, LessonType.CUSTOM)
    .set(lessonProps.customText.content, "abcdefghij");
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(settings, keyboard, model);
  const progress = new Progress(settings, lesson);
  return new LessonState(progress, () => {});
}

function makeFreshState(isNew: boolean): LessonState {
  const base = new Settings({}, isNew);
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(base, keyboard, model);
  const progress = new Progress(base, lesson);
  return new LessonState(progress, () => {});
}

function ensurePortalContainer(): () => void {
  let portal = document.getElementById(PortalContainer.id);
  let created = false;
  if (portal == null) {
    portal = document.createElement("div");
    portal.id = PortalContainer.id;
    document.body.appendChild(portal);
    created = true;
  }
  return () => {
    if (created) {
      portal.remove();
    }
  };
}

function withMockedWindowScroll(
  initialX: number,
  initialY: number,
  fn: (calls: Array<{ readonly x: number; readonly y: number }>) => void,
): void {
  const origScrollTo = window.scrollTo;
  const origXDesc = Object.getOwnPropertyDescriptor(window, "scrollX");
  const origYDesc = Object.getOwnPropertyDescriptor(window, "scrollY");
  let currentX = initialX;
  let currentY = initialY;
  const calls: Array<{ readonly x: number; readonly y: number }> = [];

  Object.defineProperty(window, "scrollX", {
    configurable: true,
    get: () => currentX,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => currentY,
  });
  window.scrollTo = ((xOrOpts: number | ScrollToOptions, y?: number) => {
    if (typeof xOrOpts === "number") {
      currentX = xOrOpts;
      currentY = y ?? 0;
    } else {
      currentX = xOrOpts.left ?? 0;
      currentY = xOrOpts.top ?? 0;
    }
    calls.push({ x: currentX, y: currentY });
  }) as typeof window.scrollTo;

  try {
    fn(calls);
  } finally {
    window.scrollTo = origScrollTo;
    if (origXDesc != null) {
      Object.defineProperty(window, "scrollX", origXDesc);
    } else {
      delete (window as unknown as Record<string, unknown>).scrollX;
    }
    if (origYDesc != null) {
      Object.defineProperty(window, "scrollY", origYDesc);
    } else {
      delete (window as unknown as Record<string, unknown>).scrollY;
    }
  }
}

test("help tutorial saves Compact view, scroll, and Zoomer positions, resets to Normal/0,0,1/top, and restores on close", () => {
  window.localStorage.clear();
  const cleanupPortal = ensurePortalContainer();
  const state = makeState(false);
  const keyboard = state.lesson.keyboard;

  try {
    withMockedWindowScroll(12, 340, (scrollCalls) => {
      const r = render(
        <FakeIntlProvider>
          <FakeSettingsContext initialSettings={state.settings}>
            <KeyboardContext.Provider value={keyboard}>
              <Presenter
                state={state}
                lines={state.lines}
                depressedKeys={[]}
                onResetLesson={() => {}}
                onSkipLesson={() => {}}
                onKeyDown={() => {}}
                onKeyUp={() => {}}
                onInput={() => {}}
              />
            </KeyboardContext.Provider>
          </FakeSettingsContext>
        </FakeIntlProvider>,
      );

      try {
        // Switch from Normal -> Compact.
        fireEvent.click(r.getByTitle("Switch the current interface layout."));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        isNull(r.container.querySelector(`#${names.keyboard}`));
        const savedPrefBefore = window.localStorage.getItem(
          "prefs.practice.view",
        );

        // Drag Indicators/Compact Zoomer to a custom position.
        const indicators = r.container.querySelector(`#${names.indicators}`)!;
        const compactZoomerRoot = indicators.parentElement!;
        fireEvent.mouseDown(indicators);
        fireEvent.mouseMove(document, { movementX: 30, movementY: 20 });
        fireEvent.mouseUp(document);
        equal(compactZoomerRoot.style.left, "30px");
        equal(compactZoomerRoot.style.top, "20px");

        const zoomerStorageBefore =
          window.localStorage.getItem(ZOOMER_STORAGE_KEY);
        isNotNull(zoomerStorageBefore);

        scrollCalls.length = 0;

        // Open Help tutorial.
        fireEvent.click(r.getByTitle("Show a guided tour with help slides."));

        // Switched to NormalLayout with tutorial portal rendered and scrolled to (0, 0).
        isNotNull(r.container.querySelector(`#${names.keyboard}`));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        const portalEl = document.getElementById(PortalContainer.id)!;
        includes(portalEl.textContent!, "Learn to Type Faster");
        equal(window.scrollX, 0);
        equal(window.scrollY, 0);
        equal(scrollCalls[0].x, 0);
        equal(scrollCalls[0].y, 0);

        // All Zoomers inside NormalLayout are suspended at (0, 0, 1).
        const normalIndicatorsZoomer = r.container.querySelector(
          `#${names.indicators}`,
        )!.parentElement!;
        const normalKeyboardZoomer = r.container.querySelector(
          `#${names.keyboard}`,
        )!.firstElementChild! as HTMLElement;
        equal(normalIndicatorsZoomer.style.left, "0px");
        equal(normalIndicatorsZoomer.style.top, "0px");
        equal(normalIndicatorsZoomer.style.transform, "scale(1)");
        equal(normalKeyboardZoomer.style.left, "0px");
        equal(normalKeyboardZoomer.style.top, "0px");
        equal(normalKeyboardZoomer.style.transform, "scale(1)");

        // LocalStorage Zoomer positions and view preference must remain untouched.
        equal(
          window.localStorage.getItem(ZOOMER_STORAGE_KEY),
          zoomerStorageBefore,
        );
        equal(
          window.localStorage.getItem("prefs.practice.view"),
          savedPrefBefore,
        );

        // Switching view while tour is open is ignored.
        fireEvent.click(r.getByTitle("Switch the current interface layout."));
        isNotNull(r.container.querySelector(`#${names.keyboard}`));

        // Close tutorial via Escape -> restores Compact view, Zoomer position, and scroll.
        fireEvent.keyDown(document, { key: "Escape" });

        isNull(r.container.querySelector(`#${names.keyboard}`));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        equal(
          document.getElementById(PortalContainer.id)!.textContent!.trim(),
          "",
        );

        const restoredZoomerRoot = r.container.querySelector(
          `#${names.indicators}`,
        )!.parentElement!;
        equal(restoredZoomerRoot.style.left, "30px");
        equal(restoredZoomerRoot.style.top, "20px");
        equal(window.scrollX, 12);
        equal(window.scrollY, 340);
      } finally {
        r.unmount();
      }
    });
  } finally {
    cleanupPortal();
    window.localStorage.clear();
  }
});

test("isNew auto-open from Bare view switches to Normal and restores Bare on close", () => {
  window.localStorage.clear();
  window.localStorage.setItem("prefs.practice.view", JSON.stringify("bare"));
  const cleanupPortal = ensurePortalContainer();
  const state = makeFreshState(true);

  try {
    withMockedWindowScroll(0, 180, () => {
      const r = render(
        <FakeIntlProvider>
          <FakeSettingsContext initialSettings={state.settings}>
            <KeyboardContext.Provider value={state.lesson.keyboard}>
              <Presenter
                state={state}
                lines={state.lines}
                depressedKeys={[]}
                onResetLesson={() => {}}
                onSkipLesson={() => {}}
                onKeyDown={() => {}}
                onKeyUp={() => {}}
                onInput={() => {}}
              />
            </KeyboardContext.Provider>
          </FakeSettingsContext>
        </FakeIntlProvider>,
      );

      try {
        // Auto-opened into NormalLayout with tour active and scroll reset to (0, 0).
        isNotNull(r.container.querySelector(`#${names.keyboard}`));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        includes(
          document.getElementById(PortalContainer.id)!.textContent!,
          "Learn to Type Faster",
        );
        equal(window.scrollY, 0);

        // Close tour -> restores BareLayout (#id_indicators and #id_keyboard absent) and scroll.
        fireEvent.keyDown(document, { key: "Escape" });
        isNull(r.container.querySelector(`#${names.indicators}`));
        isNull(r.container.querySelector(`#${names.keyboard}`));
        equal(window.scrollY, 180);
      } finally {
        r.unmount();
      }
    });
  } finally {
    cleanupPortal();
    window.localStorage.clear();
  }
});

test("batched double-close of help tutorial preserves saved Compact view and scroll", () => {
  window.localStorage.clear();
  const cleanupPortal = ensurePortalContainer();
  const state = makeState(false);
  const keyboard = state.lesson.keyboard;

  try {
    withMockedWindowScroll(18, 420, () => {
      const r = render(
        <FakeIntlProvider>
          <FakeSettingsContext initialSettings={state.settings}>
            <KeyboardContext.Provider value={keyboard}>
              <Presenter
                state={state}
                lines={state.lines}
                depressedKeys={[]}
                onResetLesson={() => {}}
                onSkipLesson={() => {}}
                onKeyDown={() => {}}
                onKeyUp={() => {}}
                onInput={() => {}}
              />
            </KeyboardContext.Provider>
          </FakeSettingsContext>
        </FakeIntlProvider>,
      );

      try {
        // Switch from Normal -> Compact.
        fireEvent.click(r.getByTitle("Switch the current interface layout."));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        isNull(r.container.querySelector(`#${names.keyboard}`));

        // Open Help tutorial -> NormalLayout + scroll (0, 0).
        fireEvent.click(r.getByTitle("Show a guided tour with help slides."));
        isNotNull(r.container.querySelector(`#${names.keyboard}`));
        equal(window.scrollX, 0);
        equal(window.scrollY, 0);

        const portalEl = document.getElementById(PortalContainer.id)!;
        const closeButton = Array.from(portalEl.querySelectorAll("a")).find(
          (el) => el.textContent?.trim() === "",
        )!;
        isNotNull(closeButton);

        // Trigger Close click and Escape in a single React batch before commit.
        act(() => {
          fireEvent.click(closeButton);
          fireEvent.keyDown(document, { key: "Escape" });
        });

        // Must restore Compact view (#id_keyboard absent) and original scroll.
        isNull(r.container.querySelector(`#${names.keyboard}`));
        isNotNull(r.container.querySelector(`#${names.indicators}`));
        equal(portalEl.textContent!.trim(), "");
        equal(window.scrollX, 18);
        equal(window.scrollY, 420);
      } finally {
        r.unmount();
      }
    });
  } finally {
    cleanupPortal();
    window.localStorage.clear();
  }
});
