import { Result } from "@keybr/result";
import { resultFromJson, type ResultJson } from "@keybr/result-io";

const STORAGE_KEY = "keybr.keytrace.lastSyncedTs";

export type KeyTraceSyncResponse = {
  readonly records: readonly ResultJson[];
  readonly latestTs: number;
  readonly daysScanned: number;
};

export type KeyTraceSyncSummary = {
  readonly added: number;
  readonly daysScanned: number;
};

export async function syncKeyTraceResults(
  existingResults: readonly Result[],
  appendResults: (results: readonly Result[]) => void,
): Promise<KeyTraceSyncSummary> {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { added: 0, daysScanned: 0 };
  }

  const lastSyncedTs = readLastSyncedTs();
  const response = await fetch(
    `/_/sync/keytrace?since=${encodeURIComponent(String(lastSyncedTs))}`,
  );
  if (!response.ok) {
    throw new Error(`KeyTrace sync failed with status ${response.status}`);
  }

  const data = (await response.json()) as Partial<KeyTraceSyncResponse>;
  const records = Array.isArray(data.records) ? data.records : [];
  const latestTs =
    typeof data.latestTs === "number" && Number.isFinite(data.latestTs)
      ? data.latestTs
      : 0;
  const daysScanned =
    typeof data.daysScanned === "number" && Number.isFinite(data.daysScanned)
      ? data.daysScanned
      : 0;

  const existingKeys = new Set(existingResults.map(dedupKey));
  const fresh: Result[] = [];
  for (const record of records) {
    const result = resultFromJson(record);
    if (result != null && Result.isValid(result)) {
      const key = dedupKey(result);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        fresh.push(result);
      }
    }
  }

  if (fresh.length > 0) {
    fresh.sort((a, b) => a.timeStamp - b.timeStamp);
    appendResults(fresh);
  }

  if (latestTs > lastSyncedTs) {
    writeLastSyncedTs(latestTs);
  }

  return { added: fresh.length, daysScanned };
}

function dedupKey(result: Result): string {
  return `${result.layout.id}:${Math.floor(result.timeStamp / 1000)}`;
}

function readLastSyncedTs(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return 0;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeLastSyncedTs(ts: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // Ignore storage errors (private mode, quota exceeded).
  }
}
