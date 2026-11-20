import { type CodePoint } from "@keybr/unicode";
import { type Char } from "./chars.ts";
import { type FuzzyPinyinSettings } from "./settings.ts";

const CP_A = 0x61; // 'a'
const CP_B = 0x62; // 'b'
const CP_C = 0x63; // 'c'
const CP_E = 0x65; // 'e'
const CP_F = 0x66; // 'f'
const CP_G = 0x67; // 'g'
const CP_H = 0x68; // 'h'
const CP_I = 0x69; // 'i'
const CP_J = 0x6a; // 'j'
const CP_K = 0x6b; // 'k'
const CP_L = 0x6c; // 'l'
const CP_M = 0x6d; // 'm'
const CP_N = 0x6e; // 'n'
const CP_S = 0x73; // 's'
const CP_U = 0x75; // 'u'
const CP_V = 0x76; // 'v'
const CP_Z = 0x7a; // 'z'

// Restrict in/ing and ian/iang to initials that never map those final keys to uai/uang.
const IN_ING_INITIALS = new Set<CodePoint>(
  [..."bpmdtnljqxy"].map((ch) => ch.codePointAt(0)!),
);
const IAN_IANG_INITIALS = new Set<CodePoint>(
  [..."bpmdtnljqx"].map((ch) => ch.codePointAt(0)!),
);

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

/**
 * Checks whether an actual keystroke is an accepted Xiaohe Shuangpin fuzzy-pinyin
 * alternative for the expected character at `pos`.
 */
export function matchesFuzzyShuangpin(
  chars: readonly Char[],
  pos: number,
  expected: CodePoint,
  actual: CodePoint,
  fuzzy?: FuzzyPinyinSettings,
): boolean {
  if (fuzzy == null || pos < 0 || pos >= chars.length || expected === actual) {
    return false;
  }
  if (
    !isLowerAsciiLetter(expected) ||
    !isLowerAsciiLetter(actual) ||
    !isLowerAsciiLetter(chars[pos].codePoint)
  ) {
    return false;
  }

  let wordStart = pos;
  while (wordStart > 0 && isLowerAsciiLetter(chars[wordStart - 1].codePoint)) {
    wordStart -= 1;
  }
  let wordEnd = pos + 1;
  while (
    wordEnd < chars.length &&
    isLowerAsciiLetter(chars[wordEnd].codePoint)
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
      (fuzzy.zhZ && matchesPair(expected, actual, CP_V, CP_Z)) ||
      (fuzzy.chC && matchesPair(expected, actual, CP_I, CP_C)) ||
      (fuzzy.shS && matchesPair(expected, actual, CP_U, CP_S)) ||
      (fuzzy.lN && matchesPair(expected, actual, CP_L, CP_N))
    );
  }

  const initial = chars[pos - 1].codePoint;
  if (fuzzy.enEng) {
    const enMatch =
      initial === CP_E
        ? matchesPair(expected, actual, CP_N, CP_G)
        : matchesPair(expected, actual, CP_F, CP_G);
    if (enMatch) {
      return true;
    }
  }
  if (fuzzy.anAng) {
    const anMatch =
      initial === CP_A
        ? matchesPair(expected, actual, CP_N, CP_H)
        : matchesPair(expected, actual, CP_J, CP_H);
    if (anMatch) {
      return true;
    }
  }
  if (
    fuzzy.inIng &&
    IN_ING_INITIALS.has(initial) &&
    matchesPair(expected, actual, CP_B, CP_K)
  ) {
    return true;
  }
  if (
    fuzzy.ianIang &&
    IAN_IANG_INITIALS.has(initial) &&
    matchesPair(expected, actual, CP_M, CP_L)
  ) {
    return true;
  }
  return false;
}
