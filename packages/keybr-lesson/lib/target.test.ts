import { test } from "node:test";
import { keyboardProps, Language, Layout } from "@keybr/keyboard";
import { Settings } from "@keybr/settings";
import { equal, throws } from "rich-assert";
import { lessonProps } from "./settings.ts";
import { getTargetSpeedProp, isZhTargetContext, Target } from "./target.ts";

test("time to confidence", () => {
  const settings = new Settings().set(lessonProps.targetSpeed, /* 50WPM */ 250);
  const target = new Target(settings);
  throws(() => target.confidence(NaN));
  throws(() => target.confidence(0));
  equal(target.confidence(1000 / (500 / 60)), 2.0);
  equal(target.confidence(1000 / (250 / 60)), 1.0);
  equal(target.confidence(1000 / (125 / 60)), 0.5);
});

test("independent EN and ZH target speed resolution", () => {
  const defaults = new Settings();
  equal(isZhTargetContext(defaults), false);
  equal(getTargetSpeedProp(defaults), lessonProps.targetSpeed);
  equal(new Target(defaults).targetSpeed, 175);

  const zhByLang = new Settings().set(keyboardProps.language, Language.ZH_SP);
  equal(isZhTargetContext(zhByLang), true);
  equal(getTargetSpeedProp(zhByLang), lessonProps.zhTargetSpeed);
  equal(new Target(zhByLang).targetSpeed, 125);

  // Layout-only settings also resolve as ZH.
  const zhByLayoutOnly = new Settings().set(keyboardProps.layout, Layout.ZH_QP);
  equal(isZhTargetContext(zhByLayoutOnly), true);
  equal(new Target(zhByLayoutOnly).targetSpeed, 125);

  // Custom EN and ZH speeds stay isolated and explicit override wins.
  const custom = new Settings()
    .set(keyboardProps.language, Language.EN)
    .set(keyboardProps.layout, Layout.EN_US)
    .set(lessonProps.targetSpeed, 220)
    .set(lessonProps.zhTargetSpeed, 95);

  equal(new Target(custom).targetSpeed, 220);
  equal(new Target(custom, Language.EN).targetSpeed, 220);
  equal(new Target(custom, Layout.EN_US).targetSpeed, 220);
  equal(new Target(custom, Language.ZH_SP).targetSpeed, 95);
  equal(new Target(custom, Language.ZH_QP).targetSpeed, 95);
  equal(new Target(custom, Layout.ZH_SP).targetSpeed, 95);
  equal(new Target(custom, Layout.ZH_SP_MS).targetSpeed, 95);
  equal(new Target(custom, Layout.ZH_QP).targetSpeed, 95);

  // Explicit EN override while active settings are ZH.
  const activeZh = custom
    .set(keyboardProps.language, Language.ZH_SP)
    .set(keyboardProps.layout, Layout.ZH_SP);
  equal(new Target(activeZh).targetSpeed, 95);
  equal(new Target(activeZh, Layout.EN_US).targetSpeed, 220);
});
