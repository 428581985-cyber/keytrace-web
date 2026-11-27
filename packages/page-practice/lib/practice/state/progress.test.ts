import { test } from "node:test";
import {
  KeyboardOptions,
  Language,
  Layout,
  loadKeyboard,
} from "@keybr/keyboard";
import { GuidedLesson } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { ResultFaker, TextType } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { equal, isTrue } from "rich-assert";
import { type LessonEvent } from "./event-types.ts";
import { Progress } from "./progress.ts";

function makeProgress(layout = Layout.EN_US): Progress {
  const settings = KeyboardOptions.default()
    .withLanguage(layout.language)
    .withLayout(layout)
    .save(new Settings());
  const keyboard = loadKeyboard(layout);
  const model = new FakePhoneticModel(["abc", "def", "afe"]);
  const lesson = new GuidedLesson(settings, keyboard, model, ["abc", "def"], {
    unlockAllKeys: false,
  });
  return new Progress(settings, lesson);
}

test("ignores TextType.KEYTRACE in summaryStats while still populating keyStatsMap", () => {
  const progress = makeProgress(Layout.EN_US);
  const faker = new ResultFaker();

  const keytraceResult = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.KEYTRACE,
    length: 100,
    time: 70_588, // ~17.0 WPM (85 CPM)
    errors: 10,
  });

  progress.append(keytraceResult);

  equal(progress.summaryStats.speed.last, 0);
  equal(progress.summaryStats.accuracy.last, 0);
  equal(progress.summaryStats.score.last, 0);
  isTrue(
    progress.keyStatsMap.get(FakePhoneticModel.letter1).samples.length > 0,
  );
});

test("ignores other layouts in both summaryStats and keyStatsMap", () => {
  const progress = makeProgress(Layout.EN_US);
  const faker = new ResultFaker();

  const nativeEn = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.GENERATED,
    length: 100,
    time: 30_000, // 200 CPM (40.0 WPM)
    errors: 0,
  });
  const nativeZh = faker.nextResult({
    layout: Layout.ZH_SP,
    textType: TextType.GENERATED,
    length: 100,
    time: 60_000, // 100 CPM (20.0 WPM)
    errors: 5,
  });

  progress.append(nativeEn);
  progress.append(nativeZh);

  equal(progress.summaryStats.speed.last, 200);
  equal(progress.summaryStats.speed.avg, 200);
  equal(progress.keyStatsMap.get(FakePhoneticModel.letter1).samples.length, 1);
});

test("keeps native summaryStats unaffected by subsequent TextType.KEYTRACE syncs", () => {
  const progress = makeProgress(Layout.EN_US);
  const faker = new ResultFaker();

  const native40 = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.GENERATED,
    length: 100,
    time: 30_000, // 200 CPM (40.0 WPM)
    errors: 2,
  });
  const keytrace17 = faker.nextResult({
    layout: Layout.EN_US,
    textType: TextType.KEYTRACE,
    length: 100,
    time: 70_588, // ~85 CPM (~17.0 WPM)
    errors: 20,
  });

  progress.append(native40);
  progress.append(keytrace17);

  equal(progress.summaryStats.speed.last, 200);
  equal(progress.summaryStats.speed.avg, 200);
  equal(progress.keyStatsMap.get(FakePhoneticModel.letter1).samples.length, 2);
});

test("excludes TextType.KEYTRACE and other layouts from top-speed and top-score alerts", () => {
  const progress = makeProgress(Layout.EN_US);
  const faker = new ResultFaker();
  const events: LessonEvent[] = [];
  const listener = (event: LessonEvent) => {
    events.push(event);
  };

  // High-score, high-speed KeyTrace & cross-layout records must not steal the baseline.
  progress.append(
    faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.KEYTRACE,
      length: 2000,
      time: 60_000, // 2000 CPM
      errors: 0,
    }),
    listener,
  );
  progress.append(
    faker.nextResult({
      layout: Layout.ZH_SP,
      textType: TextType.GENERATED,
      length: 500,
      time: 30_000, // 1000 CPM
      errors: 0,
    }),
    listener,
  );
  equal(
    events.some((e) => e.type === "top-speed" || e.type === "top-score"),
    false,
  );

  // Calibrate TopSpeedEvents / TopScoreEvents with 3 native EN lessons at 120 CPM.
  for (let i = 0; i < 3; i += 1) {
    progress.append(
      faker.nextResult({
        layout: Layout.EN_US,
        textType: TextType.GENERATED,
        length: 100,
        time: 50_000, // 120 CPM
        errors: 0,
      }),
      listener,
    );
  }
  events.length = 0;

  // A 150 CPM native EN lesson beats 120 CPM despite the prior 2000 CPM KeyTrace record.
  progress.append(
    faker.nextResult({
      layout: Layout.EN_US,
      textType: TextType.GENERATED,
      length: 100,
      time: 40_000, // 150 CPM
      errors: 0,
    }),
    listener,
  );
  isTrue(
    events.some(
      (e) => e.type === "top-speed" && e.speed === 150 && e.previous === 120,
    ),
  );
  isTrue(events.some((e) => e.type === "top-score"));
  equal(Language.EN.id, "en");
});
