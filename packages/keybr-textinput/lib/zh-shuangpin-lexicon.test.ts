import { describe, it } from "node:test";
import { encodePinyinSyllable } from "@keybr/keyboard";
import { equal, isNotNull, isTrue } from "rich-assert";
import { ZH_QP_SYLLABLE_TO_CHARS } from "./zh-quanpin-lexicon.ts";
import {
  getShuangpinWordList,
  resolveShuangpinChar,
  resolveShuangpinWord,
} from "./zh-shuangpin-lexicon.ts";

describe("zh-shuangpin-lexicon single-source derivation", () => {
  it("encodes every standard pinyin syllable in ZH_QP_SYLLABLE_TO_CHARS across all 4 Shuangpin schemes", () => {
    const syllables = Object.keys(ZH_QP_SYLLABLE_TO_CHARS);
    isTrue(syllables.length >= 400);

    for (const schemeId of [
      "zh-sp",
      "zh-sp-zrm",
      "zh-sp-ms",
      "zh-sp-sg",
    ] as const) {
      for (const s of syllables) {
        const code = encodePinyinSyllable(s, schemeId);
        equal(code.length, 2, `${schemeId} failed on syllable '${s}' -> '${code}'`);
        if (schemeId === "zh-sp" || schemeId === "zh-sp-zrm") {
          isTrue(/^[a-z]{2}$/.test(code), `${schemeId} unexpected code '${code}'`);
        } else {
          isTrue(/^[a-z][a-z;]$/.test(code), `${schemeId} unexpected code '${code}'`);
        }
      }
    }
  });

  it("derives > 4500 words and resolves words & semicolon syllables cleanly", () => {
    for (const schemeId of ["zh-sp-zrm", "zh-sp-ms", "zh-sp-sg"] as const) {
      const words = getShuangpinWordList(schemeId);
      isTrue(
        words.length > 4500,
        `${schemeId} derived only ${words.length} words`,
      );
    }

    equal(resolveShuangpinWord("jnxy", "zh-sp-zrm"), "进行");
    equal(resolveShuangpinWord("jnx;", "zh-sp-ms"), "进行");
    equal(resolveShuangpinWord("jnx;", "zh-sp-sg"), "进行");

    isTrue(getShuangpinWordList("zh-sp-ms").includes("jnx;"));
    isTrue(getShuangpinWordList("zh-sp-sg").includes("jnx;"));

    isNotNull(resolveShuangpinChar("x;", "zh-sp-ms"));
    isNotNull(resolveShuangpinChar("n;", "zh-sp-sg"));
  });
});
