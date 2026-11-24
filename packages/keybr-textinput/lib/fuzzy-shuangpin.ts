import {
  getShuangpinScheme,
  ZH_SHUANGPIN_SCHEMES,
  type ZhShuangpinSchemeId,
} from "@keybr/keyboard";
import { type CodePoint } from "@keybr/unicode";
import { type Char } from "./chars.ts";
import { type FuzzyPinyinSettings } from "./settings.ts";

const CP_A = 0x61; // 'a'
const CP_C = 0x63; // 'c'
const CP_E = 0x65; // 'e'
const CP_L = 0x6c; // 'l'
const CP_N = 0x6e; // 'n'
const CP_S = 0x73; // 's'
const CP_Z = 0x7a; // 'z'
const CP_SEMICOLON = 0x3b; // ';'

// Restrict in/ing and ian/iang to initials that never map those final keys to uai/uang.
const IN_ING_INITIALS = new Set<CodePoint>(
  [..."bpmdtnljqxy"].map((ch) => ch.codePointAt(0)!),
);
const IAN_IANG_INITIALS = new Set<CodePoint>(
  [..."bpmdtnljqx"].map((ch) => ch.codePointAt(0)!),
);

function cpOf(ch: string): CodePoint {
  return ch.codePointAt(0)!;
}

function isWordChar(codePoint: CodePoint, usesSemicolon: boolean): boolean {
  return (
    (codePoint >= CP_A && codePoint <= CP_Z) ||
    (usesSemicolon && codePoint === CP_SEMICOLON)
  );
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

/**
 * Checks whether an actual keystroke is an accepted Shuangpin fuzzy-pinyin
 * alternative for the expected character at `pos` under the active `schemeId`.
 */
export function matchesFuzzyShuangpin(
  chars: readonly Char[],
  pos: number,
  expected: CodePoint,
  actual: CodePoint,
  fuzzy?: FuzzyPinyinSettings,
  schemeId: ZhShuangpinSchemeId = "zh-sp",
): boolean {
  if (fuzzy == null || pos < 0 || pos >= chars.length || expected === actual) {
    return false;
  }
  const scheme = getShuangpinScheme(schemeId) ?? ZH_SHUANGPIN_SCHEMES["zh-sp"];
  const usesSemicolon = scheme.usesSemicolon;

  if (
    !isWordChar(expected, usesSemicolon) ||
    !isWordChar(actual, usesSemicolon) ||
    !isWordChar(chars[pos].codePoint, usesSemicolon)
  ) {
    return false;
  }

  let wordStart = pos;
  while (
    wordStart > 0 &&
    isWordChar(chars[wordStart - 1].codePoint, usesSemicolon)
  ) {
    wordStart -= 1;
  }
  let wordEnd = pos + 1;
  while (
    wordEnd < chars.length &&
    isWordChar(chars[wordEnd].codePoint, usesSemicolon)
  ) {
    wordEnd += 1;
  }
  const wordLength = wordEnd - wordStart;
  if (wordLength < 2 || wordLength % 2 !== 0) {
    return false;
  }

  const offsetInWord = pos - wordStart;
  if (offsetInWord % 2 === 0) {
    return (
      (fuzzy.zhZ &&
        matchesPair(expected, actual, cpOf(scheme.initials.zh), CP_Z)) ||
      (fuzzy.chC &&
        matchesPair(expected, actual, cpOf(scheme.initials.ch), CP_C)) ||
      (fuzzy.shS &&
        matchesPair(expected, actual, cpOf(scheme.initials.sh), CP_S)) ||
      (fuzzy.lN && matchesPair(expected, actual, CP_L, CP_N))
    );
  }

  const initial = chars[pos - 1].codePoint;
  if (fuzzy.enEng) {
    const enMatch =
      scheme.zeroInitial === "self" && initial === CP_E
        ? matchesPair(expected, actual, CP_N, cpOf(scheme.finals.eng))
        : matchesPair(
            expected,
            actual,
            cpOf(scheme.finals.en),
            cpOf(scheme.finals.eng),
          );
    if (enMatch) {
      return true;
    }
  }
  if (fuzzy.anAng) {
    const anMatch =
      scheme.zeroInitial === "self" && initial === CP_A
        ? matchesPair(expected, actual, CP_N, cpOf(scheme.finals.ang))
        : matchesPair(
            expected,
            actual,
            cpOf(scheme.finals.an),
            cpOf(scheme.finals.ang),
          );
    if (anMatch) {
      return true;
    }
  }
  if (
    fuzzy.inIng &&
    IN_ING_INITIALS.has(initial) &&
    matchesPair(
      expected,
      actual,
      cpOf(scheme.finals.in),
      cpOf(scheme.finals.ing),
    )
  ) {
    return true;
  }
  if (
    fuzzy.ianIang &&
    IAN_IANG_INITIALS.has(initial) &&
    matchesPair(
      expected,
      actual,
      cpOf(scheme.finals.ian),
      cpOf(scheme.finals.iang),
    )
  ) {
    return true;
  }
  return false;
}
