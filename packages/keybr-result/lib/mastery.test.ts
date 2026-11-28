import { test } from "node:test";
import { Letter } from "@keybr/phonetic-model";
import { equal, isNull, isTrue } from "rich-assert";
import { KEY_STATS_HALF_LIFE_MS, type KeyStats } from "./keystats.ts";
import {
  computeKeyMastery,
  computeSampleMastery,
  summarizeKeySamples,
} from "./mastery.ts";
import { speedToTime } from "./result.ts";
import { TextType } from "./texttype.ts";

function closeTo(actual: number, expected: number, eps = 1e-6) {
  isTrue(
    Math.abs(actual - expected) <= eps,
    `Expected ${actual} to be within ${eps} of ${expected}`,
  );
}

const letterA = new Letter(0x0061, 1, "A");

function makeKeyStats({
  timeToType = 200,
  bestTimeToType = 200,
  samples = [
    {
      index: 0,
      timeStamp: 1000,
      hitCount: 20,
      missCount: 0,
      timeToType: 200,
      filteredTimeToType: 200,
    },
  ],
}: Partial<KeyStats> = {}): KeyStats {
  return {
    letter: letterA,
    samples,
    timeToType,
    bestTimeToType,
  };
}

test("computeKeyMastery returns null when timeToType or bestTimeToType is null or non-positive", () => {
  isNull(
    computeKeyMastery(
      makeKeyStats({ timeToType: null, bestTimeToType: null, samples: [] }),
      175,
    ),
  );
  isNull(
    computeKeyMastery(
      makeKeyStats({ timeToType: 0, bestTimeToType: 200 }),
      175,
      { useRealTime: true },
    ),
  );
  isNull(
    computeKeyMastery(
      makeKeyStats({ timeToType: 200, bestTimeToType: null }),
      175,
      { useRealTime: false },
    ),
  );
});

test("computeKeyMastery penalizes high error rate even at high typing speed", () => {
  // 70 WPM = 350 CPM (~171.4ms) vs 175 CPM target, but 15% error rate
  const fastErrorProne = makeKeyStats({
    timeToType: speedToTime(350),
    bestTimeToType: speedToTime(350),
    samples: [
      {
        index: 0,
        timeStamp: 1000,
        hitCount: 100,
        missCount: 15,
        timeToType: speedToTime(350),
        filteredTimeToType: speedToTime(350),
      },
    ],
  });
  const mastery = computeKeyMastery(fastErrorProne, 175)!;
  isTrue(mastery < 0.6);
  closeTo(mastery, 0.48, 1e-6);
});

test("computeKeyMastery damps low sample count even at high speed", () => {
  const twoHits = makeKeyStats({
    timeToType: speedToTime(300),
    bestTimeToType: speedToTime(300),
    samples: [
      {
        index: 0,
        timeStamp: 1000,
        hitCount: 2,
        missCount: 0,
        timeToType: speedToTime(300),
        filteredTimeToType: speedToTime(300),
      },
    ],
  });
  const mastery = computeKeyMastery(twoHits, 175)!;
  isTrue(mastery < 0.6);
});

test("computeKeyMastery reaches 1.0 when speed, accuracy, and sample count meet target", () => {
  const mastered = makeKeyStats({
    timeToType: speedToTime(175),
    bestTimeToType: speedToTime(175),
    samples: [
      {
        index: 0,
        timeStamp: 1000,
        hitCount: 15,
        missCount: 0,
        timeToType: speedToTime(175),
        filteredTimeToType: speedToTime(175),
      },
    ],
  });
  equal(computeKeyMastery(mastered, 175), 1);
});

test("computeKeyMastery respects useRealTime vs bestTimeToType", () => {
  const regressed = makeKeyStats({
    timeToType: speedToTime(80), // regressed below 175 CPM
    bestTimeToType: speedToTime(250),
    samples: [
      {
        index: 0,
        timeStamp: 1000,
        hitCount: 20,
        missCount: 0,
        timeToType: speedToTime(80),
        filteredTimeToType: speedToTime(80),
      },
    ],
  });
  const realTime = computeKeyMastery(regressed, 175, { useRealTime: true })!;
  const bestTime = computeKeyMastery(regressed, 175, { useRealTime: false })!;
  isTrue(realTime < 0.5);
  equal(bestTime, 1);
});

test("computeKeyMastery preserves synthetic KeyStats without samples", () => {
  const synthetic = makeKeyStats({
    timeToType: speedToTime(175),
    bestTimeToType: speedToTime(175),
    samples: [],
  });
  equal(computeKeyMastery(synthetic, 175), 1);
});

test("summarizeKeySamples computes errorRate from missCount / hitCount", () => {
  const summary = summarizeKeySamples(
    makeKeyStats({
      samples: [
        {
          index: 0,
          timeStamp: 1000,
          hitCount: 10,
          missCount: 1,
          timeToType: 200,
          filteredTimeToType: 200,
        },
        {
          index: 1,
          timeStamp: 2000,
          hitCount: 10,
          missCount: 3,
          timeToType: 200,
          filteredTimeToType: 200,
        },
      ],
    }),
  );
  equal(summary.totalHits, 20);
  equal(summary.totalMisses, 4);
  closeTo(summary.errorRate, 0.2, 1e-6);
  closeTo(summary.accuracy, 0.8, 1e-6);
});

test("computeSampleMastery penalizes misses and single-hit samples", () => {
  isNull(
    computeSampleMastery({ timeToType: 0, hitCount: 5, missCount: 5 }, 175),
  );
  const singleHit = computeSampleMastery(
    { timeToType: speedToTime(300), hitCount: 1, missCount: 0 },
    175,
  )!;
  isTrue(singleHit <= 0.67);

  const highError = computeSampleMastery(
    { timeToType: speedToTime(300), hitCount: 10, missCount: 2 },
    175,
  )!;
  isTrue(highError < 0.4);

  const clean = computeSampleMastery(
    { timeToType: speedToTime(200), hitCount: 5, missCount: 0 },
    175,
  )!;
  equal(clean, 1);
});

test("summarizeKeySamples decays 14-day-old errors and caps high-volume KeyTrace hits", () => {
  const baseTs = 1_700_000_000_000;
  const twoWeeksMs = 2 * KEY_STATS_HALF_LIFE_MS;

  // 14-day-old 20% error KeyTrace aggregate (1000 hits / 200 misses) vs clean web practice today (40 hits / 0 misses).
  const stats = makeKeyStats({
    timeToType: speedToTime(220),
    bestTimeToType: speedToTime(220),
    samples: [
      {
        index: 0,
        timeStamp: baseTs,
        hitCount: 1000,
        missCount: 200,
        timeToType: 500,
        filteredTimeToType: 500,
        textType: TextType.KEYTRACE,
      },
      {
        index: 1,
        timeStamp: baseTs + twoWeeksMs,
        hitCount: 40,
        missCount: 0,
        timeToType: 250,
        filteredTimeToType: 250,
      },
    ],
  });

  const summary = summarizeKeySamples(stats);
  equal(summary.totalHits, 1040);
  equal(summary.totalMisses, 200);
  // KeyTrace capped at 40 * 0.35 = 14 effective hits, decayed 0.25x at 14d = 3.5 weighted hits & 0.7 weighted misses.
  // Total weighted = 40 + 3.5 = 43.5 hits -> errorRate ~ 0.7 / 43.5 ~ 0.016 (< 2% accuracy tolerance!).
  isTrue(
    summary.errorRate < 0.02,
    `Expected decayed+capped errorRate < 0.02, got ${summary.errorRate}`,
  );
  equal(computeKeyMastery(stats, 175), 1);
});
