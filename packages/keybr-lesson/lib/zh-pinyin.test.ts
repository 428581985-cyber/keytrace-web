import { describe, it } from "node:test";
import { deepEqual, equal } from "rich-assert";
import {
  analyzeZhCustomText,
  applyZhPolyphoneOverride,
  encodeZhSyllableForScheme,
  loadZhPinyinEngine,
  normalizeZhSyllable,
} from "./zh-pinyin.ts";

describe("zh-pinyin normalization and encoding", () => {
  it("normalizes tones, umlauts, and scheme rules across all 5 Chinese schemes", () => {
    equal(normalizeZhSyllable("zhǎng"), "zhang");
    equal(normalizeZhSyllable("lǘ"), "lv");
    equal(normalizeZhSyllable("nüè"), "nve");
    equal(normalizeZhSyllable("jǔ"), "ju");
    equal(normalizeZhSyllable("lue"), "lve");
    equal(normalizeZhSyllable("nue"), "nve");
    equal(normalizeZhSyllable("m"), null);
    equal(normalizeZhSyllable("xyz"), null);

    equal(encodeZhSyllableForScheme("xing", "zh-sp"), "xk");
    equal(encodeZhSyllableForScheme("hang", "zh-sp"), "hh");
    equal(encodeZhSyllableForScheme("xing", "zh-sp-ms"), "x;");
    equal(encodeZhSyllableForScheme("xing", "zh-sp-sg"), "x;");
    equal(encodeZhSyllableForScheme("xing", "zh-sp-zrm"), "xy");
    equal(encodeZhSyllableForScheme("lv", "zh-sp-ms"), "ly");
    equal(encodeZhSyllableForScheme("lve", "zh-sp-ms"), "lv");
    equal(encodeZhSyllableForScheme("lve", "zh-sp-sg"), "lt");
    equal(encodeZhSyllableForScheme("zhuang", "zh-qp"), "zhuang");
  });
});

describe("zh-pinyin context disambiguation and 3-layer polyphone pipeline", () => {
  it("disambiguates contextual polyphones via real pinyin-pro engine and collapses tone-only homophones", async () => {
    const engine = await loadZhPinyinEngine();
    const analysis = analyzeZhCustomText(
      "银行 行长 重庆 重要 长大 长城 睡着了 会计 会议 中好",
      "zh-qp",
      engine,
      { lettersOnly: true },
    );

    const units = analysis.tokens.flatMap((token) =>
      token.kind === "word" ? token.units : [],
    );
    const bySummary = units.map((u) => `${u.hanzi}:${u.syllable}`);
    deepEqual(bySummary, [
      "银:yin",
      "行:hang",
      "行:hang",
      "长:zhang",
      "重:chong",
      "庆:qing",
      "重:zhong",
      "要:yao",
      "长:zhang",
      "大:da",
      "长:chang",
      "城:cheng",
      "睡:shui",
      "着:zhao",
      "了:le",
      "会:kuai",
      "计:ji",
      "会:hui",
      "议:yi",
      "中:zhong",
      "好:hao",
    ]);

    // Tone-only polyphones ('中', '好') MUST NOT be flagged as heteronyms!
    const flaggedHanzi = analysis.polyphones.map((p) => p.hanzi);
    equal(flaggedHanzi.includes("中"), false);
    equal(flaggedHanzi.includes("好"), false);
    equal(flaggedHanzi.includes("行"), true);
    equal(flaggedHanzi.includes("着"), true);
  });

  it("supports inline (pinyin) pinning and round-trip applyZhPolyphoneOverride", async () => {
    const engine = await loadZhPinyinEngine();
    const raw = "单(shan)老师和银行行长";
    const a1 = analyzeZhCustomText(raw, "zh-sp", engine, { lettersOnly: true });

    const units1 = a1.tokens.flatMap((t) => (t.kind === "word" ? t.units : []));
    equal(units1[0].hanzi, "单");
    equal(units1[0].syllable, "shan");
    equal(units1[0].code, "uj");

    const danOcc = a1.polyphones.find((p) => p.hanzi === "单")!;
    equal(danOcc.isPinned, true);
    equal(danOcc.selected, "shan");

    // Switching back to autoSelected strips the inline (pinyin) annotation cleanly.
    const reverted = applyZhPolyphoneOverride(raw, danOcc, danOcc.autoSelected);
    equal(reverted, "单老师和银行行长");

    // Pinning one occurrence in continuous text updates only that character.
    const a2 = analyzeZhCustomText(reverted, "zh-sp", engine, {
      lettersOnly: true,
    });
    const hangOcc = a2.polyphones.find((p) => p.hanzi === "行")!;
    const pinnedHang = applyZhPolyphoneOverride(reverted, hangOcc, "xing");
    equal(pinnedHang, "单老师和银行(xing)行长");
  });

  it("segments continuous paragraphs vs wordlists and handles lettersOnly & skipped chars", async () => {
    const engine = await loadZhPinyinEngine();
    const prose = "人工智能，机器学习123！";
    const withPunct = analyzeZhCustomText(prose, "zh-qp", engine, {
      lettersOnly: false,
    });
    equal(withPunct.totalHanzi, 8);
    equal(withPunct.skippedCount, 3); // "123"
    equal(
      withPunct.tokens.some((t) => t.kind === "punct" && t.punct === ","),
      true,
    );
    equal(
      withPunct.tokens.some((t) => t.kind === "punct" && t.punct === "!"),
      true,
    );
    // Internal segmented words within a continuous clause have spaceAfter=false.
    const firstWord = withPunct.tokens.find((t) => t.kind === "word")!;
    equal(firstWord.kind === "word" && firstWord.spaceAfter, false);

    const noPunct = analyzeZhCustomText(prose, "zh-qp", engine, {
      lettersOnly: true,
    });
    equal(
      noPunct.tokens.some((t) => t.kind === "punct"),
      false,
    );
    // Word right before stripped comma separates with spaceAfter=true.
    const words = noPunct.tokens.filter((t) => t.kind === "word");
    equal(words.length >= 2, true);
    const wordBeforeComma = words.find((w) =>
      w.units.some((u) => u.hanzi === "能"),
    );
    equal(wordBeforeComma?.kind === "word" && wordBeforeComma.spaceAfter, true);
  });
});
