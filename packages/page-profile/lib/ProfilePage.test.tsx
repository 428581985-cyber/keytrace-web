import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Layout } from "@keybr/keyboard";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import {
  FakeResultContext,
  makeKeyStatsMap,
  ResultFaker,
  speedToTime,
  TextType,
} from "@keybr/result";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { render } from "@testing-library/react";
import { isNotNull, isNull } from "rich-assert";
import { ProfilePage } from "./ProfilePage.tsx";

const faker = new ResultFaker();

test("render", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <PageDataContext.Provider
        value={{ publicUser: { id: "abc" } } as PageData}
      >
        <FakeSettingsContext>
          <FakeResultContext initialResults={faker.nextResultList(100)}>
            <ProfilePage />
          </FakeResultContext>
        </FakeSettingsContext>
      </PageDataContext.Provider>
    </FakeIntlProvider>,
  );

  isNotNull(await r.findByText("Typing Speed"));
  isNotNull(await r.findByText("Key Typing Speed"));

  r.unmount();
});

test("KeySpeedChartSection KeyDetails uses session-level keyStatsMap across multiple days and AllTimeSummary uses weighted averages", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const letters = FakePhoneticModel.letters;
  const faker = new ResultFaker({ letters });
  const day1 = new Date(2026, 10, 1, 10, 0, 0).getTime();
  const day2 = new Date(2026, 10, 2, 10, 0, 0).getTime();

  // Day 1: 1 short fast session (10 chars, 1s = 600 CPM = 120 WPM, key 'a' at 200ms = 60 WPM)
  const fastDay1 = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.GENERATED,
    timeStamp: day1,
    length: 10,
    time: 1000,
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: letters[0].codePoint,
        hitCount: 10,
        missCount: 0,
        timeToType: speedToTime(300), // 200ms -> 60.0wpm
      },
    ]),
  });

  // Day 2: 15 longer slow sessions (500 chars each, 150s = 200 CPM = 40 WPM, key 'a' at 500ms = 24 WPM)
  const slowDay2 = Array.from({ length: 15 }, (_, i) =>
    faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.GENERATED,
      timeStamp: day2 + i * 1000,
      length: 500,
      time: 150000,
      errors: 50,
      histogram: new Histogram([
        {
          codePoint: letters[0].codePoint,
          hitCount: 50,
          missCount: 5,
          timeToType: speedToTime(120), // 500ms -> 24.0wpm
        },
      ]),
    }),
  );

  const results = [fastDay1, ...slowDay2];
  const sessionStatsMap = makeKeyStatsMap(letters, results);
  // Session EMA after 15 slow sessions at 500ms after 1 fast at 200ms:
  // ~438ms -> ~27.4wpm, whereas daily-aggregated EMA would be 230ms -> ~52.2wpm!
  const sessionTime = sessionStatsMap.get(letters[0]).timeToType!;
  const sessionWpm = (60 * 1000) / sessionTime / 5;

  const settings = new Settings();
  const r = render(
    <FakeIntlProvider>
      <PageDataContext.Provider
        value={{ publicUser: { id: "abc" } } as PageData}
      >
        <FakeSettingsContext initialSettings={settings}>
          <FakeResultContext initialResults={results}>
            <ProfilePage />
          </FakeResultContext>
        </FakeSettingsContext>
      </PageDataContext.Provider>
    </FakeIntlProvider>,
  );

  await r.findByText("Key Typing Speed");
  const expectedPrefix = `${sessionWpm.toFixed(1)}wpm`;
  isNotNull(
    r.queryByText((content) => content.includes(expectedPrefix)),
  );
  // Ensure it does NOT show the stale daily-aggregated 52.2wpm
  isNull(r.queryByText((content) => content.includes("52.2wpm")));
  // Weighted AllTimeSummary speed is ~40.1wpm (NOT unweighted ~45.0wpm)
  isNull(r.queryByText((content) => content.includes("45.0wpm")));

  r.unmount();
});
