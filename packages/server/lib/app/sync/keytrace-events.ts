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
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const CJK_RE = /[\u3400-\u9fff]/;
const ALNUM_RE = /[a-zA-Z0-9]/;
const INTERNAL_APOS_TOKEN_RE = /[a-z]+(?:'[a-z]+)+/gi;
const ENGLISH_CONTRACTION_SUFFIX_RE = /^(?:s|t|m|d|re|ve|ll)$/i;

const SYNC_VERSION = 2;
const KD_BUFFER_LIMIT = 60;
const MAX_STEP_GAP_MS = 3000;
const MAX_CORRECTION_MS = 6000;
const MAX_TYPO_BS_RUN = 3;
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
  readonly syncVersion: number;
  readonly records: ResultJson[];
  readonly latestTs: number;
  readonly daysScanned: number;
  readonly commitKeys?: readonly string[];
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
  readonly includeCommitKeys?: boolean;
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
  const includeCommitKeys = options?.includeCommitKeys === true;

  const dayGroups = await listDayFiles(eventsDir);
  if (dayGroups.length === 0) {
    return {
      syncVersion: SYNC_VERSION,
      records: [],
      latestTs: 0,
      daysScanned: 0,
      ...(includeCommitKeys ? { commitKeys: [] } : {}),
    };
  }

  const buckets = new Map<string, DayBucket>();
  const commitKeys = includeCommitKeys ? new Set<string>() : null;
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

      if (slice.length === 0 || typeof event.text !== "string") {
        continue;
      }

      const cleanText = event.text.replace(PUA_RE, "");
      const printableCount = countPrintable(cleanText);
      if (printableCount === 0 || printableCount > keys) {
        continue;
      }

      const legacyLayout = detectLegacyLayoutId(cleanText);
      if (commitKeys != null && legacyLayout != null) {
        commitKeys.add(`${legacyLayout}:${Math.round(event.ts / 1000)}`);
        commitKeys.add(`${legacyLayout}:${Math.floor(event.ts / 1000)}`);
      }

      if (event.ts <= sinceTs) {
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
      Math.round(bucket.activeMs),
      Math.min(bucket.errors, bucket.length),
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
    syncVersion: SYNC_VERSION,
    records,
    latestTs,
    daysScanned: dayGroups.length,
    ...(commitKeys != null ? { commitKeys: [...commitKeys].sort() } : {}),
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

type WordEntry = {
  readonly cp: number;
  readonly mono: number;
  readonly iki: number | null;
  readonly isCorrected: boolean;
};

function isLeakedPinyin(cleanText: string): boolean {
  if (CJK_RE.test(cleanText)) {
    return false;
  }
  const normalized = cleanText.replace(ZERO_WIDTH_RE, "");
  const tokens = normalized.match(INTERNAL_APOS_TOKEN_RE);
  if (tokens == null) {
    return false;
  }
  for (const token of tokens) {
    const parts = token.split("'");
    if (parts.length > 2) {
      return true;
    }
    if (parts.length === 2 && !ENGLISH_CONTRACTION_SUFFIX_RE.test(parts[1])) {
      return true;
    }
  }
  return false;
}

function detectLegacyLayoutId(cleanText: string): "zh-sp" | "en-us" | null {
  if (CJK_RE.test(cleanText)) {
    return "zh-sp";
  }
  if (ALNUM_RE.test(cleanText)) {
    return "en-us";
  }
  return null;
}

function detectLayoutId(cleanText: string): "zh-sp" | "en-us" | null {
  if (CJK_RE.test(cleanText)) {
    return "zh-sp";
  }
  if (ALNUM_RE.test(cleanText) && !isLeakedPinyin(cleanText)) {
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

  let stack: WordEntry[] = [];
  let lastMono: number | null = null;
  let wordAnchorMono: number | null = null;
  let bsRun = 0;
  let corrActive = false;
  let corrAnchorMono: number | null = null;
  let afterResetBs = false;

  const flushStack = (): void => {
    for (const entry of stack) {
      const stat = getOrCreateKeyStat(bucket, entry.cp);
      stat.hitCount += 1;
      bucket.length += 1;
      if (entry.isCorrected) {
        stat.missCount += 1;
        bucket.errors += 1;
      }
      if (entry.iki != null) {
        stat.ikiSamples.push(entry.iki);
      }
    }
    stack = [];
  };

  for (const kd of slice) {
    const stepGap = lastMono != null ? kd.mono - lastMono : null;
    if (stepGap != null && (stepGap <= 0 || stepGap > MAX_STEP_GAP_MS)) {
      if (kd.vk === 8) {
        if (stack.length > 0) {
          stack.pop();
        }
        flushStack();
        bsRun = 1;
        corrActive = false;
        corrAnchorMono = null;
        wordAnchorMono = null;
        afterResetBs = true;
        lastMono = kd.mono;
        continue;
      }

      flushStack();
      bsRun = 0;
      corrActive = false;
      corrAnchorMono = null;
      wordAnchorMono = null;
      afterResetBs = false;
      lastMono = kd.mono;

      const cp = toEligibleCodePoint(kd.vk, layoutId);
      if (cp != null) {
        stack.push({ cp, mono: kd.mono, iki: null, isCorrected: false });
      }
      continue;
    }

    if (stepGap != null) {
      bucket.activeMs += stepGap;
    }

    if (kd.vk === 8) {
      bsRun += 1;
      if (bsRun > MAX_TYPO_BS_RUN) {
        if (stack.length > 0) {
          stack.pop();
        }
        corrActive = false;
        corrAnchorMono = null;
        afterResetBs = true;
      } else if (stack.length > 0) {
        const popped = stack.pop()!;
        corrAnchorMono =
          stack.length > 0
            ? stack[stack.length - 1].mono
            : (wordAnchorMono ?? popped.mono);
        corrActive = true;
        afterResetBs = false;
      } else {
        if (bsRun === 1 && lastMono != null) {
          bucket.errors += 1;
        }
        corrActive = false;
        corrAnchorMono = null;
        afterResetBs = true;
      }
      lastMono = kd.mono;
      continue;
    }

    const cp = toEligibleCodePoint(kd.vk, layoutId);
    if (cp == null) {
      flushStack();
      wordAnchorMono = kd.mono;
      bsRun = 0;
      corrActive = false;
      corrAnchorMono = null;
      afterResetBs = false;
      lastMono = kd.mono;
      continue;
    }

    if (corrActive) {
      const rawCorr = corrAnchorMono != null ? kd.mono - corrAnchorMono : null;
      const iki =
        rawCorr != null && rawCorr > 0
          ? Math.min(rawCorr, MAX_CORRECTION_MS)
          : null;
      stack.push({ cp, mono: kd.mono, iki, isCorrected: true });
      corrActive = false;
      corrAnchorMono = null;
      bsRun = 0;
      afterResetBs = false;
    } else {
      const iki =
        !afterResetBs && stepGap != null && stepGap > 0 ? stepGap : null;
      stack.push({ cp, mono: kd.mono, iki, isCorrected: false });
      bsRun = 0;
      afterResetBs = false;
    }
    lastMono = kd.mono;
  }

  flushStack();
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
