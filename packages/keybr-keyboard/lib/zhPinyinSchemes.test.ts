import { describe, it, test } from "node:test";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isFalse, isNull, isTrue } from "rich-assert";
import { Language } from "./language.ts";
import {
  getZhSchemeFromLayout,
  isZhLayout,
  isZhQuanpinLayout,
  isZhShuangpinLayout,
  Layout,
  layoutUsesSemicolon,
} from "./layout.ts";
import { loadKeyboard } from "./load.ts";
import {
  KeyboardOptions,
  keyboardProps,
  resolveZhScheme,
  setZhScheme,
  switchPracticeLanguage,
} from "./settings.ts";
import { getZhKeyLabelsForLayout, ZH_KEY_LABELS } from "./zhKeyLabels.ts";
import {
  encodePinyinSyllable,
  getZhKeyLabelsForScheme,
  getZhSchemeExampleText,
} from "./zhPinyinSchemes.ts";

describe("zhPinyinSchemes encoder", () => {
  it("encodes representative syllables accurately for all 4 Shuangpin schemes", () => {
    const cases: ReadonlyArray<{
      readonly syllable: string;
      readonly expected: {
        readonly "zh-sp": string;
        readonly "zh-sp-zrm": string;
        readonly "zh-sp-ms": string;
        readonly "zh-sp-sg": string;
      };
    }> = [
      {
        syllable: "zhong",
        expected: {
          "zh-sp": "vs",
          "zh-sp-zrm": "vs",
          "zh-sp-ms": "vs",
          "zh-sp-sg": "vs",
        },
      },
      {
        syllable: "guo",
        expected: {
          "zh-sp": "go",
          "zh-sp-zrm": "go",
          "zh-sp-ms": "go",
          "zh-sp-sg": "go",
        },
      },
      {
        syllable: "jin",
        expected: {
          "zh-sp": "jb",
          "zh-sp-zrm": "jn",
          "zh-sp-ms": "jn",
          "zh-sp-sg": "jn",
        },
      },
      {
        syllable: "xing",
        expected: {
          "zh-sp": "xk",
          "zh-sp-zrm": "xy",
          "zh-sp-ms": "x;",
          "zh-sp-sg": "x;",
        },
      },
      {
        syllable: "lv",
        expected: {
          "zh-sp": "lv",
          "zh-sp-zrm": "lv",
          "zh-sp-ms": "ly",
          "zh-sp-sg": "ly",
        },
      },
      {
        syllable: "nv",
        expected: {
          "zh-sp": "nv",
          "zh-sp-zrm": "nv",
          "zh-sp-ms": "ny",
          "zh-sp-sg": "ny",
        },
      },
      {
        syllable: "lve",
        expected: {
          "zh-sp": "lt",
          "zh-sp-zrm": "lt",
          "zh-sp-ms": "lv",
          "zh-sp-sg": "lt",
        },
      },
      {
        syllable: "nve",
        expected: {
          "zh-sp": "nt",
          "zh-sp-zrm": "nt",
          "zh-sp-ms": "nv",
          "zh-sp-sg": "nt",
        },
      },
      {
        syllable: "jue",
        expected: {
          "zh-sp": "jt",
          "zh-sp-zrm": "jt",
          "zh-sp-ms": "jt",
          "zh-sp-sg": "jt",
        },
      },
      {
        syllable: "a",
        expected: {
          "zh-sp": "aa",
          "zh-sp-zrm": "aa",
          "zh-sp-ms": "oa",
          "zh-sp-sg": "oa",
        },
      },
      {
        syllable: "ai",
        expected: {
          "zh-sp": "ai",
          "zh-sp-zrm": "ai",
          "zh-sp-ms": "ol",
          "zh-sp-sg": "ol",
        },
      },
      {
        syllable: "an",
        expected: {
          "zh-sp": "an",
          "zh-sp-zrm": "an",
          "zh-sp-ms": "oj",
          "zh-sp-sg": "oj",
        },
      },
      {
        syllable: "ang",
        expected: {
          "zh-sp": "ah",
          "zh-sp-zrm": "ah",
          "zh-sp-ms": "oh",
          "zh-sp-sg": "oh",
        },
      },
      {
        syllable: "e",
        expected: {
          "zh-sp": "ee",
          "zh-sp-zrm": "ee",
          "zh-sp-ms": "oe",
          "zh-sp-sg": "oe",
        },
      },
      {
        syllable: "en",
        expected: {
          "zh-sp": "en",
          "zh-sp-zrm": "en",
          "zh-sp-ms": "of",
          "zh-sp-sg": "of",
        },
      },
      {
        syllable: "eng",
        expected: {
          "zh-sp": "eg",
          "zh-sp-zrm": "eg",
          "zh-sp-ms": "og",
          "zh-sp-sg": "og",
        },
      },
      {
        syllable: "er",
        expected: {
          "zh-sp": "er",
          "zh-sp-zrm": "er",
          "zh-sp-ms": "or",
          "zh-sp-sg": "or",
        },
      },
      {
        syllable: "o",
        expected: {
          "zh-sp": "oo",
          "zh-sp-zrm": "oo",
          "zh-sp-ms": "oo",
          "zh-sp-sg": "oo",
        },
      },
      {
        syllable: "ou",
        expected: {
          "zh-sp": "ou",
          "zh-sp-zrm": "ou",
          "zh-sp-ms": "ob",
          "zh-sp-sg": "ob",
        },
      },
      {
        syllable: "meitian".slice(0, 3),
        expected: {
          "zh-sp": "mw",
          "zh-sp-zrm": "mz",
          "zh-sp-ms": "mz",
          "zh-sp-sg": "mz",
        },
      },
    ];

    for (const { syllable, expected } of cases) {
      for (const schemeId of [
        "zh-sp",
        "zh-sp-zrm",
        "zh-sp-ms",
        "zh-sp-sg",
      ] as const) {
        equal(
          encodePinyinSyllable(syllable, schemeId),
          expected[schemeId],
          `${schemeId}:${syllable}`,
        );
      }
    }
  });
});

describe("key labels & layout helpers", () => {
  it("keeps zh-sp key labels identical to legacy ZH_KEY_LABELS", () => {
    deepEqual(getZhKeyLabelsForScheme("zh-sp"), ZH_KEY_LABELS);
    deepEqual(getZhKeyLabelsForLayout(Layout.ZH_SP), ZH_KEY_LABELS);
    isNull(getZhKeyLabelsForLayout(Layout.ZH_QP));
    isNull(getZhKeyLabelsForLayout(Layout.EN_US));
  });

  it("derives key labels for Ziranma, Microsoft, and Sogou including Semicolon", () => {
    const ms = getZhKeyLabelsForLayout(Layout.ZH_SP_MS)!;
    deepEqual(ms.Semicolon, ["ing"]);
    isTrue(ms.KeyY.includes("ü"));
    isTrue(ms.KeyV.includes("üe"));
    isFalse(ms.KeyT.includes("üe"));

    const sg = getZhKeyLabelsForLayout(Layout.ZH_SP_SG)!;
    deepEqual(sg.Semicolon, ["ing"]);
    isTrue(sg.KeyY.includes("ü"));
    isTrue(sg.KeyT.includes("üe"));
    isFalse(sg.KeyV.includes("üe"));

    const zrm = getZhKeyLabelsForLayout(Layout.ZH_SP_ZRM)!;
    equal(zrm.Semicolon, undefined);
    isTrue(zrm.KeyY.includes("ing"));
    isTrue(zrm.KeyV.includes("ü"));
  });

  it("exposes layout predicates, semicolon flags, and per-layout example text", () => {
    isTrue(isZhLayout(Layout.ZH_SP));
    isTrue(isZhLayout(Layout.ZH_SP_ZRM));
    isTrue(isZhLayout(Layout.ZH_SP_MS));
    isTrue(isZhLayout(Layout.ZH_SP_SG));
    isTrue(isZhLayout(Layout.ZH_QP));
    isFalse(isZhLayout(Layout.EN_US));

    isTrue(isZhShuangpinLayout(Layout.ZH_SP_MS));
    isFalse(isZhShuangpinLayout(Layout.ZH_QP));
    isTrue(isZhQuanpinLayout(Layout.ZH_QP));
    isFalse(isZhQuanpinLayout(Layout.ZH_SP_ZRM));

    isFalse(layoutUsesSemicolon(Layout.ZH_SP));
    isFalse(layoutUsesSemicolon(Layout.ZH_SP_ZRM));
    isTrue(layoutUsesSemicolon(Layout.ZH_SP_MS));
    isTrue(layoutUsesSemicolon(Layout.ZH_SP_SG));
    isFalse(layoutUsesSemicolon(Layout.ZH_QP));

    equal(getZhSchemeFromLayout(Layout.ZH_SP_MS), "zh-sp-ms");
    equal(loadKeyboard(Layout.ZH_SP_MS).getExampleText(), getZhSchemeExampleText("zh-sp-ms"));
    equal(loadKeyboard(Layout.ZH_SP_ZRM).getExampleText(), getZhSchemeExampleText("zh-sp-zrm"));
    equal(loadKeyboard(Layout.ZH_QP).getExampleText(), getZhSchemeExampleText("zh-qp"));
  });
});

test("keyboard.zhScheme persistence across EN <-> ZH switches and JSON round-trip", () => {
  const initial = new Settings();
  equal(resolveZhScheme(initial), Layout.ZH_SP);

  // Legacy zh-qp settings without explicit keyboard.zhScheme must inherit zh-qp.
  const legacyQp = initial
    .set(keyboardProps.language, Language.ZH_QP)
    .set(keyboardProps.layout, Layout.ZH_QP);
  equal(resolveZhScheme(legacyQp), Layout.ZH_QP);

  // Switching legacy zh-qp -> English -> Chinese preserves zh-qp across JSON round-trip!
  const toEnFromQp = switchPracticeLanguage(legacyQp, "en");
  equal(toEnFromQp.get(keyboardProps.language), Language.EN);
  equal(toEnFromQp.get(keyboardProps.layout), Layout.EN_US);
  equal(toEnFromQp.get(keyboardProps.zhScheme), Layout.ZH_QP);

  const reloadedEn = new Settings(toEnFromQp.toJSON());
  equal(resolveZhScheme(reloadedEn), Layout.ZH_QP);
  const backToZh = switchPracticeLanguage(reloadedEn, "zh");
  equal(backToZh.get(keyboardProps.language), Language.ZH_QP);
  equal(backToZh.get(keyboardProps.layout), Layout.ZH_QP);

  // Selecting Microsoft Shuangpin updates both zhScheme and active layout when on Chinese.
  const toMs = setZhScheme(backToZh, Layout.ZH_SP_MS);
  const msOpts = KeyboardOptions.from(toMs);
  equal(msOpts.language, Language.ZH_SP);
  equal(msOpts.layout, Layout.ZH_SP_MS);
  equal(toMs.get(keyboardProps.zhScheme), Layout.ZH_SP_MS);

  // Switching to EN -> reload -> selecting Sogou while on EN -> switching back to ZH activates Sogou!
  const msToEn = switchPracticeLanguage(toMs, "en");
  const enPickSogou = setZhScheme(new Settings(msToEn.toJSON()), Layout.ZH_SP_SG);
  equal(enPickSogou.get(keyboardProps.language), Language.EN);
  equal(enPickSogou.get(keyboardProps.layout), Layout.EN_US);
  equal(enPickSogou.get(keyboardProps.zhScheme), Layout.ZH_SP_SG);

  const enToSg = switchPracticeLanguage(enPickSogou, "zh");
  equal(enToSg.get(keyboardProps.language), Language.ZH_SP);
  equal(enToSg.get(keyboardProps.layout), Layout.ZH_SP_SG);
});
