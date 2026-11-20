import { test } from "node:test";
import { Layout } from "@keybr/keyboard";
import { Histogram } from "@keybr/textinput";
import { deepEqual, equal } from "rich-assert";
import {
  activeDayCount,
  aggregateResultsByDate,
  selectChartSeries,
  totalCharacters,
} from "./daily-aggregate.ts";
import { LocalDate } from "./localdate.ts";
import { Result } from "./result.ts";
import { TextType } from "./texttype.ts";

function makeHistogram(
  entries: readonly (readonly [number, number, number, number])[],
): Histogram {
  return new Histogram(
    entries.map(([codePoint, hitCount, missCount, timeToType]) => ({
      codePoint,
      hitCount,
      missCount,
      timeToType,
    })),
  );
}

test("aggregateResultsByDate merges same-day results with hit-weighted key timing", () => {
  const d1Morning = new Date(2026, 10, 18, 9, 0, 0).getTime();
  const d1Evening = new Date(2026, 10, 18, 21, 0, 0).getTime();
  const d2 = new Date(2026, 10, 19, 14, 30, 0).getTime();

  const r1 = new Result(
    Layout.ZH_SP,
    TextType.GENERATED,
    d1Morning,
    100,
    20000,
    2,
    makeHistogram([
      [0x61, 30, 1, 200],
      [0x62, 10, 0, 300],
      [0x63, 10, 0, 250],
    ]),
  );
  const r2 = new Result(
    Layout.ZH_SP,
    TextType.GENERATED,
    d1Evening,
    200,
    40000,
    4,
    makeHistogram([
      [0x61, 10, 2, 400],
      [0x62, 10, 1, 100],
      [0x64, 15, 0, 180],
    ]),
  );
  const r3 = new Result(
    Layout.ZH_SP,
    TextType.GENERATED,
    d2,
    150,
    30000,
    1,
    makeHistogram([
      [0x61, 20, 0, 220],
      [0x62, 20, 0, 220],
      [0x63, 20, 0, 220],
    ]),
  );

  // Feed out of order to verify chronological sorting.
  const daily = aggregateResultsByDate([r3, r2, r1]);
  equal(daily.length, 2);

  const day1ExpectedTs = new LocalDate(2026, 11, 18).timeStamp;
  const day2ExpectedTs = new LocalDate(2026, 11, 19).timeStamp;

  equal(daily[0].timeStamp, day1ExpectedTs);
  equal(daily[0].length, 300);
  equal(daily[0].time, 60000);
  equal(daily[0].errors, 6);
  // Key 'a': (30*200 + 10*400) / 40 = 250; hits=40, miss=3.
  deepEqual(daily[0].histogram.get(0x61), {
    codePoint: 0x61,
    hitCount: 40,
    missCount: 3,
    timeToType: 250,
  });
  // Key 'b': (10*300 + 10*100) / 20 = 200; hits=20, miss=1.
  deepEqual(daily[0].histogram.get(0x62), {
    codePoint: 0x62,
    hitCount: 20,
    missCount: 1,
    timeToType: 200,
  });

  equal(daily[1].timeStamp, day2ExpectedTs);
  equal(daily[1].length, 150);

  equal(totalCharacters([r1, r2, r3]), 450);
  equal(activeDayCount([r1, r2, r3]), 2);
});

test("selectChartSeries switches between date mode and single-day session fallback", () => {
  const sameDay1 = new Date(2026, 10, 20, 10, 0, 0).getTime();
  const sameDay2 = new Date(2026, 10, 20, 15, 0, 0).getTime();
  const nextDay = new Date(2026, 10, 21, 10, 0, 0).getTime();
  const h = makeHistogram([
    [0x61, 10, 0, 200],
    [0x62, 10, 0, 200],
    [0x63, 10, 0, 200],
  ]);

  const a = new Result(Layout.ZH_SP, TextType.GENERATED, sameDay1, 50, 10000, 0, h);
  const b = new Result(Layout.ZH_SP, TextType.GENERATED, sameDay2, 80, 16000, 1, h);
  const c = new Result(Layout.ZH_SP, TextType.GENERATED, nextDay, 90, 18000, 0, h);

  const singleDay = selectChartSeries([a, b]);
  equal(singleDay.mode, "session");
  equal(singleDay.results.length, 2);

  const multiDay = selectChartSeries([a, b, c]);
  equal(multiDay.mode, "date");
  equal(multiDay.results.length, 2);
  equal(multiDay.results[0].length, 130);
});
