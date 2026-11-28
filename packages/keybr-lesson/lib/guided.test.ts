import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, test } from "node:test";
import { type Language, Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel, Filter, Letter } from "@keybr/phonetic-model";
import { LCG } from "@keybr/rand";
import {
  KEY_STATS_HALF_LIFE_MS,
  type KeyStats,
  type KeyStatsMap,
  makeKeyStatsMap,
  ResultFaker,
  speedToTime,
  TextType,
} from "@keybr/result";
import { Settings } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { deepEqual, equal, isTrue } from "rich-assert";
import { fakeKeyStatsMap, printLessonKeys } from "./fakes.ts";
import { GuidedLesson, stripAlphabeticalTail } from "./guided.ts";
import { LessonKey } from "./key.ts";
import { lessonProps } from "./settings.ts";
import { Target } from "./target.ts";

test("provide key set", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel(["uno", "due", "tre"]);
  const lesson = new GuidedLesson(settings, keyboard, model, []);
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
      isFocused: true,
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
  ]);
  deepEqual(lessonKeys.findExcludedKeys(), [
    new LessonKey({
      letter: FakePhoneticModel.letter7,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: false,
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
      isIncluded: false,
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
      isIncluded: false,
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
      isIncluded: false,
      isFocused: false,
      isForced: false,
    }),
  ]);
  deepEqual(
    lessonKeys.findFocusedKey(),
    new LessonKey({
      letter: FakePhoneticModel.letter1,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: true,
      isForced: false,
    }),
  );
});

describe("generate text from a broken phonetic model", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);

  it("should generate from empty words", () => {
    const model = new FakePhoneticModel([""]);
    const lesson = new GuidedLesson(settings, keyboard, model, []);
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

  it("should generate from repeating words", () => {
    const model = new FakePhoneticModel(["x"]);
    const lesson = new GuidedLesson(settings, keyboard, model, []);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x " +
        "x x x x x x x x x x",
    );
  });
});

test("generate text with pseudo words", () => {
  const settings = new Settings().set(lessonProps.guided.naturalWords, false);
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel(["uno", "due", "tre"]);
  const lesson = new GuidedLesson(settings, keyboard, model, []);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  equal(
    lesson.generate(lessonKeys, model.rng),
    "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno due tre " +
      "uno",
  );
});

test("generate text with natural words", () => {
  const settings = new Settings().set(lessonProps.guided.naturalWords, true);
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel(["uno", "due", "tre"]);
  const lesson = new GuidedLesson(settings, keyboard, model, [
    "abcaa",
    "abcab",
    "abcac",
    "abcad",
    "abcae",
    "abcaf",
    "abcag",
    "abcah",
    "abcai",
    "abcaj",
    "abcba",
    "abcbb",
    "abcbc",
    "abcbd",
    "abcbe",
  ]);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  equal(
    lesson.generate(lessonKeys, model.rng),
    "abcaf abcbe abcaa abcaf abcbe abcaa abcaf abcbe abcaa abcaf abcbe abcaa " +
      "abcaf abcbe abcaa abcaf abcbe abcaa abcaf abcbe",
  );
});

describe("unlock keys", () => {
  const letter1 = FakePhoneticModel.letter1;
  const letter2 = FakePhoneticModel.letter2;
  const letter3 = FakePhoneticModel.letter3;
  const letter4 = FakePhoneticModel.letter4;
  const letter5 = FakePhoneticModel.letter5;
  const letter6 = FakePhoneticModel.letter6;
  const letter7 = FakePhoneticModel.letter7;
  const letter8 = FakePhoneticModel.letter8;
  const letter9 = FakePhoneticModel.letter9;
  const letter10 = FakePhoneticModel.letter10;

  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();

  function recoverOff(settings = new Settings()) {
    settings = settings.set(lessonProps.guided.recoverKeys, false);

    const lesson = new GuidedLesson(settings, keyboard, model, []);
    return { settings, lesson };
  }

  function recoverOn(settings = new Settings()) {
    settings = settings.set(lessonProps.guided.recoverKeys, true);
    const lesson = new GuidedLesson(settings, keyboard, model, []);
    return { settings, lesson };
  }

  describe("initial state", () => {
    it("recover off", () => {
      const { settings, lesson } = recoverOff();

      equal(
        printLessonKeys(
          lesson.update(
            fakeKeyStatsMap(settings, [
              [letter1, null, null], // A
              [letter2, null, null], // B
              [letter3, null, null], // C
              [letter4, null, null], // D
              [letter5, null, null], // E
              [letter6, null, null], // F
              [letter7, null, null], // G
              [letter8, null, null], // H
              [letter9, null, null], // I
              [letter10, null, null], // J
            ]),
          ),
        ),
        "[A]BCDEF",
      );
    });

    it("recover on", () => {
      const { settings, lesson } = recoverOn();

      equal(
        printLessonKeys(
          lesson.update(
            fakeKeyStatsMap(settings, [
              [letter1, null, null], // A
              [letter2, null, null], // B
              [letter3, null, null], // C
              [letter4, null, null], // D
              [letter5, null, null], // E
              [letter6, null, null], // F
              [letter7, null, null], // G
              [letter8, null, null], // H
              [letter9, null, null], // I
              [letter10, null, null], // J
            ]),
          ),
        ),
        "[A]BCDEF",
      );
    });
  });

  describe("the unlocked key has no confidence level", () => {
    describe("all previous keys are now above the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });
    });

    describe("all previous keys were once above the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 0.9, 1], // A
                [letter2, 0.9, 1], // B
                [letter3, 0.9, 1], // C
                [letter4, 0.9, 1], // D
                [letter5, 0.9, 1], // E
                [letter6, 0.9, 1], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 0.9, 1], // A
                [letter2, 0.9, 1], // B
                [letter3, 0.9, 1], // C
                [letter4, 0.9, 1], // D
                [letter5, 0.9, 1], // E
                [letter6, 0.9, 1], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "[A]BCDEFJ",
        );
      });
    });
  });

  describe("the unlocked key has a low confidence level", () => {
    describe("all previous keys are now above the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 0.5, 0.5], // G
                [letter8, 0.5, 0.5], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 0.5, 0.5], // G
                [letter8, 0.5, 0.5], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });
    });

    describe("all previous keys were once above the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 0.9, 1], // A
                [letter2, 0.9, 1], // B
                [letter3, 0.9, 1], // C
                [letter4, 0.9, 1], // D
                [letter5, 0.9, 1], // E
                [letter6, 0.9, 1], // F
                [letter7, 0.5, 0.5], // G
                [letter8, 0.5, 0.5], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEF[G]J",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 0.9, 1], // A
                [letter2, 0.9, 1], // B
                [letter3, 0.9, 1], // C
                [letter4, 0.9, 1], // D
                [letter5, 0.9, 1], // E
                [letter6, 0.9, 1], // F
                [letter7, 0.5, 0.5], // G
                [letter8, 0.5, 0.5], // H
                [letter9, null, null], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "[A]BCDEFJ",
        );
      });
    });
  });

  describe("all keys are unlocked", () => {
    describe("some keys are below the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 1, 1], // G
                [letter8, 1, 1], // H
                [letter9, 1, 1], // I
                [letter10, 0.9, 1], // J
              ]),
            ),
          ),
          "ABCDEFGHIJ",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 1, 1], // G
                [letter8, 1, 1], // H
                [letter9, 1, 1], // I
                [letter10, 0.9, 1], // J
              ]),
            ),
          ),
          "ABCDEFGHI[J]",
        );
      });
    });

    describe("all keys are above the target speed", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 1, 1], // G
                [letter8, 1, 1], // H
                [letter9, 1, 1], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEFGHIJ",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn();

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, 1, 1], // A
                [letter2, 1, 1], // B
                [letter3, 1, 1], // C
                [letter4, 1, 1], // D
                [letter5, 1, 1], // E
                [letter6, 1, 1], // F
                [letter7, 1, 1], // G
                [letter8, 1, 1], // H
                [letter9, 1, 1], // I
                [letter10, 1, 1], // J
              ]),
            ),
          ),
          "ABCDEFGHIJ",
        );
      });
    });
  });

  describe("manually unlock keys", () => {
    describe("initial state", () => {
      it("recover off", () => {
        const { settings, lesson } = recoverOff(
          new Settings().set(lessonProps.guided.alphabetSize, 1),
        );

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, null, null], // A
                [letter2, null, null], // B
                [letter3, null, null], // C
                [letter4, null, null], // D
                [letter5, null, null], // E
                [letter6, null, null], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, null, null], // J
              ]),
            ),
          ),
          "[A]BCDEF!G!H!I!J",
        );
      });

      it("recover on", () => {
        const { settings, lesson } = recoverOn(
          new Settings().set(lessonProps.guided.alphabetSize, 1),
        );

        equal(
          printLessonKeys(
            lesson.update(
              fakeKeyStatsMap(settings, [
                [letter1, null, null], // A
                [letter2, null, null], // B
                [letter3, null, null], // C
                [letter4, null, null], // D
                [letter5, null, null], // E
                [letter6, null, null], // F
                [letter7, null, null], // G
                [letter8, null, null], // H
                [letter9, null, null], // I
                [letter10, null, null], // J
              ]),
            ),
          ),
          "[A]BCDEF!G!H!I!J",
        );
      });
    });
  });
});

describe("zh-sp punctuation separator", () => {
  it("uses either punctuation or space between words, never both", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const model = new FakePhoneticModel(["dage", "ykgo", "uiwu", "glxi"]);
    Object.defineProperty(model, "language", {
      value: keyboard.layout.language,
    });

    const words = ["dage", "ykgo", "uiwu", "glxi", "haha", "wowo"];

    const s0 = new Settings().set(lessonProps.punctuators, 0);
    const l0 = new GuidedLesson(s0, keyboard, model, words);
    const k0 = l0.update(makeKeyStatsMap(l0.letters, []));
    const text0 = l0.generate(k0, model.rng);
    equal(/[,.]/.test(text0), false);
    equal(/ +/.test(text0), true);

    const sHalf = new Settings().set(lessonProps.punctuators, 0.5);
    const lHalf = new GuidedLesson(sHalf, keyboard, model, words);
    const kHalf = lHalf.update(makeKeyStatsMap(lHalf.letters, []));
    const textHalf = lHalf.generate(kHalf, model.rng);
    equal(/[,.]\s|\s[,.]/.test(textHalf), false);
    equal(/[,.]/.test(textHalf), true);
    equal(/ /.test(textHalf), true);

    const sFull = new Settings().set(lessonProps.punctuators, 1);
    const lFull = new GuidedLesson(sFull, keyboard, model, words);
    const kFull = lFull.update(makeKeyStatsMap(lFull.letters, []));
    const textFull = lFull.generate(kFull, model.rng);
    equal(/ /.test(textFull), false);
    equal(/[,.]/.test(textFull), true);
    equal(/[,.]\s|\s[,.]/.test(textFull), false);
  });
});

describe("zh-sp sticky weak-key focus and word inclusion", () => {
  it("locks on weakest real-time confidence key until reaching target (>= 1), then switches", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const model = new FakePhoneticModel([
      "abcd",
      "abef",
      "bcef",
      "ghij",
      "cdef",
    ]);
    Object.defineProperty(model, "language", {
      value: keyboard.layout.language,
    });
    const words = ["abcd", "abef", "bcef", "ghij", "cdef"];
    const settings = new Settings().set(lessonProps.guided.recoverKeys, false);
    const lesson = new GuidedLesson(settings, keyboard, model, words, {
      unlockAllKeys: true,
    });

    const makeStats = (overrides: Record<number, [number, number]>) =>
      fakeKeyStatsMap(
        settings,
        model.letters.map((letter) => {
          const entry = overrides[letter.codePoint];
          return [
            letter,
            entry != null ? entry[0] : 1.2,
            entry != null ? entry[1] : 1.2,
          ];
        }),
        keyboard.layout,
      );

    // b (letter2) has real-time confidence 0.25 even though bestConfidence was 1.5;
    // c (letter3) has confidence 0.45 -> must focus B as real-time weakest.
    const k1 = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [0.25, 1.5],
        [model.letters[2].codePoint]: [0.45, 0.9],
      }),
    );
    equal(k1.findFocusedKey()?.letter.codePoint, model.letters[1].codePoint);

    // c drops to 0.10, while b is still 0.50 (< 1.0) -> stay locked on b!
    const k2 = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [0.5, 1.5],
        [model.letters[2].codePoint]: [0.1, 0.9],
      }),
    );
    equal(k2.findFocusedKey()?.letter.codePoint, model.letters[1].codePoint);

    // persistFocus: false previewing a hypothetical target where b >= 1 must not clobber lock
    const kPreview = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [1.1, 1.5],
        [model.letters[2].codePoint]: [0.4, 0.9],
      }),
      { persistFocus: false },
    );
    equal(
      kPreview.findFocusedKey()?.letter.codePoint,
      model.letters[2].codePoint,
    );

    // With lock intact, returning to b = 0.6 (< 1) still keeps lock on b.
    const k2After = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [0.6, 1.5],
        [model.letters[2].codePoint]: [0.2, 0.9],
      }),
    );
    equal(
      k2After.findFocusedKey()?.letter.codePoint,
      model.letters[1].codePoint,
    );

    // Now b truly hits confidence >= 1.0 -> unlock and switch to next weakest (c).
    const k3 = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [1.05, 1.5],
        [model.letters[2].codePoint]: [0.2, 0.9],
      }),
    );
    equal(k3.findFocusedKey()?.letter.codePoint, model.letters[2].codePoint);
  });

  it("includes focused key in every generated word", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const model = new FakePhoneticModel(["abcd", "efgh", "ijab"]);
    Object.defineProperty(model, "language", {
      value: keyboard.layout.language,
    });
    const words = ["abcd", "efgh", "ghij", "abgh", "ijcd"];
    const settings = new Settings().set(lessonProps.punctuators, 0.4);
    const lesson = new GuidedLesson(settings, keyboard, model, words, {
      unlockAllKeys: true,
    });

    const stats = fakeKeyStatsMap(
      settings,
      model.letters.map((letter) => [
        letter,
        letter.codePoint === model.letters[9].codePoint ? 0.2 : 1.2,
        letter.codePoint === model.letters[9].codePoint ? 0.2 : 1.2,
      ]),
      keyboard.layout,
    );
    const lessonKeys = lesson.update(stats);
    equal(
      lessonKeys.findFocusedKey()?.letter.codePoint,
      model.letters[9].codePoint,
    ); // 'j'

    const generated = lesson.generate(lessonKeys, model.rng);
    const generatedWords = generated.split(/[ ,.]+/).filter(Boolean);
    equal(generatedWords.length > 0, true);
    for (const word of generatedWords) {
      equal(word.includes("j"), true);
    }
  });
});

function makeFullAlphabetZhModel(language: Language): FakePhoneticModel {
  const letters: Letter[] = [];
  for (let i = 0; i < 26; i++) {
    const cp = 0x61 + i;
    letters.push(
      new Letter(cp, (26 - i) / 351, String.fromCodePoint(cp).toUpperCase()),
    );
  }
  const model = new FakePhoneticModel(["zhongguo", "fangan"]);
  Object.defineProperty(model, "language", { value: language });
  Object.defineProperty(model, "letters", { value: letters });
  return model;
}

function withMockLocalStorage(fn: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
  const prevDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  try {
    fn(store);
  } finally {
    if (prevDescriptor != null) {
      Object.defineProperty(globalThis, "localStorage", prevDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
}

describe("zh-qp guided lesson", () => {
  it("partitions idioms using isQuanpinIdiom rather than 8-letter length", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const words = [
      "zhongguo", // 8 letters, 2-char common word -> NOT idiom
      "zhuangkuang", // 11 letters, 2-char common word -> NOT idiom
      "fangan", // 6 letters, 2-char common word -> NOT idiom
      "yixinyiyi", // 9 letters, 4-char idiom -> idiom
      "jingshenwenming", // 15 letters, 4-char idiom -> idiom
    ];
    const settings = new Settings();
    const lesson = new GuidedLesson(settings, keyboard, model, words, {
      unlockAllKeys: true,
    });

    deepEqual([...lesson.idioms], ["yixinyiyi", "jingshenwenming"]);
    deepEqual([...lesson.dictionary], ["zhongguo", "zhuangkuang", "fangan"]);

    // Full alphabet is unlocked cleanly (included, never forced) in KeyTrace mode.
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));
    equal(lessonKeys.findIncludedKeys().length, 26);
    equal(
      lessonKeys.findIncludedKeys().every((k) => !k.isForced),
      true,
    );

    // Idiom ratio 1 draws exclusively from idioms when focused key is present.
    const focusIStats = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => [
        letter,
        letter.codePoint === "i".codePointAt(0)! ? 0.2 : 1.2,
        letter.codePoint === "i".codePointAt(0)! ? 0.2 : 1.2,
      ]),
      keyboard.layout,
    );
    const idiomOnlyLesson = new GuidedLesson(
      settings.set(lessonProps.idioms, 1),
      keyboard,
      model,
      words,
      { unlockAllKeys: true },
    );
    const idiomKeys = idiomOnlyLesson.update(focusIStats);
    const generated = idiomOnlyLesson.generate(idiomKeys, LCG(7));
    const drawn = generated.split(/[ ,.]+/).filter(Boolean);
    equal(drawn.length > 0, true);
    for (const word of drawn) {
      equal(word === "yixinyiyi" || word === "jingshenwenming", true);
    }
  });

  it("isolates zh-qp and zh-sp lockedFocusKey and drillFocusKey in localStorage", () => {
    withMockLocalStorage((store) => {
      const settings = new Settings().set(
        lessonProps.guided.recoverKeys,
        false,
      );

      const spKeyboard = loadKeyboard(Layout.ZH_SP);
      const spModel = makeFullAlphabetZhModel(spKeyboard.layout.language);
      const spLesson = new GuidedLesson(
        settings,
        spKeyboard,
        spModel,
        ["dage", "ykgo"],
        { unlockAllKeys: true },
      );

      const qpKeyboard = loadKeyboard(Layout.ZH_QP);
      const qpModel = makeFullAlphabetZhModel(qpKeyboard.layout.language);
      const qpLesson = new GuidedLesson(
        settings,
        qpKeyboard,
        qpModel,
        ["zhongguo", "fangan"],
        { unlockAllKeys: true },
      );

      const makeStats = (
        letters: readonly Letter[],
        weakChar: string,
        layout: Layout,
      ) =>
        fakeKeyStatsMap(
          settings,
          letters.map((letter) => {
            const isWeak = letter.codePoint === weakChar.codePointAt(0)!;
            return [letter, isWeak ? 0.25 : 1.2, isWeak ? 0.25 : 1.2];
          }),
          layout,
        );

      // Lock 'b' in zh-sp -> writes keybr.zh.lockedFocusKey only.
      const spKeys = spLesson.update(
        makeStats(spLesson.letters, "b", spKeyboard.layout),
      );
      equal(spKeys.findFocusedKey()?.letter.codePoint, "b".codePointAt(0)!);
      equal(store.get("keybr.zh.lockedFocusKey"), "b");
      equal(store.get("keybr.zh-qp.lockedFocusKey"), undefined);

      // Lock 'v' in zh-qp -> writes keybr.zh-qp.lockedFocusKey and does NOT inherit 'b' from zh-sp.
      const qpKeys = qpLesson.update(
        makeStats(qpLesson.letters, "v", qpKeyboard.layout),
      );
      equal(qpKeys.findFocusedKey()?.letter.codePoint, "v".codePointAt(0)!);
      equal(store.get("keybr.zh-qp.lockedFocusKey"), "v");
      equal(store.get("keybr.zh.lockedFocusKey"), "b");

      // Drill override for zh-qp only affects zh-qp and leaves zh-sp drill override untouched.
      store.set("keybr.zh.drillFocusKey", "f");
      store.set("keybr.zh-qp.drillFocusKey", "p");

      const qpDrilled = qpLesson.update(
        makeStats(qpLesson.letters, "v", qpKeyboard.layout),
      );
      equal(qpDrilled.findFocusedKey()?.letter.codePoint, "p".codePointAt(0)!);
      equal(store.get("keybr.zh-qp.drillFocusKey"), undefined);
      equal(store.get("keybr.zh-qp.lockedFocusKey"), "p");
      equal(store.get("keybr.zh.drillFocusKey"), "f");

      const spDrilled = spLesson.update(
        makeStats(spLesson.letters, "b", spKeyboard.layout),
      );
      equal(spDrilled.findFocusedKey()?.letter.codePoint, "f".codePointAt(0)!);
      equal(store.get("keybr.zh.drillFocusKey"), undefined);
      equal(store.get("keybr.zh.lockedFocusKey"), "f");
      equal(store.get("keybr.zh-qp.lockedFocusKey"), "p");
    });
  });

  it("applies recent-word cooldown window to avoid repetition on low-frequency keys like v", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const vWords = [
      "lvyou",
      "lvse",
      "nvshi",
      "zhanlve",
      "nvedai",
      "lvxing",
      "lvshi",
      "lvcha",
      "nvyou",
      "jilv",
    ];
    const settings = new Settings()
      .set(lessonProps.idioms, 0)
      .set(lessonProps.punctuators, 0)
      .set(lessonProps.length, 0.5);
    const lesson = new GuidedLesson(
      settings,
      keyboard,
      model,
      [...vWords, "zhongguo", "fangan"],
      { unlockAllKeys: true },
    );

    const stats = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => {
        const isV = letter.codePoint === "v".codePointAt(0)!;
        return [letter, isV ? 0.2 : 1.2, isV ? 0.2 : 1.2];
      }),
      keyboard.layout,
    );
    const lessonKeys = lesson.update(stats);
    equal(lessonKeys.findFocusedKey()?.letter.codePoint, "v".codePointAt(0)!);

    const rng = LCG(12345);
    const generated = lesson.generate(lessonKeys, rng);
    const drawn = generated.split(" ").filter(Boolean);
    equal(drawn.length >= vWords.length, true);

    // Every generated word contains 'v'.
    for (const word of drawn) {
      equal(word.includes("v"), true);
    }
    // No back-to-back identical words.
    for (let i = 1; i < drawn.length; i++) {
      equal(drawn[i] !== drawn[i - 1], true);
    }
    // All 10 distinct words must be exhausted before any word repeats.
    const firstBatch = new Set(drawn.slice(0, vWords.length));
    equal(firstBatch.size, vWords.length);

    // With a 20-word pool, a 16-word cooldown prevents repeats across the first 16 draws
    // and keeps the start of the next lesson fresh from the tail of the prior lesson.
    const largeVPool = Array.from(
      { length: 20 },
      (_, i) => `lvword${String.fromCodePoint(0x61 + i)}`,
    );
    const largeLesson = new GuidedLesson(
      settings,
      keyboard,
      model,
      largeVPool,
      {
        unlockAllKeys: true,
      },
    );
    const largeKeys = largeLesson.update(stats);
    const frag1 = largeLesson
      .generate(largeKeys, LCG(99))
      .split(" ")
      .filter(Boolean);
    const frag2 = largeLesson
      .generate(largeKeys, LCG(100))
      .split(" ")
      .filter(Boolean);
    equal(new Set(frag1.slice(0, 16)).size, Math.min(16, frag1.length));
    const tail1 = new Set(frag1.slice(-Math.min(8, frag1.length)));
    equal(tail1.has(frag2[0]), false);
  });

  it("uses either punctuation or space between words in zh-qp, never both", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const words = [
      "zhongguo",
      "fangan",
      "shijian",
      "wenhua",
      "yanjiu",
      "lvyou",
    ];

    const sHalf = new Settings().set(lessonProps.punctuators, 0.5);
    const lHalf = new GuidedLesson(sHalf, keyboard, model, words, {
      unlockAllKeys: true,
    });
    const kHalf = lHalf.update(makeKeyStatsMap(lHalf.letters, []));
    const textHalf = lHalf.generate(kHalf, LCG(42));
    equal(/[,.]\s|\s[,.]/.test(textHalf), false);
    equal(/[,.]/.test(textHalf), true);
    equal(/ /.test(textHalf), true);
  });
});

describe("zh-sp-ms semicolon key integration", () => {
  it("includes semicolon in letters, targets it as weakest key, and isolates localStorage", () => {
    withMockLocalStorage((store) => {
      const keyboard = loadKeyboard(Layout.ZH_SP_MS);
      const model = makeFullAlphabetZhModel(keyboard.layout.language);
      const words = ["jnx;", "mztm", "tiug", "dax;"];
      const settings = new Settings().set(
        lessonProps.guided.recoverKeys,
        false,
      );
      const lesson = new GuidedLesson(settings, keyboard, model, words, {
        unlockAllKeys: true,
      });

      const hasSemicolon = lesson.letters.some((l) => l.codePoint === 0x003b);
      equal(hasSemicolon, true);

      const stats = fakeKeyStatsMap(
        settings,
        lesson.letters.map((letter) => {
          const isSemi = letter.codePoint === 0x003b;
          return [letter, isSemi ? 0.25 : 1.2, isSemi ? 0.25 : 1.2];
        }),
        keyboard.layout,
      );
      const keys = lesson.update(stats);
      equal(keys.findFocusedKey()?.letter.codePoint, 0x003b);
      equal(store.get("keybr.zh-sp-ms.lockedFocusKey"), ";");
      equal(store.get("keybr.zh.lockedFocusKey"), undefined);

      const generated = lesson.generate(keys, LCG(7));
      const drawn = generated.split(/[ ,.]+/).filter(Boolean);
      equal(drawn.length > 0, true);
      equal(
        drawn.every((w) => w.includes(";")),
        true,
      );
    });
  });
});

describe("standalone progressive Chinese curriculum vs KeyTrace unlockAllKeys", () => {
  it("starts standalone zh-sp with 6 curriculum keys (iujdgs) and unlocks v as 7th", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const words = [
      "gssi",
      "jiuu",
      "ugij",
      "djui",
      "igui",
      "uiji",
      "ijug",
      "jiiu",
      "gsig",
      "jidi",
      "vgvi",
      "vidu",
      "vjvg",
    ];
    const settings = new Settings();
    const lesson = new GuidedLesson(settings, keyboard, model, words);

    const k0 = lesson.update(makeKeyStatsMap(lesson.letters, []));
    const inc0 = k0
      .findIncludedKeys()
      .map((k) => String.fromCodePoint(k.letter.codePoint))
      .join("");
    equal(inc0, "iujdgs");
    equal(k0.findExcludedKeys().length, 20);
    equal(
      k0.findIncludedKeys().every((k) => !k.isForced),
      true,
    );
    equal(k0.findFocusedKey()?.letter.codePoint, "i".codePointAt(0)!);

    // Generated text in stage 1 only uses the 6 unlocked keys.
    const text0 = lesson.generate(k0, LCG(1));
    const drawn0 = text0.split(/[ ,.]+/).filter(Boolean);
    equal(drawn0.length > 0, true);
    const allowed0 = new Set([..."iujdgs"]);
    for (const word of drawn0) {
      equal(
        [...word].every((ch) => allowed0.has(ch)),
        true,
      );
    }

    // Once all 6 keys reach zhTargetSpeed (bestConfidence >= 1), key #7 ('v') unlocks and becomes focused.
    const stats6Ready = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => {
        const ch = String.fromCodePoint(letter.codePoint);
        return allowed0.has(ch) ? [letter, 1.1, 1.1] : [letter, null, null];
      }),
      keyboard.layout,
    );
    const k1 = lesson.update(stats6Ready);
    const inc1 = k1
      .findIncludedKeys()
      .map((k) => String.fromCodePoint(k.letter.codePoint))
      .join("");
    equal(inc1, "iujdgsv");
    equal(k1.findFocusedKey()?.letter.codePoint, "v".codePointAt(0)!);
  });

  it("starts standalone zh-qp with 6 curriculum keys (inagjd) and unlocks x as 7th", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const words = [
      "jingji",
      "dajia",
      "niandai",
      "jidi",
      "jinnian",
      "jiji",
      "dangnian",
      "dangdi",
      "jinxing",
      "xianjin",
      "xinxi",
    ];
    const settings = new Settings();
    const lesson = new GuidedLesson(settings, keyboard, model, words);

    const k0 = lesson.update(makeKeyStatsMap(lesson.letters, []));
    const inc0 = k0
      .findIncludedKeys()
      .map((k) => String.fromCodePoint(k.letter.codePoint))
      .join("");
    equal(inc0, "inagjd");
    equal(k0.findExcludedKeys().length, 20);

    const allowed0 = new Set([..."inagjd"]);
    const stats6Ready = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => {
        const ch = String.fromCodePoint(letter.codePoint);
        return allowed0.has(ch) ? [letter, 1.1, 1.1] : [letter, null, null];
      }),
      keyboard.layout,
    );
    const k1 = lesson.update(stats6Ready);
    const inc1 = k1
      .findIncludedKeys()
      .map((k) => String.fromCodePoint(k.letter.codePoint))
      .join("");
    equal(inc1, "inagjdx");
    equal(k1.findFocusedKey()?.letter.codePoint, "x".codePointAt(0)!);
  });

  it("guards ahead-of-frontier zh auto-unlock against single-hit fuzzy noise", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const settings = new Settings();
    const lesson = new GuidedLesson(settings, keyboard, model, [
      "jingji",
      "dajia",
    ]);
    const target = new Target(settings, keyboard.layout);
    const fastTime = speedToTime(target.targetSpeed) / 1.2;

    const buildStats = (hSampleCount: number): KeyStatsMap => {
      const map = new Map<Letter, KeyStats>(
        lesson.letters.map((letter) => {
          if (letter.codePoint === "h".codePointAt(0)!) {
            const samples = Array.from({ length: hSampleCount }, (_, i) => ({
              index: i,
              timeStamp: 1000 + i * 1000,
              hitCount: 1,
              missCount: 0,
              timeToType: fastTime,
              filteredTimeToType: fastTime,
            }));
            return [
              letter,
              {
                letter,
                samples,
                timeToType: fastTime,
                bestTimeToType: fastTime,
              },
            ];
          }
          return [
            letter,
            {
              letter,
              samples: [],
              timeToType: null,
              bestTimeToType: null,
            },
          ];
        }),
      );
      return {
        letters: [...map.keys()],
        results: [],
        get: (letter) => map.get(letter)!,
        [Symbol.iterator]: () => map.values(),
      };
    };

    // 1 sample on locked 'h' (e.g. fuzzy consumeExtra) must NOT prematurely unlock 'h'.
    const k1 = lesson.update(buildStats(1));
    equal(k1.find("h".codePointAt(0)!)?.isIncluded, false);

    // 2+ samples with bestConfidence >= 1 unlocks 'h'.
    const k2 = lesson.update(buildStats(2));
    equal(k2.find("h".codePointAt(0)!)?.isIncluded, true);
  });

  it("suppresses tiny idiom pool (< 6) in standalone zh mode to prevent repetition", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    // All 4-char commons and 8-char idioms use only the stage-1 keys iujdgs.
    const commons = ["gssi", "jiuu", "ugij", "djui", "igui", "uiji", "ijug"];
    const twoIdioms = ["gssijiuu", "ugijdjui"];
    const settings = new Settings()
      .set(lessonProps.idioms, 1)
      .set(lessonProps.punctuators, 0);

    const lessonFew = new GuidedLesson(settings, keyboard, model, [
      ...commons,
      ...twoIdioms,
    ]);
    const keysFew = lessonFew.update(makeKeyStatsMap(lessonFew.letters, []));
    const drawnFew = lessonFew
      .generate(keysFew, LCG(7))
      .split(" ")
      .filter(Boolean);
    equal(drawnFew.length > 0, true);
    equal(
      drawnFew.every((w) => w.length === 4),
      true,
    );

    const sixIdioms = [
      "gssijiuu",
      "ugijdjui",
      "iguiuiji",
      "ijugjiiu",
      "gsigjidi",
      "jiiugssi",
    ];
    const lessonEnough = new GuidedLesson(settings, keyboard, model, [
      ...commons,
      ...sixIdioms,
    ]);
    const keysEnough = lessonEnough.update(
      makeKeyStatsMap(lessonEnough.letters, []),
    );
    const drawnEnough = lessonEnough
      .generate(keysEnough, LCG(7))
      .split(" ")
      .filter(Boolean);
    equal(drawnEnough.length > 0, true);
    equal(
      drawnEnough.every((w) => w.length === 8),
      true,
    );
  });

  it("unlocks all EN keys cleanly in KeyTrace mode and supports drillKey override", () => {
    withMockLocalStorage((store) => {
      const keyboard = loadKeyboard(Layout.EN_US);
      const model = new FakePhoneticModel(["uno", "due", "tre"]);
      const settings = new Settings().set(lessonProps.guided.alphabetSize, 0);
      const lesson = new GuidedLesson(settings, keyboard, model, [], {
        unlockAllKeys: true,
      });

      const stats = fakeKeyStatsMap(
        settings,
        lesson.letters.map((letter, idx) => [
          letter,
          idx === 8 ? 0.4 : 1.2,
          1.5, // even though bestConfidence >= 1, live confidence < 1 must be targeted
        ]),
      );

      const keys1 = lesson.update(stats);
      equal(keys1.findIncludedKeys().length, lesson.letters.length);
      equal(keys1.findExcludedKeys().length, 0);
      equal(
        keys1.findIncludedKeys().every((k) => !k.isForced),
        true,
      );
      equal(
        keys1.findFocusedKey()?.letter.codePoint,
        lesson.letters[8].codePoint,
      );

      // Drill override on EN key works in KeyTrace mode.
      const drillChar = String.fromCodePoint(lesson.letters[2].codePoint);
      store.set("keybr.en-us.drillFocusKey", drillChar);
      const keys2 = lesson.update(stats);
      equal(
        keys2.findFocusedKey()?.letter.codePoint,
        lesson.letters[2].codePoint,
      );
      equal(store.get("keybr.en-us.drillFocusKey"), undefined);
    });
  });

  it("strips rare alphabetical tail in EN natural dictionary and falls back to pseudo words when few letters are unlocked", () => {
    const enWords: string[] = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../../keybr-content-words/lib/data/words-en.json",
        ),
        "utf8",
      ),
    );

    const shortSorted = Array.from({ length: 20 }, (_, i) => `word${i}`);
    equal(stripAlphabeticalTail(shortSorted).length, 20);
    equal(stripAlphabeticalTail(enWords).length, 8436);

    const keyboard = loadKeyboard(Layout.EN_US);
    const fullAlphabet = "etaoinshrdlcumwfgypbvkjxqz".split("");
    class AlphabetFakeModel extends FakePhoneticModel {
      override readonly letters: readonly Letter[];

      constructor(words: readonly string[], letters: readonly Letter[]) {
        super(words);
        this.letters = letters;
      }
    }
    const model = new AlphabetFakeModel(
      ["zaz", "zeze", "zozo"],
      fullAlphabet.map(
        (ch, idx) => new Letter(ch.codePointAt(0)!, 1 - idx * 0.01),
      ),
    );
    const lesson = new GuidedLesson(new Settings(), keyboard, model, enWords, {
      unlockAllKeys: true,
    });
    const dictSet = new Set(lesson.dictionary);
    for (const rare of [
      "zonked",
      "fuzzbox",
      "gazebo",
      "kamikaze",
      "ziplock",
      "zirconium",
      "zither",
    ]) {
      equal(dictSet.has(rare), false);
    }
    for (const common of [
      "crazy",
      "size",
      "zero",
      "pizza",
      "quickly",
      "question",
    ]) {
      equal(dictSet.has(common), true);
    }

    // With only a rare 6-letter subset where <15 common words match, pseudo words top up the pool.
    const narrowLetters = ["e", "t", "a", "o", "z", "x"].map(
      (c, idx) => new Letter(c.codePointAt(0)!, 1 - idx * 0.1),
    );
    const narrowFilter = new Filter(narrowLetters, narrowLetters[4]);
    equal(lesson.dictionary.find(narrowFilter).length < 15, true);
    const smallModel = new AlphabetFakeModel(
      ["zaz", "zeze", "zozo"],
      narrowLetters,
    );
    const smallLesson = new GuidedLesson(
      new Settings(),
      keyboard,
      smallModel,
      enWords,
    );
    const smallKeys = smallLesson.update(
      makeKeyStatsMap(smallLesson.letters, []),
    );
    const text = smallLesson.generate(smallKeys, LCG(42));
    equal(
      text.includes("zaz") || text.includes("zeze") || text.includes("zozo"),
      true,
    );
  });

  it("time-decays stale KeyTrace misses when computing GuidedLesson key confidence and ZH sampling weights", () => {
    const keyboard = loadKeyboard(Layout.ZH_SP);
    const letters = [
      new Letter(0x0061, 0.9, "A"),
      new Letter(0x0065, 0.9, "E"),
      new Letter(0x0074, 0.4, "T"),
    ];
    class TinyZhModel extends FakePhoneticModel {
      override readonly language = keyboard.layout.language;
      override readonly letters = letters;
    }
    const wordList = ["aa", "ae", "ea", "te", "ta", "et"];
    const model = new TinyZhModel(wordList);
    const faker = new ResultFaker({ letters });
    const baseTs = 1_700_000_000_000;

    // 21 days ago: 't' was slow and had high KeyTrace misses.
    const oldKt = faker.nextResult({
      layout: Layout.ZH_SP,
      textType: TextType.KEYTRACE,
      timeStamp: baseTs,
      histogram: new Histogram([
        { codePoint: 0x0061, hitCount: 80, missCount: 0, timeToType: 180 },
        { codePoint: 0x0065, hitCount: 80, missCount: 0, timeToType: 180 },
        { codePoint: 0x0074, hitCount: 200, missCount: 40, timeToType: 700 },
      ]),
    });

    const settings = new Settings().set(lessonProps.targetSpeed, 175);
    const lesson = new GuidedLesson(settings, keyboard, model, wordList, {
      unlockAllKeys: true,
    });

    // Without recent clean practice, 't' is focused and dominates word generation.
    const staleStats = makeKeyStatsMap(letters, [oldKt]);
    const staleKeys = lesson.update(staleStats, { persistFocus: false });
    equal(staleKeys.findFocusedKey()?.letter.codePoint, 0x0074);

    // After clean deliberate web practice 21 days later, 't' recovers confidence >= 1
    // and focus moves away so 't' no longer dominates generation.
    const cleanRecent = Array.from({ length: 4 }, (_, i) =>
      faker.nextResult({
        layout: Layout.ZH_SP,
        textType: TextType.GENERATED,
        timeStamp: baseTs + 3 * KEY_STATS_HALF_LIFE_MS + i * 60_000,
        histogram: new Histogram([
          { codePoint: 0x0061, hitCount: 30, missCount: 0, timeToType: 180 },
          { codePoint: 0x0065, hitCount: 30, missCount: 0, timeToType: 180 },
          { codePoint: 0x0074, hitCount: 40, missCount: 0, timeToType: 170 },
        ]),
      }),
    );

    const recoveredStats = makeKeyStatsMap(letters, [oldKt, ...cleanRecent]);
    const recoveredKeys = lesson.update(recoveredStats, {
      persistFocus: false,
    });
    const tConfidence = recoveredKeys.find(0x0074)?.confidence ?? 0;
    isTrue(
      tConfidence >= 1,
      `Expected 21d decay + clean sessions to restore T confidence >= 1, got ${tConfidence}`,
    );
    equal(recoveredKeys.findFocusedKey(), null);
  });
});
