import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { KeyboardOptions, KeyboardProvider, Layout } from "@keybr/keyboard";
import { lessonProps } from "@keybr/lesson";
import { Letter } from "@keybr/phonetic-model";
import { makeKeyStatsMap, ResultFaker, speedToTime } from "@keybr/result";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { render } from "@testing-library/react";
import { equal, isNotNull } from "rich-assert";
import { MasterySection } from "./MasterySection.tsx";

const letters = [..."abcdefghijklmnopqrstuvwxyz"].map(
  (ch, i) => new Letter(ch.codePointAt(0)!, i / 26, ch.toUpperCase()),
);

function barColorForKey(container: HTMLElement, ch: string): string | null {
  const tile = container.querySelector(`[title^="${ch.toUpperCase()}"]`);
  const fill = tile?.lastElementChild?.firstElementChild as HTMLElement | null;
  return fill?.style.background ?? null;
}

test("MasterySection uses real-time timeToType for Chinese layout even when recoverKeys=false", () => {
  const faker = new ResultFaker({ letters });
  const rFast = faker.nextResult({
    timeStamp: 1000,
    length: 50,
    time: 10000,
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: 0x0061, // 'a' fast initially (300 CPM = 200ms)
        hitCount: 20,
        missCount: 0,
        timeToType: speedToTime(300),
      },
    ]),
  });
  // Many slow sessions pull EMA timeToType below target while bestTimeToType stays 200ms
  const slowSessions = Array.from({ length: 20 }, (_, i) =>
    faker.nextResult({
      timeStamp: 2000 + i * 1000,
      length: 50,
      time: 40000,
      errors: 0,
      histogram: new Histogram([
        {
          codePoint: 0x0061,
          hitCount: 20,
          missCount: 0,
          timeToType: speedToTime(60),
        },
      ]),
    }),
  );
  const keyStatsMap = makeKeyStatsMap(letters, [rFast, ...slowSessions]);

  const settings = KeyboardOptions.default()
    .withLanguage(Layout.ZH_SP.language)
    .withLayout(Layout.ZH_SP)
    .save(new Settings())
    .set(lessonProps.guided.recoverKeys, false);

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext initialSettings={settings}>
        <KeyboardProvider>
          <MasterySection keyStatsMap={keyStatsMap} />
        </KeyboardProvider>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  // Weak red (#d4503a -> rgb(212, 80, 58)), NOT green (#7fae8f)
  equal(barColorForKey(r.container, "a"), "rgb(212, 80, 58)");

  r.unmount();
});

test("MasterySection gates by error rate and minimum sample count, and renders green only when truly mastered", () => {
  const faker = new ResultFaker({ letters });
  const fastTime = speedToTime(300);
  const res = faker.nextResult({
    timeStamp: 1000,
    length: 100,
    time: 20000,
    errors: 15,
    histogram: new Histogram([
      // 'a': fast, 15% errors -> weak red (#d4503a)
      { codePoint: 0x0061, hitCount: 100, missCount: 15, timeToType: fastTime },
      // 'b': fast, only 2 hits -> weak red (#d4503a)
      { codePoint: 0x0062, hitCount: 2, missCount: 0, timeToType: fastTime },
      // 'c': fast, 20 hits, 0 errors -> done green (#7fae8f -> rgb(127, 174, 143))
      { codePoint: 0x0063, hitCount: 20, missCount: 0, timeToType: fastTime },
      // 'd': ~90% of target speed (160 CPM vs 175), 20 hits, 0 errors -> warm gold (#c4a23b -> rgb(196, 162, 59))
      {
        codePoint: 0x0064,
        hitCount: 20,
        missCount: 0,
        timeToType: speedToTime(160),
      },
    ]),
  });

  const keyStatsMap = makeKeyStatsMap(letters, [res]);
  const settings = KeyboardOptions.default()
    .withLanguage(Layout.EN_US.language)
    .withLayout(Layout.EN_US)
    .save(new Settings());

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext initialSettings={settings}>
        <KeyboardProvider>
          <MasterySection keyStatsMap={keyStatsMap} />
        </KeyboardProvider>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  equal(barColorForKey(r.container, "a"), "rgb(212, 80, 58)");
  equal(barColorForKey(r.container, "b"), "rgb(212, 80, 58)");
  equal(barColorForKey(r.container, "c"), "rgb(127, 174, 143)");
  equal(barColorForKey(r.container, "d"), "rgb(196, 162, 59)");
  isNotNull(r.container.querySelector('[title^="C · "]'));

  r.unmount();
});
