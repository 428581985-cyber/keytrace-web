import { type Range } from "@keybr/math";
import { LocalDate } from "@keybr/result";

/**
 * Returns `true` when timestamps cover at least two different calendar days.
 */
export function spansMultipleDays(timeStamps: readonly number[]): boolean {
  if (timeStamps.length < 2) {
    return false;
  }
  const first = new LocalDate(timeStamps[0]).timeStamp;
  for (let i = 1; i < timeStamps.length; i++) {
    if (new LocalDate(timeStamps[i]).timeStamp !== first) {
      return true;
    }
  }
  return false;
}

/**
 * Returns `true` when timestamps cross a calendar year boundary.
 */
export function spansMultipleYears(timeStamps: readonly number[]): boolean {
  if (timeStamps.length < 2) {
    return false;
  }
  const firstYear = new LocalDate(timeStamps[0]).year;
  for (let i = 1; i < timeStamps.length; i++) {
    if (new LocalDate(timeStamps[i]).year !== firstYear) {
      return true;
    }
  }
  return false;
}

export function formatShortDate(
  timeStamp: number,
  includeYear: boolean,
): string {
  const date = new LocalDate(timeStamp);
  return includeYear
    ? `${date.year}/${date.month}/${date.dayOfMonth}`
    : `${date.month}/${date.dayOfMonth}`;
}

export function formatIndexAxisTick(
  timeStamps: readonly number[],
  value: number,
  fallbackFmt: (n: number) => string,
): string {
  if (!spansMultipleDays(timeStamps)) {
    return fallbackFmt(value);
  }
  const index = Math.max(
    0,
    Math.min(timeStamps.length - 1, Math.round(value) - 1),
  );
  return formatShortDate(timeStamps[index], spansMultipleYears(timeStamps));
}

export function ensureNonZeroSpan(range: Range, padding: number): Range {
  if (range.defined && range.span === 0) {
    range.min = range.min - padding;
    range.max = range.max + padding;
  }
  return range;
}
