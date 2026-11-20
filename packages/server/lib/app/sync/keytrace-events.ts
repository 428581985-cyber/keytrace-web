import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Layout } from "@keybr/keyboard";
import { Result, TextType } from "@keybr/result";
import { type ResultJson, resultToJson } from "@keybr/result-io";
import { Histogram, type Sample } from "@keybr/textinput";

const DAY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/;
const PUA_RE = /[\uE000-\uF8FF]/g;
const CJK_RE = /[\u3400-\u9fff]/;
const ALNUM_RE = /[a-zA-Z0-9]/;

const KD_BUFFER_LIMIT = 60;
const MAX_IKI_MS = 3000;
const FALLBACK_KEY_MS = 200;
const MIN_TIME_TO_TYPE = 40;
const MAX_TIME_TO_TYPE = 12000;

const MODIFIER_VK_SET = new Set([
  16, // Shift
  17, // Ctrl
  18, // Alt
  20, // CapsLock
  91, // LWin
  92, // RWin
  160, // LShift
  161, // RShift
  162, // LCtrl
  163, // RCtrl
  164, // LAlt
  165, // RAlt
]);

export type KeyTraceSyncData = {
  readonly records: ResultJson[];
  readonly latestTs: number;
  readonly daysScanned: number;
};

type RawEvent = {
  readonly v: 1;
  readonly ts: number;
  readonly mono: number;
  readonly ev: string;
  readonly sid?: string | number;
  readonly sessionStartTs?: number;
  readonly sc?: number;
  readonly vk?: number;
  readonly mods?: number;
  readonly keys?: number;
  readonly text?: string;
};

type KdEvent = {
  readonly vk: number;
  readonly mono: number;
};

type KeyAccumulator = {
  hitCount: number;
  missCount: number;
  readonly ikiSamples: number[];
};

type DayBucket = {
  readonly day: string;
  readonly layoutId: "zh-sp" | "en-us";
  lastTs: number;
  length: number;
  errors: number;
  activeMs: number;
  readonly keys: Map<number, KeyAccumulator>;
};

type DayFileEntry = {
  readonly date: string;
  readonly path: string;
  readonly gzip: boolean;
};

export async function readKeyTraceSyncData(options?: {
  readonly eventsDir?: string;
  readonly sinceTs?: number;
}): Promise<KeyTraceSyncData> {
  const eventsDir =
    options?.eventsDir ??
    (process.env.KEYTRACE_EVENTS_DIR || join(homedir(), ".keytrace", "events"));
  const sinceTs =
    typeof options?.sinceTs === "number" &&
    Number.isFinite(options.sinceTs) &&
    options.sinceTs > 0
      ? options.sinceTs
      : 0;

  const dayGroups = await listDayFiles(eventsDir);
  if (dayGroups.length === 0) {
    return { records: [], latestTs: 0, daysScanned: 0 };
  }

  const buckets = new Map<string, DayBucket>();
  let currentSessionKey: string | null = null;
  let kdBuffer: KdEvent[] = [];

  for (const { date, files } of dayGroups) {
    const dayEvents: RawEvent[] = [];
    for (const file of files) {
      const parsed = await readEventsFile(file);
      for (const ev of parsed) {
        dayEvents.push(ev);
      }
    }
    if (dayEvents.length === 0) {
      continue;
    }

    dayEvents.sort(compareEvents);

    for (const event of dayEvents) {
      const sessionKey = getSessionKey(event);
      if (sessionKey != null && sessionKey !== currentSessionKey) {
        currentSessionKey = sessionKey;
        kdBuffer = [];
      }

      if (event.ev === "kd") {
        const sc = event.sc;
        const vk = event.vk;
        const mods =
          typeof event.mods === "number" && Number.isFinite(event.mods)
            ? event.mods
            : 0;
        if (
          typeof sc === "number" &&
          sc > 0 &&
          typeof vk === "number" &&
          Number.isFinite(vk) &&
          (mods & 0b1110) === 0 &&
          !MODIFIER_VK_SET.has(vk)
        ) {
          kdBuffer.push({ vk, mono: event.mono });
          if (kdBuffer.length > KD_BUFFER_LIMIT) {
            kdBuffer.shift();
          }
        }
        continue;
      }

      if (event.ev !== "commit") {
        continue;
      }

      const keys =
        typeof event.keys === "number" && Number.isFinite(event.keys)
          ? Math.floor(event.keys)
          : 0;
      if (keys <= 0) {
        continue;
      }

      const take = Math.min(keys, kdBuffer.length);
      const slice =
        take > 0 ? kdBuffer.splice(kdBuffer.length - take, take) : [];

      if (event.ts <= sinceTs || slice.length === 0) {
        continue;
      }

      if (typeof event.text !== "string") {
        continue;
      }

      const cleanText = event.text.replace(PUA_RE, "");
      const printableCount = countPrintable(cleanText);
      if (printableCount === 0 || printableCount > keys) {
        continue;
      }

      const layoutId = detectLayoutId(cleanText);
      if (layoutId == null) {
        continue;
      }

      accumulateCommit(buckets, date, layoutId, event.ts, slice);
    }
  }

  const records: ResultJson[] = [];
  let latestTs = 0;

  for (const bucket of buckets.values()) {
    const samples: Sample[] = [];
    for (const [codePoint, stat] of bucket.keys) {
      samples.push({
        codePoint,
        hitCount: stat.hitCount,
        missCount: stat.missCount,
        timeToType: computeMedianIki(stat.ikiSamples),
      });
    }
    const result = new Result(
      Layout.ALL.get(bucket.layoutId),
      TextType.GENERATED,
      bucket.lastTs,
      bucket.length,
      Math.max(1000, Math.round(bucket.activeMs)),
      bucket.errors,
      new Histogram(samples),
    );
    if (result.validate()) {
      records.push(resultToJson(result));
      if (bucket.lastTs > latestTs) {
        latestTs = bucket.lastTs;
      }
    }
  }

  records.sort((a, b) => a.ts - b.ts);

  return {
    records,
    latestTs,
    daysScanned: dayGroups.length,
  };
}

async function listDayFiles(
  eventsDir: string,
): Promise<
  readonly { readonly date: string; readonly files: DayFileEntry[] }[]
> {
  let entries;
  try {
    entries = await readdir(eventsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const matched: DayFileEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    const match = DAY_FILE_RE.exec(entry.name);
    if (match != null) {
      matched.push({
        date: match[1],
        path: join(eventsDir, entry.name),
        gzip: match[2] != null,
      });
    }
  }

  matched.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return Number(b.gzip) - Number(a.gzip);
  });

  const groups: { date: string; files: DayFileEntry[] }[] = [];
  for (const file of matched) {
    const last = groups[groups.length - 1];
    if (last != null && last.date === file.date) {
      last.files.push(file);
    } else {
      groups.push({ date: file.date, files: [file] });
    }
  }
  return groups;
}

async function readEventsFile(file: DayFileEntry): Promise<RawEvent[]> {
  let content: string;
  try {
    if (file.gzip) {
      const compressed = await readFile(file.path);
      content = gunzipSync(compressed).toString("utf8");
    } else {
      content = await readFile(file.path, "utf8");
    }
  } catch {
    return [];
  }

  const events: RawEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isValidRawEvent(parsed)) {
      events.push(parsed);
    }
  }
  return events;
}

function isValidRawEvent(value: unknown): value is RawEvent {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    obj.v === 1 &&
    typeof obj.ts === "number" &&
    Number.isFinite(obj.ts) &&
    typeof obj.mono === "number" &&
    Number.isFinite(obj.mono) &&
    typeof obj.ev === "string" &&
    obj.ev.length > 0
  );
}

function compareEvents(a: RawEvent, b: RawEvent): number {
  const aStart =
    typeof a.sessionStartTs === "number" && Number.isFinite(a.sessionStartTs)
      ? a.sessionStartTs
      : 0;
  const bStart =
    typeof b.sessionStartTs === "number" && Number.isFinite(b.sessionStartTs)
      ? b.sessionStartTs
      : 0;
  if (aStart !== bStart) {
    return aStart - bStart;
  }
  if (a.sid !== b.sid) {
    if (typeof a.sid === "number" && typeof b.sid === "number") {
      return a.sid - b.sid;
    }
    const aSid = a.sid == null ? "" : String(a.sid);
    const bSid = b.sid == null ? "" : String(b.sid);
    if (aSid !== bSid) {
      return aSid < bSid ? -1 : 1;
    }
  }
  if (a.mono !== b.mono) {
    return a.mono - b.mono;
  }
  return a.ts - b.ts;
}

function getSessionKey(event: RawEvent): string | null {
  if (event.sid == null && event.sessionStartTs == null) {
    return null;
  }
  const start =
    typeof event.sessionStartTs === "number" &&
    Number.isFinite(event.sessionStartTs)
      ? event.sessionStartTs
      : 0;
  const sid = event.sid == null ? "" : String(event.sid);
  return `${start}\0${sid}`;
}

function countPrintable(text: string): number {
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp != null && cp > 0x1f && cp !== 0x7f) {
      count += 1;
    }
  }
  return count;
}

function detectLayoutId(cleanText: string): "zh-sp" | "en-us" | null {
  if (CJK_RE.test(cleanText)) {
    return "zh-sp";
  }
  if (ALNUM_RE.test(cleanText)) {
    return "en-us";
  }
  return null;
}

function toEligibleCodePoint(
  vk: number,
  layoutId: "zh-sp" | "en-us",
): number | null {
  if (vk >= 65 && vk <= 90) {
    return 97 + (vk - 65);
  }
  if (layoutId === "en-us" && vk >= 48 && vk <= 57) {
    return vk;
  }
  return null;
}

function accumulateCommit(
  buckets: Map<string, DayBucket>,
  day: string,
  layoutId: "zh-sp" | "en-us",
  ts: number,
  slice: readonly KdEvent[],
): void {
  const bucketKey = `${day}:${layoutId}`;
  let bucket = buckets.get(bucketKey);
  if (bucket == null) {
    bucket = {
      day,
      layoutId,
      lastTs: ts,
      length: 0,
      errors: 0,
      activeMs: 0,
      keys: new Map(),
    };
    buckets.set(bucketKey, bucket);
  } else if (ts > bucket.lastTs) {
    bucket.lastTs = ts;
  }

  let prevEvent: KdEvent | null = null;
  for (const kd of slice) {
    if (kd.vk === 8) {
      if (prevEvent != null) {
        const prevCp = toEligibleCodePoint(prevEvent.vk, layoutId);
        if (prevCp != null) {
          const prevStat = getOrCreateKeyStat(bucket, prevCp);
          prevStat.missCount += 1;
          bucket.errors += 1;
        }
      }
      prevEvent = kd;
      continue;
    }

    const cp = toEligibleCodePoint(kd.vk, layoutId);
    if (cp == null) {
      prevEvent = kd;
      continue;
    }

    const stat = getOrCreateKeyStat(bucket, cp);
    stat.hitCount += 1;
    bucket.length += 1;

    const prevCp =
      prevEvent != null ? toEligibleCodePoint(prevEvent.vk, layoutId) : null;
    const monoDiff =
      prevEvent != null && prevCp != null ? kd.mono - prevEvent.mono : 0;
    if (prevCp != null && monoDiff > 0 && monoDiff <= MAX_IKI_MS) {
      stat.ikiSamples.push(monoDiff);
      bucket.activeMs += monoDiff;
    } else {
      bucket.activeMs += FALLBACK_KEY_MS;
    }

    prevEvent = kd;
  }
}

function getOrCreateKeyStat(
  bucket: DayBucket,
  codePoint: number,
): KeyAccumulator {
  let stat = bucket.keys.get(codePoint);
  if (stat == null) {
    stat = { hitCount: 0, missCount: 0, ikiSamples: [] };
    bucket.keys.set(codePoint, stat);
  }
  return stat;
}

function computeMedianIki(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return Math.min(
    MAX_TIME_TO_TYPE,
    Math.max(MIN_TIME_TO_TYPE, Math.round(raw)),
  );
}
