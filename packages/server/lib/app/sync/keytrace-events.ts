import { readdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
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

const SYNC_VERSION = 4;
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

export type KeyTraceEnabledMode = "auto" | "true" | "false";

export type KeyTraceSyncData = {
  readonly available: boolean;
  readonly syncVersion: number;
  readonly records: ResultJson[];
  readonly latestTs: number;
  readonly daysScanned: number;
  readonly commitKeys?: readonly string[];
};

export type KeyTraceSummaryBucket = {
  readonly totalKeys: number;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly hits: number;
  readonly errors: number;
  readonly corrections: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly activeMs: number;
  readonly commits: number;
};

export type KeyTraceDailyEntry = {
  readonly day: string;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly totalKeys: number;
  readonly errors: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly activeMs: number;
};

export type KeyTraceAppEntry = {
  readonly exe: string;
  readonly totalKeys: number;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly errors: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly lastTs: number;
};

export type KeyTraceWeakKey = {
  readonly letter: string;
  readonly codePoint: number;
  readonly hits: number;
  readonly misses: number;
  readonly errorRate: number;
  readonly medianIkiMs: number;
  readonly wpm: number;
  readonly samples: number;
};

export type KeyTraceLayoutId =
  "zh-sp" | "zh-sp-zrm" | "zh-sp-ms" | "zh-sp-sg" | "zh-qp" | "en-us";

export type ZhKeyTraceLayoutId = Exclude<KeyTraceLayoutId, "en-us">;

export type KeyTraceCorrectionItem = {
  readonly ts: number;
  readonly exe: string;
  readonly layoutId: KeyTraceLayoutId;
  readonly wrongChar: string;
  readonly rightChar: string;
  readonly contextText: string;
};

export type KeyTraceCommitItem = {
  readonly ts: number;
  readonly exe: string;
  readonly layoutId: KeyTraceLayoutId;
  readonly text: string;
  readonly keys: number;
};

export type KeyTraceDashboardData = {
  readonly status: {
    readonly available: boolean;
    readonly active: boolean;
    readonly lastEventTs: number | null;
    readonly todayDate: string;
    readonly todayBytes: number;
    readonly daysAvailable: number;
    readonly imeName: string | null;
  };
  readonly today: KeyTraceSummaryBucket;
  readonly overall: KeyTraceSummaryBucket;
  readonly daily: readonly KeyTraceDailyEntry[];
  readonly apps: readonly KeyTraceAppEntry[];
  readonly weakKeys: {
    readonly "zh-sp": readonly KeyTraceWeakKey[];
    readonly "zh-sp-zrm": readonly KeyTraceWeakKey[];
    readonly "zh-sp-ms": readonly KeyTraceWeakKey[];
    readonly "zh-sp-sg": readonly KeyTraceWeakKey[];
    readonly "zh-qp": readonly KeyTraceWeakKey[];
    readonly "en-us": readonly KeyTraceWeakKey[];
  };
  readonly recentCorrections: readonly KeyTraceCorrectionItem[];
  readonly recentCommits: readonly KeyTraceCommitItem[];
};

type RawEvent = {
  readonly v: 1;
  readonly ts: number;
  readonly mono: number;
  readonly ev: string;
  readonly exe?: string;
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
  readonly layoutId: KeyTraceLayoutId;
  lastTs: number;
  length: number;
  errors: number;
  activeMs: number;
  readonly keys: Map<number, KeyAccumulator>;
};

type ImeTimelineEntry = {
  readonly ts: number;
  readonly mono: number;
  readonly order: number;
  readonly ime: string;
};

type DayFileEntry = {
  readonly date: string;
  readonly path: string;
  readonly gzip: boolean;
};

export function resolveZhLayoutFromIme(
  ime: string | null | undefined,
): ZhKeyTraceLayoutId {
  if (typeof ime !== "string") {
    return "zh-sp";
  }
  const normalized = ime.trim().toLowerCase();
  if (
    normalized === "full-pinyin" ||
    normalized.startsWith("full-pinyin/") ||
    normalized.includes("quanpin")
  ) {
    return "zh-qp";
  }
  if (
    normalized.includes("ziranma") ||
    normalized.includes("zrm") ||
    normalized === "shuangpin/scheme-3"
  ) {
    return "zh-sp-zrm";
  }
  if (
    normalized.includes("microsoft") ||
    normalized.includes("mspy") ||
    normalized === "shuangpin/scheme-0"
  ) {
    return "zh-sp-ms";
  }
  if (normalized.includes("sogou")) {
    return "zh-sp-sg";
  }
  return "zh-sp";
}

function isZhKeyTraceLayout(layoutId: KeyTraceLayoutId): boolean {
  return layoutId !== "en-us";
}

function extractImeFromMeta(event: RawEvent): string | null {
  if (event.ev !== "meta" || typeof event.text !== "string") {
    return null;
  }
  const match = event.text.match(/^ime=(.+)$/);
  if (match == null) {
    return null;
  }
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

function collectImeMetaEvents(
  events: readonly RawEvent[],
  timeline: ImeTimelineEntry[],
): void {
  let added = false;
  for (const event of events) {
    const ime = extractImeFromMeta(event);
    if (ime != null) {
      timeline.push({
        ts: event.ts,
        mono: event.mono,
        order: timeline.length,
        ime,
      });
      added = true;
    }
  }
  if (added && timeline.length > 1) {
    timeline.sort(
      (a, b) => a.ts - b.ts || a.mono - b.mono || a.order - b.order,
    );
  }
}

function findActiveIme(
  timeline: readonly ImeTimelineEntry[],
  ts: number,
  mono: number,
): string | null {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const entry = timeline[i];
    if (entry.ts < ts || (entry.ts === ts && entry.mono <= mono)) {
      return entry.ime;
    }
  }
  return null;
}

export function getKeyTraceEnabledMode(
  raw: string | undefined = process.env.KEYTRACE_ENABLED,
): KeyTraceEnabledMode {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "false") {
    return "false";
  }
  if (normalized === "true") {
    return "true";
  }
  return "auto";
}

export function isKeyTraceEnabled(): boolean {
  return getKeyTraceEnabledMode() !== "false";
}

function resolveEventsDir(eventsDir?: string): string {
  return (
    eventsDir ??
    (process.env.KEYTRACE_EVENTS_DIR || join(homedir(), ".keytrace", "events"))
  );
}

export function isKeyTraceAvailable(options?: {
  readonly eventsDir?: string;
}): boolean {
  const mode = getKeyTraceEnabledMode();
  if (mode === "false") {
    return false;
  }
  const eventsDir = resolveEventsDir(options?.eventsDir);
  let entries;
  try {
    entries = readdirSync(eventsDir, { withFileTypes: true });
  } catch {
    return false;
  }
  if (mode === "true") {
    return true;
  }
  return entries.some(
    (entry) =>
      (entry.isFile() || entry.isSymbolicLink()) &&
      DAY_FILE_RE.test(entry.name),
  );
}

export function emptyKeyTraceSyncData(options?: {
  readonly available?: boolean;
  readonly includeCommitKeys?: boolean;
}): KeyTraceSyncData {
  return {
    available: options?.available ?? false,
    syncVersion: SYNC_VERSION,
    records: [],
    latestTs: 0,
    daysScanned: 0,
    ...(options?.includeCommitKeys ? { commitKeys: [] } : {}),
  };
}

export async function readKeyTraceSyncData(options?: {
  readonly eventsDir?: string;
  readonly sinceTs?: number;
  readonly includeCommitKeys?: boolean;
}): Promise<KeyTraceSyncData> {
  const includeCommitKeys = options?.includeCommitKeys === true;
  const mode = getKeyTraceEnabledMode();
  if (mode === "false") {
    return emptyKeyTraceSyncData({
      available: false,
      includeCommitKeys,
    });
  }

  const eventsDir = resolveEventsDir(options?.eventsDir);
  const sinceTs =
    typeof options?.sinceTs === "number" &&
    Number.isFinite(options.sinceTs) &&
    options.sinceTs > 0
      ? options.sinceTs
      : 0;

  const { readable, dayGroups } = await scanDayFiles(eventsDir);
  const available = mode === "true" ? readable : dayGroups.length > 0;
  if (dayGroups.length === 0) {
    return emptyKeyTraceSyncData({
      available,
      includeCommitKeys,
    });
  }

  const buckets = new Map<string, DayBucket>();
  const carryBySessionBucket = new Map<string, CommitCarryState>();
  const commitKeys = includeCommitKeys ? new Set<string>() : null;
  const imeTimeline: ImeTimelineEntry[] = [];
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

    collectImeMetaEvents(dayEvents, imeTimeline);
    dayEvents.sort(compareEvents);

    for (const event of dayEvents) {
      if (event.ev === "meta") {
        continue;
      }

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

      const zhLayoutId = resolveZhLayoutFromIme(
        findActiveIme(imeTimeline, event.ts, event.mono),
      );
      const layoutId = detectLayoutId(cleanText, zhLayoutId);
      if (layoutId == null) {
        continue;
      }
      if (commitKeys != null) {
        commitKeys.add(`${layoutId}:${Math.round(event.ts / 1000)}`);
        commitKeys.add(`${layoutId}:${Math.floor(event.ts / 1000)}`);
      }

      if (event.ts <= sinceTs) {
        const lastKd = slice[slice.length - 1];
        if (lastKd != null) {
          carryBySessionBucket.set(
            `${currentSessionKey ?? ""}\0${date}:${layoutId}`,
            {
              lastMono: lastKd.mono,
              endedWithBs: lastKd.vk === 8,
            },
          );
        }
        continue;
      }

      accumulateCommit(
        buckets,
        date,
        layoutId,
        event.ts,
        slice,
        undefined,
        currentSessionKey,
        carryBySessionBucket,
      );
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
      TextType.KEYTRACE,
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
    available: true,
    syncVersion: SYNC_VERSION,
    records,
    latestTs,
    daysScanned: dayGroups.length,
    ...(commitKeys != null ? { commitKeys: [...commitKeys].sort() } : {}),
  };
}

async function scanDayFiles(eventsDir: string): Promise<{
  readonly readable: boolean;
  readonly dayGroups: readonly {
    readonly date: string;
    readonly files: DayFileEntry[];
  }[];
}> {
  let entries;
  try {
    entries = await readdir(eventsDir, { withFileTypes: true });
  } catch {
    return { readable: false, dayGroups: [] };
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
  return { readable: true, dayGroups: groups };
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

type CommitCarryState = {
  readonly lastMono: number;
  readonly endedWithBs: boolean;
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

function detectLayoutId(
  cleanText: string,
  zhLayoutId: ZhKeyTraceLayoutId,
): KeyTraceLayoutId | null {
  if (CJK_RE.test(cleanText)) {
    return zhLayoutId;
  }
  if (ALNUM_RE.test(cleanText) && !isLeakedPinyin(cleanText)) {
    return "en-us";
  }
  return null;
}

function toEligibleCodePoint(
  vk: number,
  layoutId: KeyTraceLayoutId,
): number | null {
  if (vk >= 65 && vk <= 90) {
    return 97 + (vk - 65);
  }
  if ((layoutId === "zh-sp-ms" || layoutId === "zh-sp-sg") && vk === 186) {
    return 0x003b;
  }
  if (layoutId === "en-us" && vk >= 48 && vk <= 57) {
    return vk;
  }
  return null;
}

function accumulateCommit(
  buckets: Map<string, DayBucket>,
  day: string,
  layoutId: KeyTraceLayoutId,
  ts: number,
  slice: readonly KdEvent[],
  onCorrection?: (wrongCp: number | null, rightCp: number) => void,
  sessionKey?: string | null,
  carryBySessionBucket?: Map<string, CommitCarryState>,
): void {
  const bucketKey = `${day}:${layoutId}`;
  const carryKey = `${sessionKey ?? ""}\0${bucketKey}`;
  const prevCarry = carryBySessionBucket?.get(carryKey);
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
  let lastMono: number | null = prevCarry?.lastMono ?? null;
  let wordAnchorMono: number | null = null;
  let bsRun = 0;
  let corrActive = false;
  let corrAnchorMono: number | null = null;
  let lastPoppedCp: number | null = null;
  let afterResetBs = prevCarry?.endedWithBs ?? false;

  const abortPendingCorrection = (): void => {
    if (corrActive) {
      bucket.errors += 1;
      corrActive = false;
    }
    corrAnchorMono = null;
    lastPoppedCp = null;
  };

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
        bucket.activeMs += entry.iki;
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
        abortPendingCorrection();
        wordAnchorMono = null;
        afterResetBs = true;
        lastMono = kd.mono;
        continue;
      }

      flushStack();
      bsRun = 0;
      abortPendingCorrection();
      wordAnchorMono = null;
      afterResetBs = false;
      lastMono = kd.mono;

      const cp = toEligibleCodePoint(kd.vk, layoutId);
      if (cp != null) {
        stack.push({ cp, mono: kd.mono, iki: null, isCorrected: false });
      }
      continue;
    }

    if (kd.vk === 8) {
      bsRun += 1;
      if (bsRun > MAX_TYPO_BS_RUN) {
        if (stack.length > 0) {
          stack.pop();
        }
        abortPendingCorrection();
        afterResetBs = true;
      } else if (stack.length > 0) {
        const popped = stack.pop()!;
        corrAnchorMono =
          stack.length > 0
            ? stack[stack.length - 1].mono
            : (wordAnchorMono ?? popped.mono);
        lastPoppedCp = popped.cp;
        corrActive = true;
        afterResetBs = false;
      } else {
        if (bsRun === 1 && !corrActive && lastMono != null) {
          bucket.errors += 1;
        }
        abortPendingCorrection();
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
      abortPendingCorrection();
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
      onCorrection?.(lastPoppedCp, cp);
      stack.push({ cp, mono: kd.mono, iki, isCorrected: true });
      corrActive = false;
      corrAnchorMono = null;
      lastPoppedCp = null;
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
  abortPendingCorrection();
  if (carryBySessionBucket != null && lastMono != null) {
    const lastKd = slice[slice.length - 1];
    carryBySessionBucket.set(carryKey, {
      lastMono,
      endedWithBs: lastKd != null ? lastKd.vk === 8 : afterResetBs,
    });
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

const IGNORED_DISPLAY_EXES = new Set(["lockapp.exe"]);

function formatLocalDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sanitizeDisplayText(raw: string): string | null {
  const cleaned = raw
    .replace(PUA_RE, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    cleaned.length === 0 ||
    cleaned.includes("\ufffd") ||
    /^(?:https?|chrome-error|file|edge):\/\//i.test(cleaned)
  ) {
    return null;
  }
  const masked = cleaned.replace(/\d{6,}/g, "***");
  return masked.length > 48 ? `${masked.slice(0, 48)}…` : masked;
}

function emptySummaryBucket(): KeyTraceSummaryBucket {
  return {
    totalKeys: 0,
    zhKeys: 0,
    enKeys: 0,
    hits: 0,
    errors: 0,
    corrections: 0,
    accuracy: 1,
    avgWpm: 0,
    activeMs: 0,
    commits: 0,
  };
}

function calcWpm(keys: number, activeMs: number): number {
  if (keys <= 0 || activeMs <= 0) {
    return 0;
  }
  return Math.round((keys / 5 / (activeMs / 60000)) * 10) / 10;
}

type MutableSummary = {
  totalKeys: number;
  zhKeys: number;
  enKeys: number;
  errors: number;
  corrections: number;
  activeMs: number;
  commits: number;
};

function freezeSummary(s: MutableSummary): KeyTraceSummaryBucket {
  const hits = Math.max(0, s.totalKeys - s.errors);
  return {
    totalKeys: s.totalKeys,
    zhKeys: s.zhKeys,
    enKeys: s.enKeys,
    hits,
    errors: s.errors,
    corrections: s.corrections,
    accuracy: s.totalKeys > 0 ? hits / s.totalKeys : 1,
    avgWpm: calcWpm(s.totalKeys, s.activeMs),
    activeMs: s.activeMs,
    commits: s.commits,
  };
}

function mergeBucketsToSummary(
  list: readonly DayBucket[],
  commits: number,
  corrections: number,
): KeyTraceSummaryBucket {
  const acc: MutableSummary = {
    totalKeys: 0,
    zhKeys: 0,
    enKeys: 0,
    errors: 0,
    corrections,
    activeMs: 0,
    commits,
  };
  for (const b of list) {
    acc.totalKeys += b.length;
    if (isZhKeyTraceLayout(b.layoutId)) {
      acc.zhKeys += b.length;
    } else {
      acc.enKeys += b.length;
    }
    acc.errors += b.errors;
    acc.activeMs += b.activeMs;
  }
  return freezeSummary(acc);
}

function buildWeakKeys(
  buckets: Iterable<DayBucket>,
  layoutId: KeyTraceLayoutId,
): KeyTraceWeakKey[] {
  const merged = new Map<number, KeyAccumulator>();
  for (const b of buckets) {
    if (b.layoutId !== layoutId) {
      continue;
    }
    for (const [cp, stat] of b.keys) {
      let target = merged.get(cp);
      if (target == null) {
        target = { hitCount: 0, missCount: 0, ikiSamples: [] };
        merged.set(cp, target);
      }
      target.hitCount += stat.hitCount;
      target.missCount += stat.missCount;
      for (const s of stat.ikiSamples) {
        target.ikiSamples.push(s);
      }
    }
  }
  const out: KeyTraceWeakKey[] = [];
  for (const [cp, stat] of merged) {
    if (stat.hitCount <= 0) {
      continue;
    }
    const medianIkiMs = computeMedianIki(stat.ikiSamples);
    const wpm =
      medianIkiMs > 0 ? Math.round((12000 / medianIkiMs) * 10) / 10 : 0;
    out.push({
      letter: String.fromCodePoint(cp).toUpperCase(),
      codePoint: cp,
      hits: stat.hitCount,
      misses: stat.missCount,
      errorRate: stat.missCount / stat.hitCount,
      medianIkiMs,
      wpm,
      samples: stat.ikiSamples.length,
    });
  }
  out.sort((a, b) => {
    if (b.errorRate !== a.errorRate) {
      return b.errorRate - a.errorRate;
    }
    return b.medianIkiMs - a.medianIkiMs;
  });
  return out;
}

export function emptyKeyTraceDashboardData(options?: {
  readonly available?: boolean;
  readonly todayDate?: string;
}): KeyTraceDashboardData {
  return {
    status: {
      available: options?.available ?? false,
      active: false,
      lastEventTs: null,
      todayDate: options?.todayDate ?? formatLocalDay(),
      todayBytes: 0,
      daysAvailable: 0,
      imeName: null,
    },
    today: emptySummaryBucket(),
    overall: emptySummaryBucket(),
    daily: [],
    apps: [],
    weakKeys: {
      "zh-sp": [],
      "zh-sp-zrm": [],
      "zh-sp-ms": [],
      "zh-sp-sg": [],
      "zh-qp": [],
      "en-us": [],
    },
    recentCorrections: [],
    recentCommits: [],
  };
}

export async function readKeyTraceDashboard(options?: {
  readonly eventsDir?: string;
  readonly days?: number;
}): Promise<KeyTraceDashboardData> {
  const todayDate = formatLocalDay();
  const mode = getKeyTraceEnabledMode();
  if (mode === "false") {
    return emptyKeyTraceDashboardData({ available: false, todayDate });
  }

  const eventsDir = resolveEventsDir(options?.eventsDir);
  const daysLimit =
    typeof options?.days === "number" && options.days > 0
      ? Math.floor(options.days)
      : 14;

  const { readable, dayGroups } = await scanDayFiles(eventsDir);
  const available = mode === "true" ? readable : dayGroups.length > 0;
  if (dayGroups.length === 0) {
    return emptyKeyTraceDashboardData({ available, todayDate });
  }

  let todayBytes = 0;
  const todayGroup = dayGroups.find((g) => g.date === todayDate);
  if (todayGroup != null) {
    for (const f of todayGroup.files) {
      try {
        const info = await stat(f.path);
        todayBytes += info.size;
      } catch {
        // Ignore stat error.
      }
    }
  }

  const buckets = new Map<string, DayBucket>();
  const carryBySessionBucket = new Map<string, CommitCarryState>();
  const commitsByDay = new Map<string, number>();
  const correctionsByDay = new Map<string, number>();
  const appMap = new Map<
    string,
    {
      exe: string;
      totalKeys: number;
      zhKeys: number;
      enKeys: number;
      errors: number;
      activeMs: number;
      lastTs: number;
    }
  >();
  const recentCorrections: KeyTraceCorrectionItem[] = [];
  const recentCommits: KeyTraceCommitItem[] = [];

  let currentSessionKey: string | null = null;
  let kdBuffer: KdEvent[] = [];
  let lastEventTs: number | null = null;
  const imeTimeline: ImeTimelineEntry[] = [];

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
    collectImeMetaEvents(dayEvents, imeTimeline);
    dayEvents.sort(compareEvents);

    for (const event of dayEvents) {
      if (
        typeof event.ts === "number" &&
        Number.isFinite(event.ts) &&
        (lastEventTs == null || event.ts > lastEventTs)
      ) {
        lastEventTs = event.ts;
      }

      if (event.ev === "meta") {
        continue;
      }

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

      const zhLayoutId = resolveZhLayoutFromIme(
        findActiveIme(imeTimeline, event.ts, event.mono),
      );
      const layoutId = detectLayoutId(cleanText, zhLayoutId);
      if (layoutId == null) {
        continue;
      }

      const exeRaw =
        typeof event.exe === "string" && event.exe.trim() !== ""
          ? event.exe.trim()
          : "unknown";
      if (IGNORED_DISPLAY_EXES.has(exeRaw.toLowerCase())) {
        continue;
      }

      const prevBucketLen = buckets.get(`${date}:${layoutId}`)?.length ?? 0;
      const prevBucketErr = buckets.get(`${date}:${layoutId}`)?.errors ?? 0;
      const prevBucketActive =
        buckets.get(`${date}:${layoutId}`)?.activeMs ?? 0;

      const displayText = sanitizeDisplayText(cleanText);
      let dayCorr = 0;

      accumulateCommit(
        buckets,
        date,
        layoutId,
        event.ts,
        slice,
        (wrongCp, rightCp) => {
          dayCorr += 1;
          if (wrongCp != null && displayText != null) {
            recentCorrections.push({
              ts: event.ts,
              exe: exeRaw,
              layoutId,
              wrongChar: String.fromCodePoint(wrongCp),
              rightChar: String.fromCodePoint(rightCp),
              contextText: displayText,
            });
            if (recentCorrections.length > 60) {
              recentCorrections.shift();
            }
          }
        },
        currentSessionKey,
        carryBySessionBucket,
      );

      commitsByDay.set(date, (commitsByDay.get(date) ?? 0) + 1);
      if (dayCorr > 0) {
        correctionsByDay.set(date, (correctionsByDay.get(date) ?? 0) + dayCorr);
      }

      const afterBucket = buckets.get(`${date}:${layoutId}`);
      const deltaKeys = (afterBucket?.length ?? 0) - prevBucketLen;
      const deltaErr = (afterBucket?.errors ?? 0) - prevBucketErr;
      const deltaActive = (afterBucket?.activeMs ?? 0) - prevBucketActive;

      if (deltaKeys > 0) {
        let app = appMap.get(exeRaw);
        if (app == null) {
          app = {
            exe: exeRaw,
            totalKeys: 0,
            zhKeys: 0,
            enKeys: 0,
            errors: 0,
            activeMs: 0,
            lastTs: event.ts,
          };
          appMap.set(exeRaw, app);
        }
        app.totalKeys += deltaKeys;
        if (isZhKeyTraceLayout(layoutId)) {
          app.zhKeys += deltaKeys;
        } else {
          app.enKeys += deltaKeys;
        }
        app.errors += deltaErr;
        app.activeMs += deltaActive;
        if (event.ts > app.lastTs) {
          app.lastTs = event.ts;
        }
      }

      if (displayText != null && deltaKeys > 0) {
        recentCommits.push({
          ts: event.ts,
          exe: exeRaw,
          layoutId,
          text: displayText,
          keys: deltaKeys,
        });
        if (recentCommits.length > 40) {
          recentCommits.shift();
        }
      }
    }
  }

  const allBuckets = [...buckets.values()];
  const todayBuckets = allBuckets.filter((b) => b.day === todayDate);
  const totalCommits = [...commitsByDay.values()].reduce((a, b) => a + b, 0);
  const totalCorrections = [...correctionsByDay.values()].reduce(
    (a, b) => a + b,
    0,
  );

  const dayKeys = [...new Set(allBuckets.map((b) => b.day))].sort();
  const daily: KeyTraceDailyEntry[] = dayKeys.slice(-daysLimit).map((day) => {
    const sum = mergeBucketsToSummary(
      allBuckets.filter((b) => b.day === day),
      commitsByDay.get(day) ?? 0,
      correctionsByDay.get(day) ?? 0,
    );
    return {
      day,
      zhKeys: sum.zhKeys,
      enKeys: sum.enKeys,
      totalKeys: sum.totalKeys,
      errors: sum.errors,
      accuracy: sum.accuracy,
      avgWpm: sum.avgWpm,
      activeMs: sum.activeMs,
    };
  });

  const apps: KeyTraceAppEntry[] = [...appMap.values()]
    .sort((a, b) => b.totalKeys - a.totalKeys)
    .slice(0, 8)
    .map((a) => ({
      exe: a.exe,
      totalKeys: a.totalKeys,
      zhKeys: a.zhKeys,
      enKeys: a.enKeys,
      errors: a.errors,
      accuracy:
        a.totalKeys > 0 ? Math.max(0, a.totalKeys - a.errors) / a.totalKeys : 1,
      avgWpm: calcWpm(a.totalKeys, a.activeMs),
      lastTs: a.lastTs,
    }));

  const now = Date.now();
  const active =
    todayBytes > 0 &&
    lastEventTs != null &&
    now - lastEventTs <= 15 * 60 * 1000;

  const imeName =
    imeTimeline.length > 0 ? imeTimeline[imeTimeline.length - 1].ime : null;

  return {
    status: {
      available: true,
      active,
      lastEventTs,
      todayDate,
      todayBytes,
      daysAvailable: dayGroups.length,
      imeName,
    },
    today: mergeBucketsToSummary(
      todayBuckets,
      commitsByDay.get(todayDate) ?? 0,
      correctionsByDay.get(todayDate) ?? 0,
    ),
    overall: mergeBucketsToSummary(allBuckets, totalCommits, totalCorrections),
    daily,
    apps,
    weakKeys: {
      "zh-sp": buildWeakKeys(allBuckets, "zh-sp"),
      "zh-sp-zrm": buildWeakKeys(allBuckets, "zh-sp-zrm"),
      "zh-sp-ms": buildWeakKeys(allBuckets, "zh-sp-ms"),
      "zh-sp-sg": buildWeakKeys(allBuckets, "zh-sp-sg"),
      "zh-qp": buildWeakKeys(allBuckets, "zh-qp"),
      "en-us": buildWeakKeys(allBuckets, "en-us"),
    },
    recentCorrections: recentCorrections.slice(-20).reverse(),
    recentCommits: recentCommits.slice(-15).reverse(),
  };
}
