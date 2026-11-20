import { test } from "node:test";
import { Range } from "@keybr/math";
import { equal } from "rich-assert";
import {
  ensureNonZeroSpan,
  formatIndexAxisTick,
  formatShortDate,
  spansMultipleDays,
  spansMultipleYears,
} from "./dates.ts";

test("detects multi-day and multi-year spans and formats ticks", () => {
  const sameDay1 = new Date(2026, 10, 18, 9, 0).getTime();
  const sameDay2 = new Date(2026, 10, 18, 22, 0).getTime();
  const nextDay = new Date(2026, 10, 19, 8, 0).getTime();
  const nextYear = new Date(2027, 0, 2, 8, 0).getTime();

  equal(spansMultipleDays([sameDay1, sameDay2]), false);
  equal(spansMultipleDays([sameDay1, nextDay]), true);
  equal(spansMultipleYears([sameDay1, nextDay]), false);
  equal(spansMultipleYears([sameDay1, nextYear]), true);

  equal(formatShortDate(sameDay1, false), "11/18");
  equal(formatShortDate(nextYear, true), "2027/1/2");

  equal(
    formatIndexAxisTick([sameDay1, sameDay2], 2, (n) => `#${n}`),
    "#2",
  );
  equal(
    formatIndexAxisTick([sameDay1, nextDay], 2, (n) => `#${n}`),
    "11/19",
  );
  equal(
    formatIndexAxisTick([sameDay1, nextYear], 2, (n) => `#${n}`),
    "2027/1/2",
  );
});

test("ensureNonZeroSpan expands collapsed range", () => {
  const r = new Range(50, 50);
  ensureNonZeroSpan(r, 5);
  equal(r.min, 45);
  equal(r.max, 55);
  equal(r.span, 10);
});
