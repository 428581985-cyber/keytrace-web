import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { makeKeyStatsMap, ResultFaker, speedToTime } from "@keybr/result";
import { FakeSettingsContext } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { render } from "@testing-library/react";
import { ProgressOverviewChart } from "./ProgressOverviewChart.tsx";

test("render empty", () => {
  const letters = FakePhoneticModel.letters;
  const faker = new ResultFaker({ letters });
  const results = faker.nextResultList(0);
  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <ProgressOverviewChart
          keyStatsMap={makeKeyStatsMap(letters, results)}
          width="100px"
          height="100px"
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  r.unmount();
});

test("render non-empty", () => {
  const letters = FakePhoneticModel.letters;
  const faker = new ResultFaker({ letters });
  const results = faker.nextResultList(100);
  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <ProgressOverviewChart
          keyStatsMap={makeKeyStatsMap(letters, results)}
          width="100px"
          height="100px"
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  r.unmount();
});

test("render mixed error-prone, low-sample, and mastered samples", () => {
  const letters = FakePhoneticModel.letters;
  const faker = new ResultFaker({ letters });
  const fastTime = speedToTime(250);
  const r1 = faker.nextResult({
    length: 40,
    time: 10000,
    errors: 4,
    histogram: new Histogram([
      {
        codePoint: letters[0].codePoint,
        hitCount: 10,
        missCount: 3,
        timeToType: fastTime,
      },
      {
        codePoint: letters[1].codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: fastTime,
      },
      {
        codePoint: letters[2].codePoint,
        hitCount: 20,
        missCount: 0,
        timeToType: fastTime,
      },
    ]),
  });
  const r2 = faker.nextResult({
    timeStamp: r1.timeStamp + 60000,
    length: 40,
    time: 10000,
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: letters[0].codePoint,
        hitCount: 15,
        missCount: 0,
        timeToType: fastTime,
      },
      {
        codePoint: letters[2].codePoint,
        hitCount: 25,
        missCount: 0,
        timeToType: fastTime,
      },
    ]),
  });

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <ProgressOverviewChart
          keyStatsMap={makeKeyStatsMap(letters, [r1, r2])}
          width="200px"
          height="200px"
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  r.unmount();
});
