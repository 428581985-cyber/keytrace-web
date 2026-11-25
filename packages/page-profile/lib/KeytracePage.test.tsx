import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { KeyboardOptions, Language, Layout } from "@keybr/keyboard";
import { getFocusStorageKeys } from "@keybr/lesson";
import { FakeResultContext } from "@keybr/result";
import { Settings, SettingsContext } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { equal, isNotNull, isNull } from "rich-assert";
import { KeytracePage } from "./KeytracePage.tsx";

const emptyBucket = {
  totalKeys: 0,
  zhKeys: 0,
  enKeys: 0,
  hits: 0,
  errors: 0,
  corrections: 0,
  accuracy: 0,
  avgWpm: 0,
  activeMs: 0,
  commits: 0,
};

function makeEmptyWeakKeys() {
  return {
    "zh-sp": [],
    "zh-sp-zrm": [],
    "zh-sp-ms": [],
    "zh-sp-sg": [],
    "zh-qp": [],
    "en-us": [],
  };
}

test("renders clean disconnected onboarding card when status.available is false", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: {
          available: false,
          active: false,
          lastEventTs: null,
          todayDate: "2026-11-25",
          todayBytes: 0,
          daysAvailable: 0,
          imeName: null,
        },
        today: emptyBucket,
        overall: emptyBucket,
        daily: [],
        apps: [],
        weakKeys: makeEmptyWeakKeys(),
        recentCorrections: [],
        recentCommits: [],
      }),
    }) as unknown as Response;

  let navigated = 0;
  const settings = new Settings();
  const r = render(
    <FakeIntlProvider>
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <FakeResultContext>
          <KeytracePage
            onNavigateToPractice={() => {
              navigated += 1;
            }}
          />
        </FakeResultContext>
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(await r.findByText("Local KeyTrace data not detected"));
    isNull(r.queryByText(/Failed to load/));
    isNull(r.queryByText(/All-Time/));
    isNull(r.queryByText(/Sync to Practice/));

    fireEvent.click(r.getByText("Go to Practice"));
    equal(navigated, 1);
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

test("renders clean disconnected onboarding card on fetch error without broken error message", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  const settings = new Settings();
  const r = render(
    <FakeIntlProvider>
      <SettingsContext.Provider value={{ settings, updateSettings: () => {} }}>
        <FakeResultContext>
          <KeytracePage onNavigateToPractice={() => {}} />
        </FakeResultContext>
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    isNotNull(await r.findByText("Local KeyTrace data not detected"));
    isNull(r.queryByText(/network down/));
    isNull(r.queryByText(/Failed to load/));
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

test("handlePracticeKey writes drill focus keys for both en-us and zh-sp layouts", async () => {
  window.localStorage.clear();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: {
          available: true,
          active: true,
          lastEventTs: Date.now(),
          todayDate: "2026-11-25",
          todayBytes: 2048,
          daysAvailable: 3,
          imeName: "Weasel",
        },
        today: { ...emptyBucket, totalKeys: 100, zhKeys: 60, enKeys: 40 },
        overall: { ...emptyBucket, totalKeys: 500, zhKeys: 300, enKeys: 200 },
        daily: [],
        apps: [],
        weakKeys: {
          ...makeEmptyWeakKeys(),
          "zh-sp": [
            {
              letter: "V",
              codePoint: 0x0076,
              hits: 50,
              misses: 5,
              errorRate: 0.1,
              medianIkiMs: 420,
              wpm: 28,
              samples: 50,
            },
          ],
          "en-us": [
            {
              letter: "R",
              codePoint: 0x0072,
              hits: 60,
              misses: 6,
              errorRate: 0.1,
              medianIkiMs: 390,
              wpm: 30,
              samples: 60,
            },
          ],
        },
        recentCorrections: [],
        recentCommits: [],
      }),
    }) as unknown as Response;

  let latestSettings = KeyboardOptions.default()
    .withLanguage(Language.ZH_SP)
    .withLayout(Layout.ZH_SP)
    .save(new Settings());
  let navigated = 0;

  const r = render(
    <FakeIntlProvider>
      <SettingsContext.Provider
        value={{
          settings: latestSettings,
          updateSettings: (next) => {
            latestSettings = next;
          },
        }}
      >
        <FakeResultContext>
          <KeytracePage
            onNavigateToPractice={() => {
              navigated += 1;
            }}
          />
        </FakeResultContext>
      </SettingsContext.Provider>
    </FakeIntlProvider>,
  );

  try {
    // FakeIntlProvider defaults to zh-hans -> drill 'V' for zh-sp.
    const zhDrillBtn = await r.findByTitle("跳转到练习页专注练习 V 键");
    fireEvent.click(zhDrillBtn);
    const zhKeys = getFocusStorageKeys("zh-sp");
    equal(window.localStorage.getItem(zhKeys.lockedKey), "v");
    equal(window.localStorage.getItem(zhKeys.drillKey), "v");
    equal(navigated, 1);

    // Switch to English tab -> drill 'R' for en-us.
    fireEvent.click(r.getByText("英文"));
    const enDrillBtn = await r.findByTitle("跳转到练习页专注练习 R 键");
    fireEvent.click(enDrillBtn);
    const enKeys = getFocusStorageKeys("en-us");
    equal(window.localStorage.getItem(enKeys.lockedKey), "r");
    equal(window.localStorage.getItem(enKeys.drillKey), "r");
    equal(KeyboardOptions.from(latestSettings).layout, Layout.EN_US);
    equal(navigated, 2);
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
    window.localStorage.clear();
  }
});
