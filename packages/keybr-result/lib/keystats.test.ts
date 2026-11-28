import { test } from "node:test";
import { Letter } from "@keybr/phonetic-model";
import { Histogram } from "@keybr/textinput";
import { deepEqual, equal, isTrue } from "rich-assert";
import { ResultFaker } from "./fake.tsx";
import { KEY_STATS_HALF_LIFE_MS, MutableKeyStatsMap } from "./keystats.ts";
import { TextType } from "./texttype.ts";

test("compute key stats", () => {
  const faker = new ResultFaker();
  const l1 = new Letter(0x0061, 1, "A");
  const l2 = new Letter(0x0062, 1, "B");
  const r1 = faker.nextResult({
    histogram: new Histogram([
      {
        codePoint: l1.codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: 500,
      },
    ]),
  });
  const r2 = faker.nextResult({
    histogram: new Histogram([
      {
        codePoint: l2.codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: 200,
      },
    ]),
  });
  const r3 = faker.nextResult({
    histogram: new Histogram([
      {
        codePoint: l1.codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: 100,
      },
    ]),
  });

  const keyStatsMap = new MutableKeyStatsMap([l1, l2]);

  deepEqual(keyStatsMap.copy().get(l1), {
    letter: l1,
    samples: [],
    timeToType: null,
    bestTimeToType: null,
  });

  keyStatsMap.append(r1);

  deepEqual(keyStatsMap.copy().get(l1), {
    letter: l1,
    samples: [
      {
        index: 0,
        timeStamp: r1.timeStamp,
        hitCount: 1,
        missCount: 0,
        timeToType: 500,
        filteredTimeToType: 500,
      },
    ],
    timeToType: 500,
    bestTimeToType: 500,
  });

  keyStatsMap.append(r2);
  keyStatsMap.append(r3);

  deepEqual(keyStatsMap.copy().get(l1), {
    letter: l1,
    samples: [
      {
        index: 0,
        timeStamp: r1.timeStamp,
        hitCount: 1,
        missCount: 0,
        timeToType: 500,
        filteredTimeToType: 500,
      },
      {
        index: 2,
        timeStamp: r3.timeStamp,
        hitCount: 1,
        missCount: 0,
        timeToType: 100,
        filteredTimeToType: 460,
      },
    ],
    timeToType: 460,
    bestTimeToType: 460,
  });

  deepEqual(keyStatsMap.copy().get(l2), {
    letter: l2,
    samples: [
      {
        index: 1,
        timeStamp: r2.timeStamp,
        hitCount: 1,
        missCount: 0,
        timeToType: 200,
        filteredTimeToType: 200,
      },
    ],
    timeToType: 200,
    bestTimeToType: 200,
  });
});

test("MutableKeyStats applies 7-day half-life decay across multi-day gaps and weights KeyTrace lower", () => {
  const faker = new ResultFaker();
  const l1 = new Letter(0x0061, 1, "A");
  const baseTs = 1_700_000_000_000;

  const mkHist = (timeToType: number) =>
    new Histogram([
      {
        codePoint: l1.codePoint,
        hitCount: 20,
        missCount: 0,
        timeToType,
      },
    ]);

  // 1) Immediate (<1h) gap keeps classic alpha=0.1; 14-day gap decays prior mass (alpha increases ~0.31).
  const sameHourMap = new MutableKeyStatsMap([l1]);
  sameHourMap.append(
    faker.nextResult({ timeStamp: baseTs, histogram: mkHist(600) }),
  );
  sameHourMap.append(
    faker.nextResult({
      timeStamp: baseTs + 60_000,
      histogram: mkHist(200),
    }),
  );

  const twoWeeksLaterMap = new MutableKeyStatsMap([l1]);
  twoWeeksLaterMap.append(
    faker.nextResult({ timeStamp: baseTs, histogram: mkHist(600) }),
  );
  twoWeeksLaterMap.append(
    faker.nextResult({
      timeStamp: baseTs + 2 * KEY_STATS_HALF_LIFE_MS,
      histogram: mkHist(200),
    }),
  );

  const sameHourT = sameHourMap.copy().get(l1).timeToType!;
  const decayedT = twoWeeksLaterMap.copy().get(l1).timeToType!;
  equal(sameHourT, 560);
  isTrue(
    decayedT < 500,
    `Expected 14-day decay to recover faster than 500ms, got ${decayedT}`,
  );

  // 2) TextType.KEYTRACE carries half speed weight vs native web lesson and tags sample.textType.
  const ktMap = new MutableKeyStatsMap([l1]);
  ktMap.append(
    faker.nextResult({
      timeStamp: baseTs,
      textType: TextType.GENERATED,
      histogram: mkHist(200),
    }),
  );
  ktMap.append(
    faker.nextResult({
      timeStamp: baseTs + 60_000,
      textType: TextType.KEYTRACE,
      histogram: mkHist(600),
    }),
  );
  const ktStats = ktMap.copy().get(l1);
  equal(ktStats.samples[0].textType, undefined);
  equal(ktStats.samples[1].textType, TextType.KEYTRACE);
  isTrue(
    ktStats.timeToType! < 240,
    `Expected KeyTrace weight 0.5 to pull less than 0.1 EMA (240ms), got ${ktStats.timeToType}`,
  );
});
