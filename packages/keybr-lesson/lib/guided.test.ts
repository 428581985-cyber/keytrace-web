import { describe, it, test } from "node:test";
import { type Language, Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel, Letter } from "@keybr/phonetic-model";
import { LCG } from "@keybr/rand";
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
    const lesson = new GuidedLesson(settings, keyboard, model, words);

    deepEqual([...lesson.idioms], ["yixinyiyi", "jingshenwenming"]);
    deepEqual([...lesson.dictionary], ["zhongguo", "zhuangkuang", "fangan"]);

    // Full alphabet is unlocked immediately for zh-qp.
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));
    equal(lessonKeys.findIncludedKeys().length, 26);

    // Idiom ratio 1 draws exclusively from idioms when focused key is present.
    const focusIStats = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => [
        letter,
        letter.codePoint === "i".codePointAt(0)! ? 0.2 : 1.2,
        letter.codePoint === "i".codePointAt(0)! ? 0.2 : 1.2,
      ]),
    );
    const idiomOnlyLesson = new GuidedLesson(
      settings.set(lessonProps.idioms, 1),
      keyboard,
      model,
      words,
    );
    const idiomKeys = idiomOnlyLesson.update(focusIStats);
    const generated = idiomOnlyLesson.generate(idiomKeys, LCG(7));
    const drawn = generated.split(/[ ,.]+/).filter(Boolean);
    equal(drawn.length > 0, true);
    for (const word of drawn) {
      equal(
        word === "yixinyiyi" || word === "jingshenwenming",
        true,
      );
    }
  });

  it("isolates zh-qp and zh-sp lockedFocusKey and drillFocusKey in localStorage", () => {
    withMockLocalStorage((store) => {
      const settings = new Settings().set(lessonProps.guided.recoverKeys, false);

      const spKeyboard = loadKeyboard(Layout.ZH_SP);
      const spModel = makeFullAlphabetZhModel(spKeyboard.layout.language);
      const spLesson = new GuidedLesson(settings, spKeyboard, spModel, [
        "dage",
        "ykgo",
      ]);

      const qpKeyboard = loadKeyboard(Layout.ZH_QP);
      const qpModel = makeFullAlphabetZhModel(qpKeyboard.layout.language);
      const qpLesson = new GuidedLesson(settings, qpKeyboard, qpModel, [
        "zhongguo",
        "fangan",
      ]);

      const makeStats = (
        letters: readonly Letter[],
        weakChar: string,
      ) =>
        fakeKeyStatsMap(
          settings,
          letters.map((letter) => {
            const isWeak = letter.codePoint === weakChar.codePointAt(0)!;
            return [letter, isWeak ? 0.25 : 1.2, isWeak ? 0.25 : 1.2];
          }),
        );

      // Lock 'b' in zh-sp -> writes keybr.zh.lockedFocusKey only.
      const spKeys = spLesson.update(makeStats(spLesson.letters, "b"));
      equal(spKeys.findFocusedKey()?.letter.codePoint, "b".codePointAt(0)!);
      equal(store.get("keybr.zh.lockedFocusKey"), "b");
      equal(store.get("keybr.zh-qp.lockedFocusKey"), undefined);

      // Lock 'v' in zh-qp -> writes keybr.zh-qp.lockedFocusKey and does NOT inherit 'b' from zh-sp.
      const qpKeys = qpLesson.update(makeStats(qpLesson.letters, "v"));
      equal(qpKeys.findFocusedKey()?.letter.codePoint, "v".codePointAt(0)!);
      equal(store.get("keybr.zh-qp.lockedFocusKey"), "v");
      equal(store.get("keybr.zh.lockedFocusKey"), "b");

      // Drill override for zh-qp only affects zh-qp and leaves zh-sp drill override untouched.
      store.set("keybr.zh.drillFocusKey", "f");
      store.set("keybr.zh-qp.drillFocusKey", "p");

      const qpDrilled = qpLesson.update(makeStats(qpLesson.letters, "v"));
      equal(qpDrilled.findFocusedKey()?.letter.codePoint, "p".codePointAt(0)!);
      equal(store.get("keybr.zh-qp.drillFocusKey"), undefined);
      equal(store.get("keybr.zh-qp.lockedFocusKey"), "p");
      equal(store.get("keybr.zh.drillFocusKey"), "f");

      const spDrilled = spLesson.update(makeStats(spLesson.letters, "b"));
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
    const lesson = new GuidedLesson(settings, keyboard, model, [
      ...vWords,
      "zhongguo",
      "fangan",
    ]);

    const stats = fakeKeyStatsMap(
      settings,
      lesson.letters.map((letter) => {
        const isV = letter.codePoint === "v".codePointAt(0)!;
        return [letter, isV ? 0.2 : 1.2, isV ? 0.2 : 1.2];
      }),
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
    const largeVPool = Array.from({ length: 20 }, (_, i) => `lvword${String.fromCodePoint(0x61 + i)}`);
    const largeLesson = new GuidedLesson(settings, keyboard, model, largeVPool);
    const largeKeys = largeLesson.update(stats);
    const frag1 = largeLesson.generate(largeKeys, LCG(99)).split(" ").filter(Boolean);
    const frag2 = largeLesson.generate(largeKeys, LCG(100)).split(" ").filter(Boolean);
    equal(new Set(frag1.slice(0, 16)).size, Math.min(16, frag1.length));
    const tail1 = new Set(frag1.slice(-Math.min(8, frag1.length)));
    equal(tail1.has(frag2[0]), false);
  });

  it("uses either punctuation or space between words in zh-qp, never both", () => {
    const keyboard = loadKeyboard(Layout.ZH_QP);
    const model = makeFullAlphabetZhModel(keyboard.layout.language);
    const words = ["zhongguo", "fangan", "shijian", "wenhua", "yanjiu", "lvyou"];

    const sHalf = new Settings().set(lessonProps.punctuators, 0.5);
    const lHalf = new GuidedLesson(sHalf, keyboard, model, words);
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
      const settings = new Settings().set(lessonProps.guided.recoverKeys, false);
      const lesson = new GuidedLesson(settings, keyboard, model, words);

      const hasSemicolon = lesson.letters.some((l) => l.codePoint === 0x003b);
      equal(hasSemicolon, true);

      const stats = fakeKeyStatsMap(
        settings,
        lesson.letters.map((letter) => {
          const isSemi = letter.codePoint === 0x003b;
          return [letter, isSemi ? 0.25 : 1.2, isSemi ? 0.25 : 1.2];
        }),
      );
      const keys = lesson.update(stats);
      equal(keys.findFocusedKey()?.letter.codePoint, 0x003b);
      equal(store.get("keybr.zh-sp-ms.lockedFocusKey"), ";");
      equal(store.get("keybr.zh.lockedFocusKey"), undefined);

      const generated = lesson.generate(keys, LCG(7));
      const drawn = generated.split(/[ ,.]+/).filter(Boolean);
      equal(drawn.length > 0, true);
      equal(drawn.every((w) => w.includes(";")), true);
    });
  });
});
