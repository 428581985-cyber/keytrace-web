import { test } from "node:test";
import { deepEqual, equal, isFalse, isTrue } from "rich-assert";
import { DailyStatsMap } from "./dailystats.ts";
import { ResultFaker } from "./fake.tsx";
import { LocalDate } from "./localdate.ts";
import { makeWeightedSummaryStats } from "./summarystats.ts";

function closeTo(actual: number, expected: number, eps = 1e-6) {
  isTrue(
    Math.abs(actual - expected) <= eps,
    `Expected ${actual} to be within ${eps} of ${expected}`,
  );
}

test("no results", () => {
  // Arrange.

  const today = new LocalDate(2001, 2, 3);

  // Act.

  const map = new DailyStatsMap([], today);
  const groups = [...map];

  // Assert.

  equal(groups.length, 0);
  deepEqual(map.today, {
    date: today,
    results: [],
    stats: makeWeightedSummaryStats([]),
  });
  isFalse(map.has(today));
});

test("no results today", () => {
  // Arrange.

  const today = new LocalDate(2001, 2, 3);
  const yesterday = today.minusDays(1);
  const faker = new ResultFaker();
  const r1 = faker.nextResult({ timeStamp: yesterday.timeStamp });

  // Act.

  const map = new DailyStatsMap([r1], today);
  const groups = [...map];

  // Assert.

  equal(groups.length, 1);
  const [g0] = groups;
  deepEqual(g0, {
    date: yesterday,
    results: [r1],
    stats: makeWeightedSummaryStats([r1]),
  });
  deepEqual(map.today, {
    date: today,
    results: [],
    stats: makeWeightedSummaryStats([]),
  });
  isFalse(groups.includes(map.today));
  isTrue(map.has(yesterday));
  isFalse(map.has(today));
});

test("group results group by date", () => {
  // Arrange.

  const today = new LocalDate(2001, 2, 3);
  const yesterday = today.minusDays(1);
  const faker = new ResultFaker();
  const r1 = faker.nextResult({ timeStamp: yesterday.timeStamp });
  const r2 = faker.nextResult({ timeStamp: today.timeStamp });

  // Act.

  const map = new DailyStatsMap([r1, r2], today);
  const groups = [...map];

  // Assert.

  equal(groups.length, 2);
  const [g0, g1] = groups;
  deepEqual(g0, {
    date: yesterday,
    results: [r1],
    stats: makeWeightedSummaryStats([r1]),
  });
  deepEqual(g1, {
    date: today,
    results: [r2],
    stats: makeWeightedSummaryStats([r2]),
  });
  deepEqual(map.today, {
    date: today,
    results: [r2],
    stats: makeWeightedSummaryStats([r2]),
  });
  isTrue(groups.includes(map.today));
  isTrue(map.has(yesterday));
  isTrue(map.has(today));
});

test("daily stats use weighted speed and accuracy for mixed-length sessions", () => {
  const today = new LocalDate(2001, 2, 3);
  const faker = new ResultFaker();
  const shortFast = faker.nextResult({
    timeStamp: today.timeStamp,
    length: 10,
    time: 1000,
    errors: 0,
  });
  const longSlow = faker.nextResult({
    timeStamp: today.timeStamp + 1000,
    length: 200,
    time: 60000,
    errors: 20,
  });
  const map = new DailyStatsMap([shortFast, longSlow], today);
  closeTo(map.today.stats.speed.avg, (210 / 61) * 60, 1e-6);
  closeTo(map.today.stats.accuracy.avg, 190 / 210, 1e-6);
});
