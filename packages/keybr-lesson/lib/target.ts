import {
  isZhLanguage,
  isZhLayout,
  KeyboardOptions,
  type Language,
  type Layout,
} from "@keybr/keyboard";
import { speedToTime } from "@keybr/result";
import { type NumberProp, type Settings } from "@keybr/settings";
import { lessonProps } from "./settings.ts";

export function isZhTargetContext(
  settings: Settings,
  languageOrLayout?: Language | Layout,
): boolean {
  if (languageOrLayout != null) {
    return "language" in languageOrLayout
      ? isZhLayout(languageOrLayout)
      : isZhLanguage(languageOrLayout);
  }
  const options = KeyboardOptions.from(settings);
  return isZhLanguage(options.language) || isZhLayout(options.layout);
}

export function getTargetSpeedProp(
  settings: Settings,
  languageOrLayout?: Language | Layout,
): NumberProp {
  return isZhTargetContext(settings, languageOrLayout)
    ? lessonProps.zhTargetSpeed
    : lessonProps.targetSpeed;
}

export class Target {
  readonly targetSpeed: number;

  constructor(settings: Settings, languageOrLayout?: Language | Layout) {
    this.targetSpeed = settings.get(
      getTargetSpeedProp(settings, languageOrLayout),
    );
  }

  confidence(timeToType: number): number;
  confidence(timeToType: null): null;
  confidence(timeToType: number | null): number | null;
  confidence(timeToType: number | null): number | null {
    if (timeToType == null) {
      return null;
    }
    if (!Number.isFinite(timeToType) || timeToType === 0) {
      throw new Error();
    }
    return speedToTime(this.targetSpeed) / timeToType;
  }
}
