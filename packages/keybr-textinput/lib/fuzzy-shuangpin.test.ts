import { test } from "node:test";
import { keyboardProps, Language } from "@keybr/keyboard";
import { Settings } from "@keybr/settings";
import { deepEqual, isFalse, isTrue } from "rich-assert";
import { splitStyledText } from "./chars.ts";
import { matchesFuzzyShuangpin } from "./fuzzy-shuangpin.ts";
import {
  type FuzzyPinyinSettings,
  textInputProps,
  toTextInputSettings,
} from "./settings.ts";

const ALL_OFF: FuzzyPinyinSettings = {
  enEng: false,
  anAng: false,
  inIng: false,
  ianIang: false,
  zhZ: false,
  chC: false,
  shS: false,
  lN: false,
};

const ALL_ON: FuzzyPinyinSettings = {
  enEng: true,
  anAng: true,
  inIng: true,
  ianIang: true,
  zhZ: true,
  chC: true,
  shS: true,
  lN: true,
};

const cp = (ch: string) => ch.codePointAt(0)!;

function matchAt(
  text: string,
  pos: number,
  actual: string,
  fuzzy: FuzzyPinyinSettings | undefined = ALL_ON,
): boolean {
  const chars = splitStyledText(text);
  const expected = chars[pos]?.codePoint ?? 0;
  return matchesFuzzyShuangpin(chars, pos, expected, cp(actual), fuzzy);
}

test("fuzzy initial pairs (zh/z, ch/c, sh/s, l/n)", () => {
  // zh <-> z ('v' <-> 'z')
  isTrue(matchAt("vege", 0, "z", { ...ALL_OFF, zhZ: true }));
  isTrue(matchAt("zege", 0, "v", { ...ALL_OFF, zhZ: true }));
  isFalse(matchAt("vege", 0, "z", ALL_OFF));
  // Initial rule must not fire at final position (offset 1).
  isFalse(matchAt("av", 1, "z", { ...ALL_OFF, zhZ: true }));

  // ch <-> c ('i' <-> 'c')
  isTrue(matchAt("ia", 0, "c", { ...ALL_OFF, chC: true }));
  isTrue(matchAt("ca", 0, "i", { ...ALL_OFF, chC: true }));
  isFalse(matchAt("bi", 1, "c", { ...ALL_OFF, chC: true }));

  // sh <-> s ('u' <-> 's')
  isTrue(matchAt("ui", 0, "s", { ...ALL_OFF, shS: true }));
  isTrue(matchAt("si", 0, "u", { ...ALL_OFF, shS: true }));
  isFalse(matchAt("bu", 1, "s", { ...ALL_OFF, shS: true }));

  // l <-> n ('l' <-> 'n')
  isTrue(matchAt("ld", 0, "n", { ...ALL_OFF, lN: true }));
  isTrue(matchAt("nd", 0, "l", { ...ALL_OFF, lN: true }));
  // Must not confuse 'l' <-> 'n' at final position (e.g. 'an' vs 'al').
  isFalse(matchAt("an", 1, "l", { ...ALL_OFF, lN: true }));
});

test("fuzzy en/eng and an/ang (with zero-initial special cases)", () => {
  const enOnly = { ...ALL_OFF, enEng: true };
  // Non-zero-initial en/eng: 'f' <-> 'g'
  isTrue(matchAt("rfmb", 1, "g", enOnly));
  isTrue(matchAt("ig", 1, "f", enOnly));
  isFalse(matchAt("rfmb", 1, "n", enOnly));
  // Zero-initial en/eng ('e' + 'n'/'g'): 'n' <-> 'g'
  isTrue(matchAt("en", 1, "g", enOnly));
  isTrue(matchAt("eg", 1, "n", enOnly));
  isFalse(matchAt("en", 1, "f", enOnly));
  // Does not fire on initial position.
  isFalse(matchAt("fa", 0, "g", enOnly));

  const anOnly = { ...ALL_OFF, anAng: true };
  // Non-zero-initial an/ang: 'j' <-> 'h'
  isTrue(matchAt("bj", 1, "h", anOnly));
  isTrue(matchAt("bh", 1, "j", anOnly));
  isFalse(matchAt("bj", 1, "n", anOnly));
  // Zero-initial an/ang ('a' + 'n'/'h'): 'n' <-> 'h'
  isTrue(matchAt("an", 1, "h", anOnly));
  isTrue(matchAt("ah", 1, "n", anOnly));
  isFalse(matchAt("an", 1, "j", anOnly));
});

test("fuzzy in/ing and ian/iang avoid uai/uang false positives", () => {
  const inOnly = { ...ALL_OFF, inIng: true };
  for (const init of ["b", "p", "m", "d", "t", "n", "l", "j", "q", "x", "y"]) {
    isTrue(matchAt(`${init}b`, 1, "k", inOnly));
    isTrue(matchAt(`${init}k`, 1, "b", inOnly));
  }
  // uai shares 'k' for g/k/h/zh(v)/ch(i)/sh(u) — must not match in/ing.
  for (const init of ["g", "k", "h", "v", "i", "u"]) {
    isFalse(matchAt(`${init}k`, 1, "b", inOnly));
    isFalse(matchAt(`${init}b`, 1, "k", inOnly));
  }

  const ianOnly = { ...ALL_OFF, ianIang: true };
  for (const init of ["b", "p", "m", "d", "t", "n", "l", "j", "q", "x"]) {
    isTrue(matchAt(`${init}m`, 1, "l", ianOnly));
    isTrue(matchAt(`${init}l`, 1, "m", ianOnly));
  }
  // uang shares 'l' for g/k/h/zh(v)/ch(i)/sh(u), and y does not use m/l.
  for (const init of ["g", "k", "h", "v", "i", "u", "y"]) {
    isFalse(matchAt(`${init}l`, 1, "m", ianOnly));
    isFalse(matchAt(`${init}m`, 1, "l", ianOnly));
  }
});

test("multi-syllable words, punctuation boundaries, and invalid spans", () => {
  // Multi-syllable with trailing punctuation ("vsgo," = 中国，)
  isTrue(matchAt("vsgo,", 0, "z", ALL_ON));
  isTrue(matchAt("tmanmf.", 3, "h", ALL_ON)); // an -> ah at offset 3 (zero-initial 'a')
  isTrue(matchAt("tmanmf.", 5, "g", ALL_ON)); // mf -> mg at offset 5

  // Punctuation char itself is not matched.
  isFalse(matchAt("vsgo,", 4, "z", ALL_ON));

  // Odd-length or 1-letter spans are ignored.
  isFalse(matchAt("vsg", 0, "z", ALL_ON));
  isFalse(matchAt("v", 0, "z", ALL_ON));
  isFalse(matchAt("Vego", 1, "g", ALL_ON)); // uppercase breaks span -> "ego" length 3

  // Guards: undefined fuzzy, out-of-bounds pos, equal expected/actual, non-lowercase ASCII.
  const chars = splitStyledText("ve");
  isFalse(matchesFuzzyShuangpin(chars, 0, cp("v"), cp("z"), undefined));
  isFalse(matchesFuzzyShuangpin(chars, -1, cp("v"), cp("z"), ALL_ON));
  isFalse(matchesFuzzyShuangpin(chars, 2, cp("v"), cp("z"), ALL_ON));
  isFalse(matchesFuzzyShuangpin(chars, 0, cp("v"), cp("v"), ALL_ON));
  isFalse(matchesFuzzyShuangpin(chars, 0, cp("v"), cp("Z"), ALL_ON));
});

test("settings defaults and toTextInputSettings", () => {
  const defaults = new Settings();
  const enInput = toTextInputSettings(defaults);
  isFalse(enInput.zhShuangpin);
  deepEqual(enInput.fuzzy, ALL_OFF);

  const zhSettings = defaults
    .set(keyboardProps.language, Language.ZH_SP)
    .set(textInputProps.fuzzy.zhZ, true)
    .set(textInputProps.fuzzy.enEng, true);
  const zhInput = toTextInputSettings(zhSettings);
  isTrue(zhInput.zhShuangpin);
  deepEqual(zhInput.fuzzy, {
    ...ALL_OFF,
    zhZ: true,
    enEng: true,
  });
});
