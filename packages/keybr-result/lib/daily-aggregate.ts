import { Histogram, type Sample, validateSample } from "@keybr/textinput";
import { ResultGroups } from "./group.ts";
import { Result } from "./result.ts";

export type ChartSeries = {
  readonly mode: "date" | "session";
  readonly results: readonly Result[];
};

/**
 * Merges results belonging to the same local calendar day into one daily summary
 * `Result`, ordered chronologically by day.
 */
export function aggregateResultsByDate(
  results: readonly Result[],
): readonly Result[] {
  const dayGroups = [...ResultGroups.byDate(results)].sort(
    (a, b) => a.key.timeStamp - b.key.timeStamp,
  );
  return dayGroups.map(({ key: date, results: dayResults }) => {
    const first = dayResults[0];
    if (dayResults.length === 1) {
      return new Result(
        first.layout,
        first.textType,
        date.timeStamp,
        first.length,
        first.time,
        first.errors,
        first.histogram,
      );
    }

    let length = 0;
    let time = 0;
    let errors = 0;
    const perKey = new Map<
      number,
      {
        hitCount: number;
        missCount: number;
        weightedTime: number;
        totalWeight: number;
      }
    >();

    for (const r of dayResults) {
      length += r.length;
      time += r.time;
      errors += r.errors;
      for (const sample of r.histogram) {
        let acc = perKey.get(sample.codePoint);
        if (acc == null) {
          acc = {
            hitCount: 0,
            missCount: 0,
            weightedTime: 0,
            totalWeight: 0,
          };
          perKey.set(sample.codePoint, acc);
        }
        acc.hitCount += sample.hitCount;
        acc.missCount += sample.missCount;
        if (sample.timeToType > 0) {
          const weight = Math.max(1, sample.hitCount);
          acc.weightedTime += sample.timeToType * weight;
          acc.totalWeight += weight;
        }
      }
    }

    const samples: Sample[] = [...perKey.entries()]
      .map(([codePoint, acc]) => ({
        codePoint,
        hitCount: acc.hitCount,
        missCount: acc.missCount,
        timeToType:
          acc.totalWeight > 0
            ? Math.round(acc.weightedTime / acc.totalWeight)
            : 0,
      }))
      .filter(validateSample);

    return new Result(
      first.layout,
      first.textType,
      date.timeStamp,
      length,
      time,
      errors,
      new Histogram(samples),
    );
  });
}

/**
 * Uses daily aggregated points whenever data spans at least two days; otherwise
 * falls back to individual session points so single-day users still see charts.
 */
export function selectChartSeries(results: readonly Result[]): ChartSeries {
  const daily = aggregateResultsByDate(results);
  if (daily.length >= 2) {
    return { mode: "date", results: daily };
  }
  return { mode: "session", results };
}

/**
 * Total typed character count across all results.
 */
export function totalCharacters(results: readonly Result[]): number {
  let sum = 0;
  for (const r of results) {
    sum += r.length;
  }
  return sum;
}

/**
 * Number of distinct local calendar days present in `results`.
 */
export function activeDayCount(results: readonly Result[]): number {
  return [...ResultGroups.byDate(results)].length;
}
