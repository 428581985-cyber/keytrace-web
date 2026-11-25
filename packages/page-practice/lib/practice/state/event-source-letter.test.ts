import { test } from "node:test";
import { LessonKey, LessonKeys } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { ResultFaker } from "@keybr/result";
import { deepEqual } from "rich-assert";
import { LetterEvents } from "./event-source-letter.ts";
import { type LessonEvent } from "./event-types.ts";

const keyArgs = {
  samples: [],
  timeToType: null,
  bestTimeToType: null,
  confidence: null,
  bestConfidence: null,
};
const { letter1, letter2, letter3, letter4 } = FakePhoneticModel;
const key1 = new LessonKey({ ...keyArgs, letter: letter1 });
const key2 = new LessonKey({ ...keyArgs, letter: letter2 });
const key3 = new LessonKey({ ...keyArgs, letter: letter3 });
const key4 = new LessonKey({ ...keyArgs, letter: letter4 });

test("generate events", () => {
  // Arrange.

  const lesson = {
    lessonKeys: new LessonKeys([
      key1.asIncluded(),
      key2.asIncluded(),
      key3.asExcluded(),
      key4.asExcluded(),
    ]),
    update() {
      return lesson.lessonKeys;
    },
  };
  const keyStatsMap = {};

  const faker = new ResultFaker();
  const source = new LetterEvents(lesson as any, keyStatsMap as any);
  const events = new Set<LessonEvent>();
  const listener = events.add.bind(events);

  // Act.

  source.append(faker.nextResult(), listener);

  // Assert.

  deepEqual([...events], []);
  events.clear();

  // Act.

  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asIncluded(),
    key4.asExcluded(),
  ]);
  source.append(faker.nextResult(), listener);

  // Assert.

  deepEqual(
    [...events],
    [{ type: "new-letter", lessonKey: key3.asIncluded() }],
  );
  events.clear();

  // Act.

  source.append(faker.nextResult(), listener);

  // Assert.

  deepEqual([...events], []);
  events.clear();

  // Act.

  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asIncluded(),
    key4.asIncluded(),
  ]);
  source.append(faker.nextResult(), listener);

  // Assert.

  deepEqual(
    [...events],
    [{ type: "new-letter", lessonKey: key4.asIncluded() }],
  );
  events.clear();
});

test("emits focus-letter when focused key changes without double-toasting on unlock", () => {
  const lesson = {
    lessonKeys: new LessonKeys([
      key1.asFocused(),
      key2.asIncluded(),
      key3.asExcluded(),
      key4.asExcluded(),
    ]),
    update() {
      return lesson.lessonKeys;
    },
  };
  const keyStatsMap = {};
  const faker = new ResultFaker();
  const source = new LetterEvents(lesson as any, keyStatsMap as any);
  const events: LessonEvent[] = [];
  const listener = (event: LessonEvent) => {
    events.push(event);
  };

  // Same focus key -> no event.
  source.append(faker.nextResult(), listener);
  deepEqual([...events], []);

  // Focus moves from already-included key1 to already-included key2 -> emits focus-letter.
  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asFocused(),
    key3.asExcluded(),
    key4.asExcluded(),
  ]);
  source.append(faker.nextResult(), listener);
  deepEqual([...events], [{ type: "focus-letter", lessonKey: key2.asFocused() }]);
  events.length = 0;

  // Same focus key2 on subsequent lesson -> no duplicate event.
  source.append(faker.nextResult(), listener);
  deepEqual([...events], []);

  // Unlocking key3 and focusing key3 in the same step -> emits ONLY new-letter (no double toast).
  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asFocused(),
    key4.asExcluded(),
  ]);
  source.append(faker.nextResult(), listener);
  deepEqual([...events], [{ type: "new-letter", lessonKey: key3.asFocused() }]);
  events.length = 0;

  // Focus clears (all keys reached target) -> no event, resets tracked focus.
  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asIncluded(),
    key4.asExcluded(),
  ]);
  source.append(faker.nextResult(), listener);
  deepEqual([...events], []);

  // Focus later returns to key1 (e.g. regression below target) -> emits focus-letter.
  lesson.lessonKeys = new LessonKeys([
    key1.asFocused(),
    key2.asIncluded(),
    key3.asIncluded(),
    key4.asExcluded(),
  ]);
  source.append(faker.nextResult(), listener);
  deepEqual([...events], [{ type: "focus-letter", lessonKey: key1.asFocused() }]);
});

test("seeding with no-op listener syncs initial focus without emitting toast on reload", () => {
  const lesson = {
    lessonKeys: new LessonKeys([
      key1.asFocused(),
      key2.asIncluded(),
      key3.asIncluded(),
      key4.asIncluded(),
    ]),
    update() {
      return lesson.lessonKeys;
    },
  };
  const keyStatsMap = {};
  const faker = new ResultFaker();
  const source = new LetterEvents(lesson as any, keyStatsMap as any);
  const events: LessonEvent[] = [];

  // Simulate historical seeding changing focus to key3 silently.
  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asFocused(),
    key4.asIncluded(),
  ]);
  source.append(faker.nextResult(), () => {});

  // First live lesson keeps focus on key3 -> zero events.
  source.append(faker.nextResult(), (event) => {
    events.push(event);
  });
  deepEqual([...events], []);

  // Next live lesson switches focus to key4 -> emits focus-letter for key4.
  lesson.lessonKeys = new LessonKeys([
    key1.asIncluded(),
    key2.asIncluded(),
    key3.asIncluded(),
    key4.asFocused(),
  ]);
  source.append(faker.nextResult(), (event) => {
    events.push(event);
  });
  deepEqual([...events], [{ type: "focus-letter", lessonKey: key4.asFocused() }]);
});
