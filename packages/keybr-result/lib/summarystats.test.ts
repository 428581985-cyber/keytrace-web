import { test } from "node:test";
import { Letter } from "@keybr/phonetic-model";
import { Histogram } from "@keybr/textinput";
import { deepEqual, equal, isTrue } from "rich-assert";
import { ResultFaker } from "./fake.tsx";
import {
  makeWeightedSummaryStats,
  MutableMetric,
  MutableSummaryStats,
} from "./summarystats.ts";

function closeTo(actual: number, expected: number, eps = 1e-6) {
  isTrue(
    Math.abs(actual - expected) <= eps,
    `Expected ${actual} to be within ${eps} of ${expected}`,
  );
}

test("metric", () => {
  const metric = new MutableMetric();

  deepEqual(metric.copy(), {
    last: 0,
    delta: 0,
    max: 0,
    min: 0,
    avg: 0,
  });

  metric.append(10);

  deepEqual(metric.copy(), {
    last: 10,
    delta: 10,
    max: 10,
    min: 10,
    avg: 10,
  });

  metric.append(20);

  deepEqual(metric.copy(), {
    last: 20,
    delta: 10,
    max: 20,
    min: 10,
    avg: 15,
  });

  metric.append(15);

  deepEqual(metric.copy(), {
    last: 15,
    delta: 0,
    max: 20,
    min: 10,
    avg: 15,
  });
});

test("summary stats", () => {
  const letter = new Letter(0x0061, 1, "A");
  const faker = new ResultFaker();
  const r1 = faker.nextResult({
    length: 50,
    time: 5000,
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: letter.codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: 500,
      },
    ]),
  });
  const r2 = faker.nextResult({
    length: 50,
    time: 10000,
    errors: 2,
    histogram: new Histogram([
      {
        codePoint: letter.codePoint,
        hitCount: 1,
        missCount: 0,
        timeToType: 500,
      },
    ]),
  });

  const stats = new MutableSummaryStats();

  deepEqual(stats.copy(), {
    count: 0,
    time: 0,
    speed: { last: 0, delta: 0, max: 0, min: 0, avg: 0 },
    accuracy: { last: 0, delta: 0, max: 0, min: 0, avg: 0 },
    score: { last: 0, delta: 0, max: 0, min: 0, avg: 0 },
  });

  stats.append(r1);

  deepEqual(stats.copy(), {
    count: 1,
    time: 5000,
    speed: { last: 600, delta: 600, max: 600, min: 600, avg: 600 },
    accuracy: { last: 1.0, delta: 1.0, max: 1.0, min: 1.0, avg: 1.0 },
    score: { last: 600, delta: 600, max: 600, min: 600, avg: 600 },
  });

  stats.append(r2);

  deepEqual(stats.copy(), {
    count: 2,
    time: 15000,
    speed: { last: 300, delta: -300, max: 600, min: 300, avg: 450 },
    accuracy: {
      last: 0.96,
      delta: -0.040000000000000036,
      max: 1.0,
      min: 0.96,
      avg: 0.98,
    },
    score: { last: 100, delta: -500, max: 600, min: 100, avg: 350 },
  });
});

test("weighted summary stats weights speed by time and accuracy by length", () => {
  const letter = new Letter(0x0061, 1, "A");
  const faker = new ResultFaker();
  const empty = makeWeightedSummaryStats([]);
  equal(empty.count, 0);
  equal(empty.speed.avg, 0);
  equal(empty.accuracy.avg, 0);

  // Short burst: 10 chars in 1000ms -> 600 CPM, 100% accuracy
  const shortBurst = faker.nextResult({
    length: 10,
    time: 1000,
    errors: 0,
    histogram: new Histogram([
      {
        codePoint: letter.codePoint,
        hitCount: 10,
        missCount: 0,
        timeToType: 100,
      },
    ]),
  });
  // Long session: 500 chars in 150000ms -> 200 CPM, 50 errors -> 90% accuracy
  const longSession = faker.nextResult({
    length: 500,
    time: 150000,
    errors: 50,
    histogram: new Histogram([
      {
        codePoint: letter.codePoint,
        hitCount: 500,
        missCount: 50,
        timeToType: 300,
      },
    ]),
  });

  const weighted = makeWeightedSummaryStats([shortBurst, longSession]);
  equal(weighted.count, 2);
  equal(weighted.time, 151000);
  equal(weighted.speed.max, 600);
  equal(weighted.speed.min, 200);
  equal(weighted.speed.last, 200);
  // True weighted speed = (510 / 151) * 60 ~= 202.649 (NOT unweighted 400)
  closeTo(weighted.speed.avg, (510 / 151) * 60, 1e-6);
  closeTo(weighted.speed.delta, 200 - (510 / 151) * 60, 1e-6);
  // True weighted accuracy = (510 - 50) / 510 ~= 0.90196 (NOT unweighted 0.95)
  closeTo(weighted.accuracy.avg, 460 / 510, 1e-6);
  equal(weighted.accuracy.max, 1);
  equal(weighted.accuracy.min, 0.9);
  equal(weighted.accuracy.last, 0.9);
});
