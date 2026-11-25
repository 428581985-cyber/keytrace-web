import { test } from "node:test";
import { Settings } from "@keybr/settings";
import { equal } from "rich-assert";
import { lessonProps, resolvePracticeMode } from "./settings.ts";

test("zhTargetSpeed bounds and default", () => {
  const s = new Settings();
  equal(s.get(lessonProps.zhTargetSpeed), 125);
  equal(s.set(lessonProps.zhTargetSpeed, 10).get(lessonProps.zhTargetSpeed), 50);
  equal(
    s.set(lessonProps.zhTargetSpeed, 999).get(lessonProps.zhTargetSpeed),
    750,
  );
});

test("keytraceMode validation and round-trip", () => {
  const s = new Settings();
  equal(s.get(lessonProps.keytraceMode), "auto");
  equal(
    s.set(lessonProps.keytraceMode, "standalone").get(lessonProps.keytraceMode),
    "standalone",
  );
  equal(
    s.set(lessonProps.keytraceMode, "keytrace").get(lessonProps.keytraceMode),
    "keytrace",
  );
  const corrupt = new Settings({ "lesson.keytraceMode": "invalid" });
  equal(corrupt.get(lessonProps.keytraceMode), "auto");
});

test("resolvePracticeMode matrix", () => {
  const auto = new Settings();
  equal(
    resolvePracticeMode({
      settings: auto,
      keytraceAvailable: false,
      hasKeyTraceData: false,
    }),
    "standalone",
  );
  equal(
    resolvePracticeMode({
      settings: auto,
      keytraceAvailable: true,
      hasKeyTraceData: false,
    }),
    "keytrace",
  );
  equal(
    resolvePracticeMode({
      settings: auto,
      keytraceAvailable: false,
      hasKeyTraceData: true,
    }),
    "keytrace",
  );

  const forcedStandalone = auto.set(lessonProps.keytraceMode, "standalone");
  equal(
    resolvePracticeMode({
      settings: forcedStandalone,
      keytraceAvailable: true,
      hasKeyTraceData: true,
    }),
    "standalone",
  );

  const forcedKeytrace = auto.set(lessonProps.keytraceMode, "keytrace");
  equal(
    resolvePracticeMode({
      settings: forcedKeytrace,
      keytraceAvailable: false,
      hasKeyTraceData: false,
    }),
    "keytrace",
  );
});
