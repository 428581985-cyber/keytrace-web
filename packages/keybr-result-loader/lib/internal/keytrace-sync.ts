import { Result, TextType } from "@keybr/result";
import { resultFromJson, type ResultJson } from "@keybr/result-io";

const STORAGE_KEY = "keybr.keytrace.lastSyncedTs";
const VERSION_KEY = "keybr.keytrace.syncVersion";
const SYNCED_KEYS_KEY = "keybr.keytrace.syncedKeys";
const CURRENT_SYNC_VERSION = 5;

export type KeyTraceSyncResponse = {
  readonly available?: boolean;
  readonly syncVersion?: number;
  readonly records: readonly ResultJson[];
  readonly latestTs: number;
  readonly daysScanned: number;
  readonly commitKeys?: readonly string[];
};

export type KeyTraceSyncSummary = {
  readonly added: number;
  readonly daysScanned: number;
};

function isResponseUnavailable(
  data: Partial<KeyTraceSyncResponse>,
  daysScanned: number,
  recordsCount: number,
): boolean {
  if (data.available === false) {
    return true;
  }
  if (data.available == null && daysScanned === 0 && recordsCount === 0) {
    return true;
  }
  return false;
}

export async function syncKeyTraceResults(
  existingResults: readonly Result[],
  appendResults: (results: readonly Result[]) => void,
  replaceResults?: (results: readonly Result[]) => void,
): Promise<KeyTraceSyncSummary> {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { added: 0, daysScanned: 0 };
  }

  const needsMigration =
    readSyncVersion() !== CURRENT_SYNC_VERSION && replaceResults != null;

  if (needsMigration) {
    const response = await fetch("/_/sync/keytrace?since=0&migrate=1");
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

    if (isResponseUnavailable(data, daysScanned, records.length)) {
      return { added: 0, daysScanned: 0 };
    }

    const removeSet = new Set<string>(readSyncedKeys());
    if (Array.isArray(data.commitKeys)) {
      for (const key of data.commitKeys) {
        if (typeof key === "string") {
          removeSet.add(key);
        }
      }
    }

    const kept = existingResults.filter(
      (result) =>
        result.textType !== TextType.KEYTRACE &&
        !removeSet.has(dedupKey(result)) &&
        !removeSet.has(legacyFloorKey(result)),
    );
    const seenKeys = new Set(kept.map(dedupKey));
    const fresh: Result[] = [];
    const freshKeys: string[] = [];

    for (const record of records) {
      const result = resultFromJson(record);
      if (result != null && Result.isValid(result)) {
        const key = dedupKey(result);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          fresh.push(result);
          freshKeys.push(key);
        }
      }
    }

    if (kept.length !== existingResults.length || fresh.length > 0) {
      const merged = [...kept, ...fresh].sort(
        (a, b) => a.timeStamp - b.timeStamp,
      );
      replaceResults(merged);
    }

    writeSyncVersion(CURRENT_SYNC_VERSION);
    writeLastSyncedTs(latestTs);
    writeSyncedKeys(freshKeys);

    return { added: fresh.length, daysScanned };
  }

  const lastSyncedTs = readLastSyncedTs();
  const canReplaceSameDay = replaceResults != null && lastSyncedTs > 0;
  const querySince = canReplaceSameDay
    ? Math.max(0, startOfLocalDay(lastSyncedTs) - 1)
    : lastSyncedTs;
  const response = await fetch(
    `/_/sync/keytrace?since=${encodeURIComponent(String(querySince))}`,
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

  if (isResponseUnavailable(data, daysScanned, records.length)) {
    return { added: 0, daysScanned: 0 };
  }

  if (canReplaceSameDay && latestTs > 0 && latestTs <= lastSyncedTs) {
    return { added: 0, daysScanned };
  }

  const parsedIncoming: Result[] = [];
  for (const record of records) {
    const result = resultFromJson(record);
    if (result != null && Result.isValid(result)) {
      parsedIncoming.push(result);
    }
  }

  if (canReplaceSameDay) {
    const existingKeys = new Set(existingResults.map(dedupKey));
    const newIncoming = parsedIncoming.filter(
      (result) => !existingKeys.has(dedupKey(result)),
    );
    if (newIncoming.length === 0) {
      if (latestTs > lastSyncedTs) {
        writeLastSyncedTs(latestTs);
      }
      return { added: 0, daysScanned };
    }

    const updatedDayLayouts = new Set(newIncoming.map(dayLayoutKey));
    const hasSameDayKeyTrace = existingResults.some(
      (result) =>
        result.textType === TextType.KEYTRACE &&
        updatedDayLayouts.has(dayLayoutKey(result)),
    );

    if (hasSameDayKeyTrace) {
      const removedSameDayKeys = new Set<string>();
      const kept = existingResults.filter((result) => {
        const shouldReplace =
          result.textType === TextType.KEYTRACE &&
          updatedDayLayouts.has(dayLayoutKey(result));
        if (shouldReplace) {
          removedSameDayKeys.add(dedupKey(result));
          return false;
        }
        return true;
      });
      const keptKeys = new Set(kept.map(dedupKey));
      const fresh: Result[] = [];
      for (const result of parsedIncoming) {
        if (!updatedDayLayouts.has(dayLayoutKey(result))) {
          continue;
        }
        const key = dedupKey(result);
        if (!keptKeys.has(key)) {
          keptKeys.add(key);
          fresh.push(result);
        }
      }
      const merged = [...kept, ...fresh].sort(
        (a, b) => a.timeStamp - b.timeStamp,
      );
      replaceResults(merged);

      const nextSyncedKeys = new Set(
        readSyncedKeys().filter((key) => !removedSameDayKeys.has(key)),
      );
      for (const result of fresh) {
        nextSyncedKeys.add(dedupKey(result));
      }
      writeSyncedKeys([...nextSyncedKeys]);
      if (latestTs > lastSyncedTs) {
        writeLastSyncedTs(latestTs);
      }
      if (readSyncVersion() !== CURRENT_SYNC_VERSION) {
        writeSyncVersion(CURRENT_SYNC_VERSION);
      }
      return { added: fresh.length, daysScanned };
    }
  }

  const existingKeys = new Set(existingResults.map(dedupKey));
  const fresh: Result[] = [];
  const syncedKeys = new Set(readSyncedKeys());
  for (const result of parsedIncoming) {
    const key = dedupKey(result);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      fresh.push(result);
      syncedKeys.add(key);
    }
  }

  if (fresh.length > 0) {
    fresh.sort((a, b) => a.timeStamp - b.timeStamp);
    appendResults(fresh);
    writeSyncedKeys([...syncedKeys]);
  }

  if (latestTs > lastSyncedTs) {
    writeLastSyncedTs(latestTs);
  }

  if (readSyncVersion() !== CURRENT_SYNC_VERSION) {
    writeSyncVersion(CURRENT_SYNC_VERSION);
  }

  return { added: fresh.length, daysScanned };
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLayoutKey(result: Result): string {
  const d = new Date(result.timeStamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${result.layout.id}:${y}-${m}-${day}`;
}

function dedupKey(result: Result): string {
  return `${result.layout.id}:${Math.round(result.timeStamp / 1000)}`;
}

function legacyFloorKey(result: Result): string {
  return `${result.layout.id}:${Math.floor(result.timeStamp / 1000)}`;
}

function readSyncVersion(): number {
  try {
    const raw = window.localStorage.getItem(VERSION_KEY);
    if (raw == null) {
      return 1;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}

function writeSyncVersion(version: number): void {
  try {
    window.localStorage.setItem(VERSION_KEY, String(version));
  } catch {
    // Ignore storage errors (private mode, quota exceeded).
  }
}

function readSyncedKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(SYNCED_KEYS_KEY);
    if (raw == null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSyncedKeys(keys: readonly string[]): void {
  try {
    window.localStorage.setItem(SYNCED_KEYS_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage errors (private mode, quota exceeded).
  }
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
