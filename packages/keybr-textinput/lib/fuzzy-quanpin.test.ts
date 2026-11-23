import { test } from "node:test";
import { deepEqual, equal } from "rich-assert";
import { splitStyledText } from "./chars.ts";
import {
  evalQuanpinFuzzy,
  nextQuanpinFuzzyStateOnExactMatch,
  type QuanpinFuzzyAction,
  type QuanpinFuzzyState,
} from "./fuzzy-quanpin.ts";
import { type FuzzyPinyinSettings } from "./settings.ts";

const ALL_OFF: FuzzyPinyinSettings = {
  enEng: false,
  anAng: false,
  inIng: false,
  ianIang: false,
  uanUang: false,
  zhZ: false,
  chC: false,
  shS: false,
  lN: false,
  fH: false,
  rL: false,
  veUe: false,
};

const ALL_ON: FuzzyPinyinSettings = {
  enEng: true,
  anAng: true,
  inIng: true,
  ianIang: true,
  uanUang: true,
  zhZ: true,
  chC: true,
  shS: true,
  lN: true,
  fH: true,
  rL: true,
  veUe: true,
};

const cp = (ch: string) => ch.codePointAt(0)!;

/**
 * Simulates typing `typed` against `target` through evalQuanpinFuzzy and
 * nextQuanpinFuzzyStateOnExactMatch, returning acceptance and action trace.
 */
function simulateQuanpin(
  target: string,
  typed: string,
  fuzzy: FuzzyPinyinSettings | undefined,
  syllablesOverride?: readonly string[],
): {
  readonly accepted: boolean;
  readonly completed: boolean;
  readonly pos: number;
  readonly actions: readonly string[];
} {
  const chars = splitStyledText(target);
  let pos = 0;
  let state: QuanpinFuzzyState = {};
  const actions: string[] = [];

  for (const ch of typed) {
    if (pos >= chars.length) {
      return { accepted: false, completed: false, pos, actions };
    }
    const actual = cp(ch);
    if (chars[pos].codePoint === actual) {
      state = nextQuanpinFuzzyStateOnExactMatch(
        chars,
        pos,
        fuzzy,
        state,
        syllablesOverride,
      );
      pos += 1;
      actions.push(`exact:${ch}`);
      continue;
    }
    const action: QuanpinFuzzyAction = evalQuanpinFuzzy(
      chars,
      pos,
      actual,
      fuzzy,
      state,
      syllablesOverride,
    );
    if (action.kind === "none") {
      return { accepted: false, completed: false, pos, actions };
    }
    state = action.nextState;
    if (action.kind === "substitute") {
      pos += 1;
      actions.push(`sub:${ch}`);
    } else if (action.kind === "skipAndMatch") {
      pos += 1 + action.skipCount;
      actions.push(`skip:${ch}`);
    } else {
      actions.push(`extra:${ch}`);
    }
  }

  return {
    accepted: true,
    completed: pos === chars.length,
    pos,
    actions,
  };
}

test("same-length fuzzy rules: l<->n, f<->h, r<->l, ve<->ue", () => {
  // l <-> n (only at syllable initial, never at final -n)
  const lN = { ...ALL_OFF, lN: true };
  equal(simulateQuanpin("lan", "nan", lN).completed, true);
  equal(simulateQuanpin("nan", "lan", lN).completed, true);
  equal(simulateQuanpin("nan", "nal", lN).accepted, false);
  equal(simulateQuanpin("fan", "fal", lN).accepted, false);
  equal(simulateQuanpin("lan", "nan", ALL_OFF).accepted, false);

  // f <-> h (only at syllable initial, never at zh/ch/sh offset 1)
  const fH = { ...ALL_OFF, fH: true };
  equal(simulateQuanpin("fanwei", "hanwei", fH).completed, true);
  equal(simulateQuanpin("wenhua", "wenfua", fH).completed, true);
  equal(simulateQuanpin("zhanlve", "zfanlve", fH).accepted, false);
  equal(simulateQuanpin("shijian", "sfijian", fH).accepted, false);
  equal(simulateQuanpin("fanwei", "hanwei", ALL_OFF).accepted, false);

  // r <-> l (only at syllable initial, never at 'er' offset 1)
  const rL = { ...ALL_OFF, rL: true };
  equal(simulateQuanpin("wangluo", "wangruo", rL).completed, true);
  equal(simulateQuanpin("ruguo", "luguo", rL).completed, true);
  equal(simulateQuanpin("er", "el", rL).accepted, false);
  equal(simulateQuanpin("ruguo", "luguo", ALL_OFF).accepted, false);

  // ve <-> ue (strictly lve<->lue and nve<->nue; never lv->lu or nv->nu)
  const veUe = { ...ALL_OFF, veUe: true };
  equal(simulateQuanpin("zhanlve", "zhanlue", veUe).completed, true);
  equal(simulateQuanpin("nvedai", "nuedai", veUe).completed, true);
  equal(simulateQuanpin("zhanlue", "zhanlve", veUe, ["zhan", "lue"]).completed, true);
  equal(simulateQuanpin("lvyou", "luyou", veUe).accepted, false);
  equal(simulateQuanpin("nvshi", "nushi", veUe).accepted, false);
  equal(simulateQuanpin("zhanlve", "zhanlue", ALL_OFF).accepted, false);

  // Composing lN + veUe: lve -> nue
  equal(
    simulateQuanpin("zhanlve", "zhannue", { ...ALL_OFF, lN: true, veUe: true })
      .completed,
    true,
  );
});

test("variable-length initials: zh<->z, ch<->c, sh<->s", () => {
  const zhZ = { ...ALL_OFF, zhZ: true };
  const skipZh = simulateQuanpin("zhongguo", "zongguo", zhZ);
  equal(skipZh.completed, true);
  deepEqual(skipZh.actions, [
    "exact:z",
    "skip:o",
    "exact:n",
    "exact:g",
    "exact:g",
    "exact:u",
    "exact:o",
  ]);
  const extraZh = simulateQuanpin("ziji", "zhiji", zhZ);
  equal(extraZh.completed, true);
  deepEqual(extraZh.actions, [
    "exact:z",
    "extra:h",
    "exact:i",
    "exact:j",
    "exact:i",
  ]);
  // Double extra 'h' must be rejected.
  equal(simulateQuanpin("ziji", "zhhiji", zhZ).accepted, false);
  // zhZ must not affect ch/sh.
  equal(simulateQuanpin("chengwei", "cengwei", zhZ).accepted, false);

  const chC = { ...ALL_OFF, chC: true };
  equal(simulateQuanpin("chengwei", "cengwei", chC).completed, true);
  equal(simulateQuanpin("canguan", "changuan", chC).completed, true);
  equal(simulateQuanpin("canguan", "chhanguan", chC).accepted, false);

  const shS = { ...ALL_OFF, shS: true };
  equal(simulateQuanpin("shijian", "sijian", shS).completed, true);
  equal(simulateQuanpin("gongsi", "gongshi", shS).completed, true);
  equal(simulateQuanpin("gongsi", "gongshhi", shS).accepted, false);
});

test("variable-length finals: an/ang, en/eng, in/ing, ian/iang (+yan/yang), uan/uang (+wan/wang)", () => {
  // an <-> ang
  const anAng = { ...ALL_OFF, anAng: true };
  equal(simulateQuanpin("fanwei", "fangwei", anAng).completed, true);
  equal(simulateQuanpin("shuangfang de", "shuangfan de", anAng).completed, true);
  equal(simulateQuanpin("fan de", "fang de", anAng).completed, true);
  equal(simulateQuanpin("fan de", "fangg de", anAng).accepted, false);
  // anAng must NOT fire on yan/yang or uan/uang.
  equal(simulateQuanpin("yanjiu", "yangjiu", anAng).accepted, false);
  equal(simulateQuanpin("shuangfang", "shuanfang", anAng).accepted, false);

  // en <-> eng (includes wen <-> weng)
  const enEng = { ...ALL_OFF, enEng: true };
  equal(simulateQuanpin("wenhua", "wenghua", enEng).completed, true);
  equal(simulateQuanpin("chengwei", "chenwei", enEng).completed, true);
  equal(simulateQuanpin("weng de", "wen de", enEng).completed, true);

  // in <-> ing
  const inIng = { ...ALL_OFF, inIng: true };
  equal(simulateQuanpin("jinxing", "jingxing", inIng).completed, true);
  equal(simulateQuanpin("jinxing de", "jinxin de", inIng).completed, true);
  equal(simulateQuanpin("yinwei", "yingwei", inIng).completed, true);
  equal(simulateQuanpin("jueding de", "juedin de", inIng).completed, true);

  // ian <-> iang (includes yan <-> yang)
  const ianIang = { ...ALL_OFF, ianIang: true };
  equal(simulateQuanpin("shijian de", "shijiang de", ianIang).completed, true);
  equal(simulateQuanpin("yanjiu", "yangjiu", ianIang).completed, true);
  equal(simulateQuanpin("yangguang", "yanguang", ianIang).completed, true);

  // uan <-> uang (includes wan <-> wang)
  const uanUang = { ...ALL_OFF, uanUang: true };
  equal(simulateQuanpin("shuangfang", "shuanfang", uanUang).completed, true);
  equal(simulateQuanpin("zhuangkuang de", "zhuankuan de", uanUang).completed, true);
  equal(simulateQuanpin("wancheng", "wangcheng", uanUang).completed, true);
  equal(simulateQuanpin("wangluo", "wanluo", uanUang).completed, true);
});

test("phonological exclusions: juan/quan/xuan/yuan, un, ong, iong", () => {
  // j/q/x/y + uan are phonologically üan -> strictly excluded even with ALL_ON.
  equal(simulateQuanpin("kejuanzashui", "kejuangzashui", ALL_ON).accepted, false);
  equal(simulateQuanpin("quanguo", "quangguo", ALL_ON).accepted, false);
  equal(simulateQuanpin("xuanze", "xuangze", ALL_ON).accepted, false);
  equal(simulateQuanpin("yuanyin", "yuangyin", ALL_ON).accepted, false);
  equal(simulateQuanpin("juan de", "juang de", ALL_ON).accepted, false);
  equal(simulateQuanpin("quan de", "quang de", ALL_ON).accepted, false);
  equal(simulateQuanpin("xuan de", "xuang de", ALL_ON).accepted, false);
  equal(simulateQuanpin("yuan de", "yuang de", ALL_ON).accepted, false);

  // Verify yuan+yin still allows yin -> ying while rejecting yuan -> yuang.
  equal(simulateQuanpin("yuanyin de", "yuanying de", ALL_ON).completed, true);

  // un / ong / iong have no front/back nasal fuzzy pair.
  equal(simulateQuanpin("yun de", "yung de", ALL_ON).accepted, false);
  equal(simulateQuanpin("kun de", "kung de", ALL_ON).accepted, false);
  equal(simulateQuanpin("zhongguo", "zhonguo", ALL_ON).accepted, false);
  equal(simulateQuanpin("gongzuo", "gonzuo", ALL_ON).accepted, false);
  equal(simulateQuanpin("xiong de", "xion de", ALL_ON).accepted, false);
  equal(simulateQuanpin("yong de", "yon de", ALL_ON).accepted, false);
});

test("cross-syllable (-n/-ng) + g- 1-key disambiguation: fan+gan, fang+gang, fang+an", () => {
  const anAng = { ...ALL_OFF, anAng: true };

  // 1. 反感 ["fan", "gan"]: canonical fangan AND fuzzy fanggan; triple g rejected.
  const fanGanCanonical = simulateQuanpin("fangan", "fangan", anAng, [
    "fan",
    "gan",
  ]);
  equal(fanGanCanonical.completed, true);
  const fanGanExtra = simulateQuanpin("fangan", "fanggan", anAng, [
    "fan",
    "gan",
  ]);
  equal(fanGanExtra.completed, true);
  deepEqual(fanGanExtra.actions, [
    "exact:f",
    "exact:a",
    "exact:n",
    "exact:g",
    "extra:g",
    "exact:a",
    "exact:n",
  ]);
  equal(
    simulateQuanpin("fangan", "fanggg", anAng, ["fan", "gan"]).accepted,
    false,
  );
  // Real in-lexicon (-n)+g- words: 敏感 ["min", "gan"], 参观 ["can", "guan"]
  equal(
    simulateQuanpin("mingan", "minggan", { ...ALL_OFF, inIng: true }).completed,
    true,
  );
  equal(simulateQuanpin("canguan", "cangguan", anAng).completed, true);

  // 2. 方刚 ["fang", "gang"]: fanggang, fangang (skip first g), fanggan (skip second g), fangan (skip both).
  equal(simulateQuanpin("fanggang", "fanggang", anAng).completed, true);
  const fangGangSkipFirst = simulateQuanpin("fanggang", "fangang", anAng);
  equal(fangGangSkipFirst.completed, true);
  deepEqual(fangGangSkipFirst.actions, [
    "exact:f",
    "exact:a",
    "exact:n",
    "exact:g",
    "skip:a",
    "exact:n",
    "exact:g",
  ]);
  equal(simulateQuanpin("fanggang de", "fanggan de", anAng).completed, true);
  equal(simulateQuanpin("fanggang de", "fangan de", anAng).completed, true);
  // Reject triple g or skipping both g's at the boundary.
  equal(simulateQuanpin("fanggang", "fangggang", anAng).accepted, false);
  equal(simulateQuanpin("fanggang", "fanang", anAng).accepted, false);
  // Real in-lexicon (-ng)+g- word: 阳光 ["yang", "guang"]
  equal(
    simulateQuanpin("yangguang", "yanguang", { ...ALL_OFF, ianIang: true })
      .completed,
    true,
  );

  // 3. 方案 ["fang", "an"] (from ZH_QP_LEXICON): canonical fangan AND short fanan; fanggan rejected!
  equal(simulateQuanpin("fangan", "fangan", anAng).completed, true);
  const fangAnShort = simulateQuanpin("fangan", "fanan", anAng);
  equal(fangAnShort.completed, true);
  deepEqual(fangAnShort.actions, [
    "exact:f",
    "exact:a",
    "exact:n",
    "skip:a",
    "exact:n",
  ]);
  equal(simulateQuanpin("fangan de", "fangang de", anAng).completed, true);
  equal(simulateQuanpin("fangan de", "fanang de", anAng).completed, true);
  equal(simulateQuanpin("fangan", "fanggan", anAng).accepted, false);
});

test("skip trailing g composes with same-length substitute on next syllable", () => {
  // 双方 ["shuang", "fang"] typed as shuan+hang (skip g + f->h)
  const fuzzy = { ...ALL_OFF, uanUang: true, fH: true };
  const result = simulateQuanpin("shuangfang", "shuanhang", fuzzy);
  equal(result.completed, true);
  deepEqual(result.actions, [
    "exact:s",
    "exact:h",
    "exact:u",
    "exact:a",
    "exact:n",
    "skip:h",
    "exact:a",
    "exact:n",
    "exact:g",
  ]);
});

test("guards: undefined fuzzy, out-of-bounds pos, exact match", () => {
  const chars = splitStyledText("zhongguo");
  deepEqual(evalQuanpinFuzzy(chars, 1, cp("o"), undefined, {}), {
    kind: "none",
  });
  deepEqual(evalQuanpinFuzzy(chars, -1, cp("o"), ALL_ON, {}), { kind: "none" });
  deepEqual(evalQuanpinFuzzy(chars, 99, cp("o"), ALL_ON, {}), { kind: "none" });
  deepEqual(evalQuanpinFuzzy(chars, 1, cp("h"), ALL_ON, {}), { kind: "none" });
});
