import {
  getZhSchemeFromLayout,
  isZhQuanpin,
  isZhShuangpin,
  KeyboardOptions,
  Language,
  type Layout,
  type ZhInputScheme,
} from "@keybr/keyboard";
import {
  booleanProp,
  enumProp,
  itemProp,
  type Settings,
} from "@keybr/settings";
import { Font } from "./font.ts";

/**
 * Fuzzy pinyin settings for Chinese Shuangpin and Quanpin modes.
 */
export type FuzzyPinyinSettings = {
  readonly enEng: boolean;
  readonly anAng: boolean;
  readonly inIng: boolean;
  readonly ianIang: boolean;
  readonly uanUang?: boolean;
  readonly zhZ: boolean;
  readonly chC: boolean;
  readonly shS: boolean;
  readonly lN: boolean;
  readonly fH?: boolean;
  readonly rL?: boolean;
  readonly veUe?: boolean;
};

/**
 * Text input settings.
 */
export type TextInputSettings = {
  /**
   * If enabled then text input stops advancing until the right key
   * at the cursor position is pressed, no delete key is used.
   * If disabled all errors will be accumulated in the garbage field
   * and must be cleared with the delete key.
   */
  readonly stopOnError: boolean;
  /**
   * Enabling this option makes text input forgive some kind of errors,
   * like typing a wrong character or skipping a character.
   */
  readonly forgiveErrors: boolean;
  /**
   * If enabled then the space key skips all characters of a current word
   * to the first character of a next word.
   */
  readonly spaceSkipsWords: boolean;
  /**
   * Fuzzy pinyin options for Chinese Shuangpin and Quanpin modes.
   */
  readonly fuzzy?: FuzzyPinyinSettings;
  /**
   * Whether Chinese Shuangpin mode is active.
   */
  readonly zhShuangpin?: boolean;
  /**
   * Whether Chinese Quanpin (Full Pinyin) mode is active.
   */
  readonly zhQuanpin?: boolean;
  /**
   * Active Chinese input scheme layout id.
   */
  readonly zhScheme?: ZhInputScheme;
};

export const textInputSettings = {
  stopOnError: true,
  forgiveErrors: true,
  spaceSkipsWords: true,
} as const satisfies TextInputSettings;

export const textInputProps = {
  stopOnError: booleanProp("textInput.stopOnError", true),
  forgiveErrors: booleanProp("textInput.forgiveErrors", true),
  spaceSkipsWords: booleanProp("textInput.spaceSkipsWords", false),
  fuzzy: {
    enEng: booleanProp("textInput.fuzzy.enEng", false),
    anAng: booleanProp("textInput.fuzzy.anAng", false),
    inIng: booleanProp("textInput.fuzzy.inIng", false),
    ianIang: booleanProp("textInput.fuzzy.ianIang", false),
    uanUang: booleanProp("textInput.fuzzy.uanUang", false),
    zhZ: booleanProp("textInput.fuzzy.zhZ", false),
    chC: booleanProp("textInput.fuzzy.chC", false),
    shS: booleanProp("textInput.fuzzy.shS", false),
    lN: booleanProp("textInput.fuzzy.lN", false),
    fH: booleanProp("textInput.fuzzy.fH", false),
    rL: booleanProp("textInput.fuzzy.rL", false),
    veUe: booleanProp("textInput.fuzzy.veUe", false),
  } as const,
} as const;

export function toTextInputSettings(settings: Settings): TextInputSettings {
  const { language, layout } = KeyboardOptions.from(settings);
  return {
    stopOnError: settings.get(textInputProps.stopOnError),
    forgiveErrors: settings.get(textInputProps.forgiveErrors),
    spaceSkipsWords: settings.get(textInputProps.spaceSkipsWords),
    zhShuangpin: isZhShuangpin(language),
    zhQuanpin: isZhQuanpin(language),
    zhScheme: getZhSchemeFromLayout(layout) ?? undefined,
    fuzzy: {
      enEng: settings.get(textInputProps.fuzzy.enEng),
      anAng: settings.get(textInputProps.fuzzy.anAng),
      inIng: settings.get(textInputProps.fuzzy.inIng),
      ianIang: settings.get(textInputProps.fuzzy.ianIang),
      uanUang: settings.get(textInputProps.fuzzy.uanUang),
      zhZ: settings.get(textInputProps.fuzzy.zhZ),
      chC: settings.get(textInputProps.fuzzy.chC),
      shS: settings.get(textInputProps.fuzzy.shS),
      lN: settings.get(textInputProps.fuzzy.lN),
      fH: settings.get(textInputProps.fuzzy.fH),
      rL: settings.get(textInputProps.fuzzy.rL),
      veUe: settings.get(textInputProps.fuzzy.veUe),
    },
  };
}

export type TextDisplaySettings = {
  readonly font: Font;
  readonly caretShapeStyle: CaretShapeStyle;
  readonly caretMovementStyle: CaretMovementStyle;
  readonly whitespaceStyle: WhitespaceStyle;
  readonly language: Language;
  readonly layout?: Layout;
};

export enum CaretShapeStyle {
  Block = 1,
  Box = 2,
  Line = 3,
  Underline = 4,
}

export enum CaretMovementStyle {
  Jumping = 1,
  Smooth = 2,
}

export enum WhitespaceStyle {
  Space = 1,
  Bar = 2,
  Bullet = 3,
}

export const textDisplaySettings = {
  font: Font.default,
  caretShapeStyle: CaretShapeStyle.Underline,
  caretMovementStyle: CaretMovementStyle.Smooth,
  whitespaceStyle: WhitespaceStyle.Bullet,
  language: Language.EN,
} as const satisfies TextDisplaySettings;

export const textDisplayProps = {
  font: itemProp("textDisplay.font", Font.ALL, Font.default),
  caretShapeStyle: enumProp(
    "textDisplay.caretShapeStyle",
    CaretShapeStyle,
    CaretShapeStyle.Underline,
  ),
  caretMovementStyle: enumProp(
    "textDisplay.caretMovementStyle",
    CaretMovementStyle,
    CaretMovementStyle.Smooth,
  ),
  whitespaceStyle: enumProp(
    "textDisplay.whitespaceStyle",
    WhitespaceStyle,
    WhitespaceStyle.Bullet,
  ),
} as const;

export function toTextDisplaySettings(settings: Settings): TextDisplaySettings {
  const caretShapeStyle = settings.get(textDisplayProps.caretShapeStyle);
  const caretMovementStyle = settings.get(textDisplayProps.caretMovementStyle);
  const whitespaceStyle = settings.get(textDisplayProps.whitespaceStyle);
  const { language, layout } = KeyboardOptions.from(settings);
  const fonts = Font.select(language);
  const font = Font.find(fonts, settings.get(textDisplayProps.font));
  return {
    font,
    caretShapeStyle,
    caretMovementStyle,
    whitespaceStyle,
    language,
    layout,
  };
}
