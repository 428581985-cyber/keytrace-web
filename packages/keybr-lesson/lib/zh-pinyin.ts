import {
  encodePinyinSyllable,
  isZhShuangpinSchemeId,
  type ZhSchemeId,
} from "@keybr/keyboard";
import {
  getCachedPinyinProModule,
  loadPinyinProModule,
} from "./zh-pinyin-loader.ts";

export type ZhPinyinEngine = {
  /**
   * Context-disambiguated toneless syllables matching 1:1 with `Array.from(hanziRun)`.
   */
  readonly segmentPinyin: (hanziRun: string) => readonly string[];
  /**
   * All deduplicated toneless Mandarin readings for a single Hanzi character,
   * ordered with most common reading first.
   */
  readonly charReadings: (hanzi: string) => readonly string[];
};

export type ZhPolyphoneOccurrence = {
  readonly index: number;
  readonly hanzi: string;
  readonly contextBefore: string;
  readonly contextAfter: string;
  /** UTF-16 start offset of the Hanzi inside rawContent. */
  readonly rawIndex: number;
  /** UTF-16 length covering the Hanzi plus any inline `(pinyin)` tag. */
  readonly rawLength: number;
  readonly readings: readonly string[];
  readonly autoSelected: string;
  readonly selected: string;
  readonly isPinned: boolean;
};

export type ZhCustomUnit = {
  readonly hanzi: string;
  readonly syllable: string;
  readonly code: string;
  readonly altCodes: readonly string[];
};

export type ZhCustomToken =
  | {
      readonly kind: "word";
      readonly units: readonly ZhCustomUnit[];
      readonly spaceAfter: boolean;
    }
  | {
      readonly kind: "punct";
      readonly punct: "," | "." | "?" | "!";
      readonly hanzi: string;
    };

export type ZhCustomAnalysis = {
  readonly tokens: readonly ZhCustomToken[];
  readonly polyphones: readonly ZhPolyphoneOccurrence[];
  readonly totalHanzi: number;
  readonly wordCount: number;
  readonly keystrokeCount: number;
  readonly skippedCount: number;
  readonly isWordListMode: boolean;
};

type RawHanziItem = {
  readonly hanzi: string;
  readonly rawIndex: number;
  readonly rawLength: number;
  readonly pinned: string | null;
};

type ParsedPiece =
  | {
      readonly kind: "run";
      readonly items: readonly RawHanziItem[];
      readonly followedByExplicitSeparator: boolean;
    }
  | {
      readonly kind: "punct";
      readonly punct: "," | "." | "?" | "!";
      readonly hanzi: string;
    };

const NON_STANDARD_SYLLABLES = new Set(["hm", "hng", "ng", "m", "n", "r"]);
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const ASCII_ALPHA_RE = /^[a-z]+$/;
const INLINE_PIN_RE = /^\(([a-zA-ZüÜvV]{1,6})\)/;

/**
 * Supplement spoken variants when a dictionary omits colloquial readings.
 */
const EXTRA_COMMON_READINGS: Readonly<Record<string, readonly string[]>> = {
  谁: ["shui", "shei"],
  血: ["xue", "xie"],
  熟: ["shu", "shou"],
  露: ["lu", "lou"],
};

const IGNORED_WRAPPER_CHARS = new Set([
  '"',
  "'",
  "“",
  "”",
  "‘",
  "’",
  "《",
  "》",
  "〈",
  "〉",
  "【",
  "】",
  "[",
  "]",
  "（",
  "）",
  "(",
  ")",
  "—",
  "…",
  "·",
  "~",
  "`",
]);

const EXPLICIT_SEPARATORS = new Set([" ", "\t", "\r", "\n", "、", "|", "/"]);

function isHanziChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp == null) {
    return false;
  }
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df)
  );
}

/**
 * Strips tone diacritics, normalizes `ü -> v`, enforces canonical `j/q/x/y + u`
 * and `l/n + v/ve`, and validates against Mandarin Xiaohe Shuangpin tables.
 */
export function normalizeZhSyllable(raw: string): string | null {
  let text = raw
    .trim()
    .toLowerCase()
    .replaceAll("ü", "v")
    .replaceAll("ǖ", "v")
    .replaceAll("ǘ", "v")
    .replaceAll("ǚ", "v")
    .replaceAll("ǜ", "v")
    .replaceAll("ê", "e");
  text = text.normalize("NFD").replaceAll(COMBINING_MARKS_RE, "");
  if (
    text.length === 0 ||
    text.length > 6 ||
    !ASCII_ALPHA_RE.test(text) ||
    NON_STANDARD_SYLLABLES.has(text)
  ) {
    return null;
  }
  if (
    (text[0] === "j" ||
      text[0] === "q" ||
      text[0] === "x" ||
      text[0] === "y") &&
    text.includes("v")
  ) {
    text = text.replaceAll("v", "u");
  }
  if (text === "lue") {
    text = "lve";
  } else if (text === "nue") {
    text = "nve";
  }
  if (encodePinyinSyllable(text, "zh-sp").length !== 2) {
    return null;
  }
  return text;
}

export function encodeZhSyllableForScheme(
  syllable: string,
  scheme: ZhSchemeId,
): string {
  const norm = normalizeZhSyllable(syllable);
  if (norm == null) {
    return "";
  }
  if (isZhShuangpinSchemeId(scheme)) {
    return encodePinyinSyllable(norm, scheme);
  }
  return norm;
}

function createEngineFromModule({
  pinyin,
  polyphonic,
}: NonNullable<ReturnType<typeof getCachedPinyinProModule>>): ZhPinyinEngine {
  return {
    segmentPinyin(hanziRun: string): readonly string[] {
      if (hanziRun.length === 0) {
        return [];
      }
      return pinyin(hanziRun, {
        toneType: "none",
        type: "array",
        v: true,
      });
    },
    charReadings(hanzi: string): readonly string[] {
      const raw = polyphonic(hanzi, {
        toneType: "none",
        type: "array",
        v: true,
      });
      return dedupeNormalizedReadings(raw[0] ?? [], hanzi);
    },
  };
}

export async function loadZhPinyinEngine(): Promise<ZhPinyinEngine> {
  return createEngineFromModule(await loadPinyinProModule());
}

export function getCachedZhPinyinEngine(): ZhPinyinEngine | null {
  const mod = getCachedPinyinProModule();
  return mod != null ? createEngineFromModule(mod) : null;
}

export function createFakeZhPinyinEngine({
  segment = {},
  readings = {},
}: {
  readonly segment?: Readonly<Record<string, readonly string[]>>;
  readonly readings?: Readonly<Record<string, readonly string[]>>;
} = {}): ZhPinyinEngine {
  return {
    segmentPinyin(hanziRun: string): readonly string[] {
      if (Object.hasOwn(segment, hanziRun)) {
        return segment[hanziRun];
      }
      return Array.from(hanziRun, (ch) => readings[ch]?.[0] ?? "");
    },
    charReadings(hanzi: string): readonly string[] {
      const list = readings[hanzi] ?? [];
      return dedupeNormalizedReadings(list, hanzi);
    },
  };
}

export function dedupeNormalizedReadings(
  rawList: readonly string[],
  hanzi?: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const norm = normalizeZhSyllable(raw);
    if (norm != null && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  };
  for (const item of rawList) {
    push(item);
  }
  if (hanzi != null && Object.hasOwn(EXTRA_COMMON_READINGS, hanzi)) {
    for (const extra of EXTRA_COMMON_READINGS[hanzi]) {
      push(extra);
    }
  }
  return out;
}

function mapPunct(
  ch: string,
): { readonly punct: "," | "." | "?" | "!"; readonly hanzi: string } | null {
  switch (ch) {
    case ",":
    case "，":
    case ";":
    case "；":
    case ":":
    case "：":
      return { punct: ",", hanzi: "，" };
    case ".":
    case "。":
      return { punct: ".", hanzi: "。" };
    case "?":
    case "？":
      return { punct: "?", hanzi: "？" };
    case "!":
    case "！":
      return { punct: "!", hanzi: "！" };
    default:
      return null;
  }
}

type SegmenterInstance = {
  segment(input: string): Iterable<{ readonly segment: string }>;
};

let zhWordSegmenter: SegmenterInstance | null | undefined;

function segmentHanziRunLengths(text: string): readonly number[] {
  const chars = Array.from(text);
  if (chars.length <= 4) {
    return [chars.length];
  }
  if (zhWordSegmenter === undefined) {
    const SegmenterCtor = (
      Intl as unknown as {
        readonly Segmenter?: new (
          locale: string,
          options: { readonly granularity: "word" },
        ) => SegmenterInstance;
      }
    ).Segmenter;
    zhWordSegmenter =
      SegmenterCtor != null
        ? new SegmenterCtor("zh-CN", { granularity: "word" })
        : null;
  }
  if (zhWordSegmenter != null) {
    const lengths: number[] = [];
    for (const { segment } of zhWordSegmenter.segment(text)) {
      const len = Array.from(segment).length;
      if (len > 0) {
        lengths.push(len);
      }
    }
    const total = lengths.reduce((sum, n) => sum + n, 0);
    if (total === chars.length && lengths.length > 0) {
      return lengths;
    }
  }
  const fallback: number[] = [];
  for (let i = 0; i < chars.length; i += 2) {
    fallback.push(Math.min(2, chars.length - i));
  }
  return fallback;
}

function extractContextSlice(
  chars: readonly string[],
  start: number,
  end: number,
): string {
  return chars.slice(Math.max(0, start), Math.min(chars.length, end)).join("");
}

export function analyzeZhCustomText(
  rawContent: string,
  scheme: ZhSchemeId,
  engine: ZhPinyinEngine | null,
  { lettersOnly = true }: { readonly lettersOnly?: boolean } = {},
): ZhCustomAnalysis {
  const resolvedEngine = engine ?? getCachedZhPinyinEngine();
  const pieces: ParsedPiece[] = [];
  let runItems: RawHanziItem[] = [];
  let explicitSeparatorCount = 0;
  let skippedCount = 0;

  const flushRun = (followedByExplicitSeparator: boolean) => {
    if (runItems.length > 0) {
      pieces.push({
        kind: "run",
        items: runItems,
        followedByExplicitSeparator,
      });
      runItems = [];
    }
  };

  let i = 0;
  while (i < rawContent.length) {
    const cp = rawContent.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const charLen = ch.length;

    if (isHanziChar(ch)) {
      const rest = rawContent.slice(i + charLen);
      const pinMatch = INLINE_PIN_RE.exec(rest);
      let rawLength = charLen;
      let pinned: string | null = null;
      if (pinMatch != null) {
        const candidate = normalizeZhSyllable(pinMatch[1]);
        if (
          candidate != null &&
          (candidate.length >= 2 ||
            Boolean(resolvedEngine?.charReadings(ch).includes(candidate)))
        ) {
          pinned = candidate;
          rawLength += pinMatch[0].length;
        }
      }
      runItems.push({
        hanzi: ch,
        rawIndex: i,
        rawLength,
        pinned,
      });
      i += rawLength;
      continue;
    }

    if (EXPLICIT_SEPARATORS.has(ch)) {
      explicitSeparatorCount += 1;
      flushRun(true);
      i += charLen;
      continue;
    }

    const punct = mapPunct(ch);
    if (punct != null) {
      if (lettersOnly) {
        explicitSeparatorCount += 1;
        flushRun(true);
      } else {
        flushRun(false);
        pieces.push({ kind: "punct", ...punct });
      }
      i += charLen;
      continue;
    }

    flushRun(false);
    if (!IGNORED_WRAPPER_CHARS.has(ch)) {
      skippedCount += 1;
    }
    i += charLen;
  }
  flushRun(explicitSeparatorCount > 0);

  const tokens: ZhCustomToken[] = [];
  const polyphones: ZhPolyphoneOccurrence[] = [];
  let totalHanzi = 0;
  let keystrokeCount = 0;
  let runCount = 0;
  let totalRunChars = 0;

  for (const piece of pieces) {
    if (piece.kind === "punct") {
      tokens.push({
        kind: "punct",
        punct: piece.punct,
        hanzi: piece.hanzi,
      });
      keystrokeCount += 1;
      continue;
    }

    const cleanHanzi = piece.items.map((item) => item.hanzi).join("");
    const hanziChars = Array.from(cleanHanzi);
    runCount += 1;
    totalRunChars += hanziChars.length;

    const autoRaw = resolvedEngine?.segmentPinyin(cleanHanzi) ?? [];
    const resolvedUnits: (ZhCustomUnit | null)[] = piece.items.map(
      (item, idx) => {
        const allReadings = resolvedEngine?.charReadings(item.hanzi) ?? [];
        const readings: string[] = [...allReadings];
        const autoNorm = normalizeZhSyllable(autoRaw[idx] ?? "");
        const autoSelected = autoNorm ?? readings[0] ?? null;
        if (autoSelected != null && !readings.includes(autoSelected)) {
          readings.unshift(autoSelected);
        }
        if (item.pinned != null && !readings.includes(item.pinned)) {
          readings.push(item.pinned);
        }
        const selected = item.pinned ?? autoSelected;
        if (selected == null) {
          return null;
        }
        const code = encodeZhSyllableForScheme(selected, scheme);
        if (code === "") {
          return null;
        }
        const altCodes: string[] = [];
        const seenAltCodes = new Set<string>([code]);
        for (const reading of readings) {
          const altCode = encodeZhSyllableForScheme(reading, scheme);
          if (altCode !== "" && !seenAltCodes.has(altCode)) {
            seenAltCodes.add(altCode);
            altCodes.push(altCode);
          }
        }
        if (readings.length >= 2) {
          polyphones.push({
            index: polyphones.length,
            hanzi: item.hanzi,
            contextBefore: extractContextSlice(hanziChars, idx - 1, idx),
            contextAfter: extractContextSlice(hanziChars, idx + 1, idx + 2),
            rawIndex: item.rawIndex,
            rawLength: item.rawLength,
            readings,
            autoSelected: autoSelected ?? selected,
            selected,
            isPinned: item.pinned != null,
          });
        }
        return {
          hanzi: item.hanzi,
          syllable: selected,
          code,
          altCodes,
        };
      },
    );

    const segLengths = segmentHanziRunLengths(cleanHanzi);
    let offset = 0;
    for (let s = 0; s < segLengths.length; s++) {
      const segLen = segLengths[s];
      const segUnits: ZhCustomUnit[] = [];
      for (let u = 0; u < segLen; u++) {
        const unit = resolvedUnits[offset + u];
        if (unit != null) {
          segUnits.push(unit);
        } else {
          skippedCount += 1;
        }
      }
      offset += segLen;
      if (segUnits.length === 0) {
        continue;
      }
      const isLastSeg = s === segLengths.length - 1;
      for (const unit of segUnits) {
        totalHanzi += 1;
        keystrokeCount += unit.code.length;
      }
      tokens.push({
        kind: "word",
        units: segUnits,
        spaceAfter: isLastSeg && piece.followedByExplicitSeparator,
      });
    }
  }

  const wordCount = tokens.filter((token) => token.kind === "word").length;
  const avgRunLen = runCount > 0 ? totalRunChars / runCount : 0;
  const isWordListMode = explicitSeparatorCount > 0 && avgRunLen <= 4;

  return {
    tokens,
    polyphones,
    totalHanzi,
    wordCount,
    keystrokeCount,
    skippedCount,
    isWordListMode,
  };
}

export function applyZhPolyphoneOverride(
  rawContent: string,
  occurrence: Pick<
    ZhPolyphoneOccurrence,
    "hanzi" | "rawIndex" | "rawLength" | "autoSelected"
  >,
  nextSyllable: string,
): string {
  const norm = normalizeZhSyllable(nextSyllable);
  if (norm == null) {
    return rawContent;
  }
  const before = rawContent.slice(0, occurrence.rawIndex);
  const after = rawContent.slice(occurrence.rawIndex + occurrence.rawLength);
  const replacement =
    norm === occurrence.autoSelected
      ? occurrence.hanzi
      : `${occurrence.hanzi}(${norm})`;
  return `${before}${replacement}${after}`;
}
