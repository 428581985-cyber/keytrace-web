import { clamp } from "@keybr/lang";
import { type KeySample, type KeyStats } from "./keystats.ts";
import { speedToTime } from "./result.ts";

export type KeySampleSummary = {
  readonly totalHits: number;
  readonly totalMisses: number;
  readonly errorRate: number;
  readonly accuracy: number;
};

export function summarizeKeySamples(
  keyStats: Pick<KeyStats, "samples">,
): KeySampleSummary {
  let totalHits = 0;
  let totalMisses = 0;
  for (const sample of keyStats.samples) {
    totalHits += sample.hitCount;
    totalMisses += sample.missCount;
  }
  const errorRate =
    totalHits > 0 ? clamp(totalMisses / totalHits, 0, 1) : 0;
  return {
    totalHits,
    totalMisses,
    errorRate,
    accuracy: 1 - errorRate,
  };
}

export function computeSampleMastery(
  sample: Pick<KeySample, "timeToType" | "hitCount" | "missCount">,
  targetSpeed: number,
): number | null {
  const { timeToType, hitCount, missCount } = sample;
  if (timeToType == null || !Number.isFinite(timeToType) || timeToType <= 0) {
    return null;
  }
  const speedRatio = clamp(speedToTime(targetSpeed) / timeToType, 0, 1);
  const errorRate =
    hitCount > 0 ? clamp(missCount / hitCount, 0, 1) : 0;
  const accuracyFactor = clamp(1 - Math.max(0, errorRate - 0.02) * 4, 0.2, 1);
  const sampleFactor =
    hitCount < 3 ? 0.5 + 0.5 * (Math.max(0, hitCount) / 3) : 1;
  return clamp(speedRatio * accuracyFactor * sampleFactor, 0, 1);
}

export function computeKeyMastery(
  keyStats: KeyStats,
  targetSpeed: number,
  options?: { readonly useRealTime?: boolean },
): number | null {
  const useRealTime = options?.useRealTime ?? true;
  const rawTime = useRealTime ? keyStats.timeToType : keyStats.bestTimeToType;
  if (rawTime == null || !Number.isFinite(rawTime) || rawTime <= 0) {
    return null;
  }
  const speedRatio = clamp(speedToTime(targetSpeed) / rawTime, 0, 1);
  const { totalHits, errorRate } = summarizeKeySamples(keyStats);
  const accuracyFactor = clamp(1 - Math.max(0, errorRate - 0.02) * 4, 0.2, 1);
  const sampleFactor =
    keyStats.samples.length === 0
      ? 1
      : totalHits < 15
        ? 0.35 + 0.65 * (Math.max(0, totalHits) / 15)
        : 1;
  return clamp(speedRatio * accuracyFactor * sampleFactor, 0, 1);
}
