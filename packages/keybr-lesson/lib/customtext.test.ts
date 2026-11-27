import { describe, it, test } from "node:test";
import { type Language, Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { LCG } from "@keybr/rand";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isNull, isTrue } from "rich-assert";
import { CustomTextLesson } from "./customtext.ts";
import { LessonKey } from "./key.ts";
import { lessonProps } from "./settings.ts";
import { loadZhPinyinEngine } from "./zh-pinyin.ts";

class ZhFakePhoneticModel extends FakePhoneticModel {
  override readonly language: Language;

  constructor(language: Language) {
    super(["ab"]);
    this.language = language;
  }
}

test("provide key set", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(settings, keyboard, model);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  deepEqual(lessonKeys.findIncludedKeys(), [
    new LessonKey({
      letter: FakePhoneticModel.letter1,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter2,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter3,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter4,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter5,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter6,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter7,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter8,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter9,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter10,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
  ]);
  deepEqual(lessonKeys.findExcludedKeys(), []);
  isNull(lessonKeys.findFocusedKey());
});

test("generate text with empty settings", () => {
  const settings = new Settings().set(lessonProps.customText.content, "");
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new CustomTextLesson(settings, keyboard, model);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  equal(
    lesson.generate(lessonKeys, model.rng),
    "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ? " +
      "? ? ? ? ? ? ? ? ? ?",
  );
});

describe("generate text using settings", () => {
  const keyboard = loadKeyboard(Layout.EN_US);

  it("should transform to lower case", () => {
    const settings = new Settings()
      .set(lessonProps.customText.content, "Abc! Def? 123")
      .set(lessonProps.customText.lowercase, true)
      .set(lessonProps.customText.lettersOnly, true)
      .set(lessonProps.customText.randomize, false);
    const model = new FakePhoneticModel();
    const lesson = new CustomTextLesson(settings, keyboard, model);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "abc def abc def abc def abc def abc def abc def abc def abc def abc " +
        "def abc def abc def abc def abc def abc def abc def abc def abc def",
    );
  });

  it("should preserve case", () => {
    const settings = new Settings()
      .set(lessonProps.customText.content, "Abc! Def? 123")
      .set(lessonProps.customText.lowercase, false)
      .set(lessonProps.customText.lettersOnly, false)
      .set(lessonProps.customText.randomize, false);
    const model = new FakePhoneticModel();
    const lesson = new CustomTextLesson(settings, keyboard, model);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "Abc! Def? 123 Abc! Def? 123 Abc! Def? 123 Abc! Def? 123 Abc! Def? 123 " +
        "Abc! Def? 123 Abc! Def? 123 Abc! Def? 123 Abc! Def? 123 Abc!",
    );
  });
});

describe("generate randomized text using settings", () => {
  const keyboard = loadKeyboard(Layout.EN_US);

  it("should transform to lower case", () => {
    const settings = new Settings()
      .set(
        lessonProps.customText.content,
        "Abc! Def? 123 AAA aaa BBB bbb CCC ccc",
      )
      .set(lessonProps.customText.lowercase, true)
      .set(lessonProps.customText.lettersOnly, true)
      .set(lessonProps.customText.randomize, true);
    const model = new FakePhoneticModel();
    const lesson = new CustomTextLesson(settings, keyboard, model);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "abc aaa bbb abc aaa bbb abc aaa bbb abc aaa bbb abc aaa bbb abc aaa " +
        "bbb abc aaa bbb abc aaa bbb abc aaa bbb abc aaa bbb abc aaa bbb abc",
    );
  });

  it("should preserve case", () => {
    const settings = new Settings()
      .set(
        lessonProps.customText.content,
        "Abc! Def? 123 AAA aaa BBB bbb CCC ccc",
      )
      .set(lessonProps.customText.lowercase, false)
      .set(lessonProps.customText.lettersOnly, false)
      .set(lessonProps.customText.randomize, true);
    const model = new FakePhoneticModel();
    const lesson = new CustomTextLesson(settings, keyboard, model);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "Abc! AAA bbb Abc! AAA bbb Abc! AAA bbb Abc! AAA bbb Abc! AAA bbb Abc! " +
        "AAA bbb Abc! AAA bbb Abc! AAA bbb Abc! AAA bbb Abc! AAA bbb",
    );
  });
});

describe("zh custom text lesson generation", () => {
  it("generates annotated spans across Shuangpin (including MS ;) & Quanpin with independent zhContent", async () => {
    const engine = await loadZhPinyinEngine();
    const enContent = "Custom EN stays untouched";

    const spSettings = new Settings()
      .set(lessonProps.customText.content, enContent)
      .set(lessonProps.customText.zhContent, "银行行长 星星")
      .set(lessonProps.customText.lettersOnly, true)
      .set(lessonProps.customText.randomize, false);

    const msKeyboard = loadKeyboard(Layout.ZH_SP_MS);
    const spLesson = new CustomTextLesson(
      spSettings,
      msKeyboard,
      new ZhFakePhoneticModel(Layout.ZH_SP_MS.language),
      engine,
    );
    equal(spSettings.get(lessonProps.customText.content), enContent);
    equal(
      spLesson.letters.some((l) => l.codePoint === ";".codePointAt(0)),
      true,
    );
    const spKeys = spLesson.update(makeKeyStatsMap(spLesson.letters, []));
    const spStyled = spLesson.generate(spKeys, LCG(1));
    isTrue(Array.isArray(spStyled));
    // Verify 星星 includes ';' in Microsoft Shuangpin and 行 carries zhAlts.
    const spans = (spStyled as readonly unknown[]).filter(
      (
        x,
      ): x is {
        readonly text: string;
        readonly zhHanzi?: string;
        readonly zhAlts?: readonly string[];
      } => typeof x === "object" && x != null,
    );
    const hangSpan = spans.find((s) => s.zhHanzi === "行")!;
    equal(hangSpan.text, "hh");
    isTrue((hangSpan.zhAlts ?? []).includes("x;"));
    const xingSpan = spans.find((s) => s.zhHanzi === "星")!;
    equal(xingSpan.text, "x;");

    // Quanpin with inline punctuation preserves hanzi punctuation spans and exact syllables.
    const qpSettings = new Settings()
      .set(lessonProps.customText.zhContent, "西安，很美！")
      .set(lessonProps.customText.lettersOnly, false)
      .set(lessonProps.customText.randomize, false);
    const qpKeyboard = loadKeyboard(Layout.ZH_QP);
    const qpLesson = new CustomTextLesson(
      qpSettings,
      qpKeyboard,
      new ZhFakePhoneticModel(Layout.ZH_QP.language),
      engine,
    );
    const qpKeys = qpLesson.update(makeKeyStatsMap(qpLesson.letters, []));
    const qpStyled = qpLesson.generate(qpKeys, LCG(1));
    isTrue(Array.isArray(qpStyled));
    const qpSpans = (qpStyled as readonly unknown[]).filter(
      (x): x is { readonly text: string; readonly zhHanzi?: string } =>
        typeof x === "object" && x != null,
    );
    equal(qpSpans[0].text, "xi");
    equal(qpSpans[0].zhHanzi, "西");
    equal(qpSpans[1].text, "an");
    equal(qpSpans[1].zhHanzi, "安");
    equal(qpSpans[2].text, ",");
    equal(qpSpans[2].zhHanzi, "，");

    // Empty / non-Chinese content falls back safely to '?'.
    const emptyZh = new Settings().set(lessonProps.customText.zhContent, "123");
    const emptyLesson = new CustomTextLesson(
      emptyZh,
      qpKeyboard,
      new ZhFakePhoneticModel(Layout.ZH_QP.language),
      engine,
    );
    const emptyText = emptyLesson.generate(
      emptyLesson.update(makeKeyStatsMap(emptyLesson.letters, [])),
      LCG(1),
    );
    equal(typeof emptyText === "string" && emptyText.startsWith("?"), true);
  });
});
