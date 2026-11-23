import { filterText } from "@keybr/keyboard";
import { type CodePoint } from "@keybr/unicode";
import { type Char } from "./chars.ts";
import { type FuzzyPinyinSettings } from "./settings.ts";
import {
  resolveQuanpinWord,
  splitQuanpinFallback,
} from "./zh-quanpin-lexicon.ts";

const CP_A = 0x61; // 'a'
const CP_F = 0x66; // 'f'
const CP_G = 0x67; // 'g'
const CP_H = 0x68; // 'h'
const CP_L = 0x6c; // 'l'
const CP_N = 0x6e; // 'n'
const CP_R = 0x72; // 'r'
const CP_U = 0x75; // 'u'
const CP_V = 0x76; // 'v'
const CP_Z = 0x7a; // 'z'

const SINGLE_INITIALS = new Set([
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
  "y",
  "w",
]);

const PALATAL_INITIALS = new Set(["j", "q", "x", "y"]);
const VOWEL_STARTS = new Set(["a", "e", "i", "o", "u"]);
const VE_UE_SYLLABLES = new Set(["lve", "nve", "lue", "nue"]);

type NasalGroup = "anAng" | "enEng" | "inIng" | "ianIang" | "uanUang";

type ParsedSyllable = {
  readonly raw: string;
  readonly start: number;
  readonly end: number;
  readonly initial: string;
  readonly final: string;
  readonly nasalGroup: NasalGroup | null;
  readonly hasTrailingG: boolean;
  readonly canAddTrailingG: boolean;
  readonly isVeUe: boolean;
};

export type QuanpinFuzzyState = {
  /** Start index of the syllable where an extra initial 'h' was already consumed. */
  readonly consumedExtraInitialHAt?: number;
  /** End index of the syllable where an extra final 'g' was already consumed. */
  readonly consumedExtraFinalGAt?: number;
  /**
   * 1-key delayed disambiguation across (-n/-ng) + g- syllable boundaries:
   * - "extraG": preceding -n followed by g- (e.g. fan+gan), first 'g' advanced canonically;
   *   if next key is 'g', absorb at zero displacement.
   * - "skipG": preceding -ng followed by g- (e.g. fang+gang), first 'g' matched trailing 'g';
   *   if next key matches chars[pos + 1] (vowel after second 'g'), skip the second 'g'.
   */
  readonly pendingBoundaryG?: {
    readonly kind: "extraG" | "skipG";
    readonly atPos: number;
  };
};

export type QuanpinFuzzyAction =
  | { readonly kind: "none" }
  | { readonly kind: "substitute"; readonly nextState: QuanpinFuzzyState }
  | {
      readonly kind: "skipAndMatch";
      readonly skipCount: 1;
      readonly nextState: QuanpinFuzzyState;
    }
  | { readonly kind: "consumeExtra"; readonly nextState: QuanpinFuzzyState };

const NONE: QuanpinFuzzyAction = { kind: "none" };

function isLowerAsciiLetter(codePoint: CodePoint): boolean {
  return codePoint >= CP_A && codePoint <= CP_Z;
}

function matchesPair(
  expected: CodePoint,
  actual: CodePoint,
  first: CodePoint,
  second: CodePoint,
): boolean {
  return (
    (expected === first && actual === second) ||
    (expected === second && actual === first)
  );
}

function classifyNasalGroup(initial: string, final: string): NasalGroup | null {
  if (final === "ian" || final === "iang") {
    return "ianIang";
  }
  if (initial === "y" && (final === "an" || final === "ang")) {
    return "ianIang";
  }
  if (final === "uan" || final === "uang") {
    // Strictly exclude j/q/x/y + uan (phonologically üan; no *juang/*quang/*xuang/*yuang).
    if (PALATAL_INITIALS.has(initial)) {
      return null;
    }
    return "uanUang";
  }
  if (initial === "w" && (final === "an" || final === "ang")) {
    return "uanUang";
  }
  if (final === "an" || final === "ang") {
    return "anAng";
  }
  if (final === "en" || final === "eng") {
    return "enEng";
  }
  if (final === "in" || final === "ing") {
    return "inIng";
  }
  return null;
}

function parseSyllable(raw: string, start: number): ParsedSyllable {
  let initial = "";
  let final = raw;
  if (
    raw.startsWith("zh") ||
    raw.startsWith("ch") ||
    raw.startsWith("sh")
  ) {
    initial = raw.slice(0, 2);
    final = raw.slice(2);
  } else if (raw.length > 0 && SINGLE_INITIALS.has(raw[0])) {
    initial = raw[0];
    final = raw.slice(1);
  }
  const nasalGroup = classifyNasalGroup(initial, final);
  return {
    raw,
    start,
    end: start + raw.length,
    initial,
    final,
    nasalGroup,
    hasTrailingG: nasalGroup != null && raw.endsWith("ng"),
    canAddTrailingG: nasalGroup != null && raw.endsWith("n"),
    isVeUe: VE_UE_SYLLABLES.has(raw),
  };
}

function findWordSpan(
  chars: readonly Char[],
  anchorPos: number,
): { readonly word: string; readonly start: number; readonly end: number } {
  let start = anchorPos;
  while (start > 0 && isLowerAsciiLetter(chars[start - 1].codePoint)) {
    start -= 1;
  }
  let end = anchorPos + 1;
  while (end < chars.length && isLowerAsciiLetter(chars[end].codePoint)) {
    end += 1;
  }
  let word = "";
  for (let i = start; i < end; i++) {
    word += String.fromCodePoint(chars[i].codePoint);
  }
  return { word, start, end };
}

function getWordSyllables(
  word: string,
  start: number,
  syllablesOverride?: readonly string[],
): readonly ParsedSyllable[] {
  let rawSyllables: readonly string[];
  if (syllablesOverride != null && syllablesOverride.join("") === word) {
    rawSyllables = syllablesOverride;
  } else {
    const resolved = resolveQuanpinWord(word);
    rawSyllables =
      resolved != null ? resolved.syllables : splitQuanpinFallback(word);
  }
  const parsed: ParsedSyllable[] = [];
  let offset = start;
  for (const raw of rawSyllables) {
    parsed.push(parseSyllable(raw, offset));
    offset += raw.length;
  }
  if (offset !== start + word.length) {
    return [];
  }
  return parsed;
}

function isNasalEnabled(
  group: NasalGroup | null,
  fuzzy: FuzzyPinyinSettings,
): boolean {
  switch (group) {
    case "anAng":
      return Boolean(fuzzy.anAng);
    case "enEng":
      return Boolean(fuzzy.enEng);
    case "inIng":
      return Boolean(fuzzy.inIng);
    case "ianIang":
      return Boolean(fuzzy.ianIang);
    case "uanUang":
      return Boolean(fuzzy.uanUang);
    default:
      return false;
  }
}

function isRetroflexEnabled(
  initial: string,
  fuzzy: FuzzyPinyinSettings,
): boolean {
  switch (initial) {
    case "zh":
      return Boolean(fuzzy.zhZ);
    case "ch":
      return Boolean(fuzzy.chC);
    case "sh":
      return Boolean(fuzzy.shS);
    default:
      return false;
  }
}

function isFlatInitialEnabled(
  initial: string,
  fuzzy: FuzzyPinyinSettings,
): boolean {
  switch (initial) {
    case "z":
      return Boolean(fuzzy.zhZ);
    case "c":
      return Boolean(fuzzy.chC);
    case "s":
      return Boolean(fuzzy.shS);
    default:
      return false;
  }
}

function isSameLengthSubstitute(
  syl: ParsedSyllable,
  pos: number,
  actual: CodePoint,
  fuzzy: FuzzyPinyinSettings,
): boolean {
  const offset = pos - syl.start;
  const expected = syl.raw.codePointAt(offset);
  if (expected == null || expected === actual) {
    return false;
  }
  if (offset === 0 && syl.raw.length >= 2) {
    if (fuzzy.lN && matchesPair(expected, actual, CP_L, CP_N)) {
      return true;
    }
    if (Boolean(fuzzy.fH) && matchesPair(expected, actual, CP_F, CP_H)) {
      return true;
    }
    if (Boolean(fuzzy.rL) && matchesPair(expected, actual, CP_R, CP_L)) {
      return true;
    }
  }
  if (offset === 1 && Boolean(fuzzy.veUe) && syl.isVeUe) {
    if (matchesPair(expected, actual, CP_V, CP_U)) {
      return true;
    }
  }
  return false;
}

function matchesCharAt(
  chars: readonly Char[],
  pos: number,
  actual: CodePoint,
  fuzzy: FuzzyPinyinSettings,
  syllablesOverride?: readonly string[],
): boolean {
  if (pos < 0 || pos >= chars.length) {
    return false;
  }
  const target = chars[pos].codePoint;
  if (target === actual || filterText.normalize(target) === actual) {
    return true;
  }
  if (isLowerAsciiLetter(target) && isLowerAsciiLetter(actual)) {
    const span = findWordSpan(chars, pos);
    const syllables = getWordSyllables(
      span.word,
      span.start,
      syllablesOverride,
    );
    const syl = syllables.find((item) => pos >= item.start && pos < item.end);
    if (syl != null && isSameLengthSubstitute(syl, pos, actual, fuzzy)) {
      return true;
    }
  }
  return false;
}

/**
 * Computes the next Quanpin fuzzy state after an exact (or normalized) match at `pos`.
 * Sets 1-key boundary disambiguation flags on (-n/-ng) + g- syllable transitions.
 */
export function nextQuanpinFuzzyStateOnExactMatch(
  chars: readonly Char[],
  pos: number,
  fuzzy: FuzzyPinyinSettings | undefined,
  _state: QuanpinFuzzyState,
  syllablesOverride?: readonly string[],
): QuanpinFuzzyState {
  if (fuzzy == null || pos < 0 || pos >= chars.length) {
    return {};
  }
  if (chars[pos].codePoint !== CP_G) {
    return {};
  }

  const span = findWordSpan(chars, pos);
  const syllables = getWordSyllables(span.word, span.start, syllablesOverride);
  const sylIndex = syllables.findIndex(
    (item) => pos >= item.start && pos < item.end,
  );
  if (sylIndex < 0) {
    return {};
  }
  const syl = syllables[sylIndex];

  // (-n) + g- boundary (e.g. fan+gan): matching initial 'g' of second syllable
  // opens a 1-key window to absorb a duplicate 'g' if the user intended fang+gan.
  if (pos === syl.start && sylIndex > 0) {
    const prevSyl = syllables[sylIndex - 1];
    if (prevSyl.canAddTrailingG && isNasalEnabled(prevSyl.nasalGroup, fuzzy)) {
      return {
        pendingBoundaryG: { kind: "extraG", atPos: pos + 1 },
      };
    }
  }

  // (-ng) + g- boundary (e.g. fang+gang): matching trailing 'g' of first syllable
  // opens a 1-key window to skip the second syllable's initial 'g' if the user intended fan+gang.
  if (
    syl.hasTrailingG &&
    pos === syl.end - 1 &&
    isNasalEnabled(syl.nasalGroup, fuzzy) &&
    sylIndex + 1 < syllables.length &&
    syllables[sylIndex + 1].start === pos + 1 &&
    chars[pos + 1]?.codePoint === CP_G
  ) {
    return {
      pendingBoundaryG: { kind: "skipG", atPos: pos + 1 },
    };
  }

  return {};
}

/**
 * Evaluates Full Pinyin (Quanpin) fuzzy matching when `actual` does not exactly match
 * the expected code point at `pos`.
 */
export function evalQuanpinFuzzy(
  chars: readonly Char[],
  pos: number,
  actual: CodePoint,
  fuzzy: FuzzyPinyinSettings | undefined,
  state: QuanpinFuzzyState,
  syllablesOverride?: readonly string[],
): QuanpinFuzzyAction {
  if (fuzzy == null || pos < 0 || pos >= chars.length) {
    return NONE;
  }
  const expected = chars[pos].codePoint;
  if (expected === actual) {
    return NONE;
  }

  // 1. 1-key delayed disambiguation for (-n/-ng) + g- boundaries.
  if (state.pendingBoundaryG != null && state.pendingBoundaryG.atPos === pos) {
    if (state.pendingBoundaryG.kind === "extraG" && actual === CP_G) {
      return {
        kind: "consumeExtra",
        nextState: { consumedExtraFinalGAt: pos - 1 },
      };
    }
    if (
      state.pendingBoundaryG.kind === "skipG" &&
      matchesCharAt(chars, pos + 1, actual, fuzzy, syllablesOverride)
    ) {
      return {
        kind: "skipAndMatch",
        skipCount: 1,
        nextState: {},
      };
    }
  }

  // 2. Trailing extra 'g' after a -n syllable ending right at `pos`
  // (works across syllable boundaries as well as before space/punctuation).
  if (
    actual === CP_G &&
    pos > 0 &&
    isLowerAsciiLetter(chars[pos - 1].codePoint) &&
    state.consumedExtraFinalGAt !== pos
  ) {
    const prevSpan = findWordSpan(chars, pos - 1);
    const prevSyllables = getWordSyllables(
      prevSpan.word,
      prevSpan.start,
      syllablesOverride,
    );
    const prevSyl = prevSyllables.find((item) => item.end === pos);
    if (
      prevSyl != null &&
      prevSyl.canAddTrailingG &&
      isNasalEnabled(prevSyl.nasalGroup, fuzzy)
    ) {
      return {
        kind: "consumeExtra",
        nextState: { consumedExtraFinalGAt: pos },
      };
    }
  }

  // 3. Rules anchored on the syllable containing `pos`.
  if (!isLowerAsciiLetter(expected)) {
    return NONE;
  }

  const span = findWordSpan(chars, pos);
  const syllables = getWordSyllables(span.word, span.start, syllablesOverride);
  const syl = syllables.find((item) => pos >= item.start && pos < item.end);
  if (syl == null) {
    return NONE;
  }
  const offset = pos - syl.start;

  // 3a. Same-length substitutes: l<->n, f<->h, r<->l, lve<->lue / nve<->nue.
  if (
    isLowerAsciiLetter(actual) &&
    isSameLengthSubstitute(syl, pos, actual, fuzzy)
  ) {
    return {
      kind: "substitute",
      nextState: {},
    };
  }

  // 3b. Variable-length initial: omit 'h' in zh/ch/sh (e.g. zhong -> zong).
  if (
    offset === 1 &&
    expected === CP_H &&
    isRetroflexEnabled(syl.initial, fuzzy) &&
    pos + 1 < syl.end &&
    matchesCharAt(chars, pos + 1, actual, fuzzy, syllablesOverride)
  ) {
    return {
      kind: "skipAndMatch",
      skipCount: 1,
      nextState: {},
    };
  }

  // 3c. Variable-length initial: insert extra 'h' after z/c/s (e.g. zan -> zhan).
  if (
    offset === 1 &&
    actual === CP_H &&
    isFlatInitialEnabled(syl.initial, fuzzy) &&
    syl.final.length >= 1 &&
    VOWEL_STARTS.has(syl.final[0]) &&
    state.consumedExtraInitialHAt !== syl.start
  ) {
    return {
      kind: "consumeExtra",
      nextState: { consumedExtraInitialHAt: syl.start },
    };
  }

  // 3d. Variable-length final: omit trailing 'g' in -ng (e.g. fang -> fan).
  if (
    syl.hasTrailingG &&
    pos === syl.end - 1 &&
    expected === CP_G &&
    isNasalEnabled(syl.nasalGroup, fuzzy) &&
    matchesCharAt(chars, pos + 1, actual, fuzzy, syllablesOverride)
  ) {
    return {
      kind: "skipAndMatch",
      skipCount: 1,
      nextState: {},
    };
  }

  return NONE;
}
