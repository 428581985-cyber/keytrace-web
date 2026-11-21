import { describe, it, test } from "node:test";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal } from "rich-assert";
import { fakeKeyStatsMap, printLessonKeys } from "./fakes.ts";
import { GuidedLesson } from "./guided.ts";
import { LessonKey } from "./key.ts";
import { lessonProps } from "./settings.ts";

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
    Object.defineProperty(model, "language", { value: keyboard.layout.language });

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
    const lesson = new GuidedLesson(settings, keyboard, model, words);

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
    equal(kPreview.findFocusedKey()?.letter.codePoint, model.letters[2].codePoint);

    // With lock intact, returning to b = 0.6 (< 1) still keeps lock on b.
    const k2After = lesson.update(
      makeStats({
        [model.letters[1].codePoint]: [0.6, 1.5],
        [model.letters[2].codePoint]: [0.2, 0.9],
      }),
    );
    equal(k2After.findFocusedKey()?.letter.codePoint, model.letters[1].codePoint);

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
    const lesson = new GuidedLesson(settings, keyboard, model, words);

    const stats = fakeKeyStatsMap(
      settings,
      model.letters.map((letter) => [
        letter,
        letter.codePoint === model.letters[9].codePoint ? 0.2 : 1.2,
        letter.codePoint === model.letters[9].codePoint ? 0.2 : 1.2,
      ]),
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
