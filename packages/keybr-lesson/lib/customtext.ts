import {
  filterText,
  getZhSchemeFromLayout,
  isZhLanguage,
  isZhQuanpin,
  type Keyboard,
} from "@keybr/keyboard";
import { type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { type StyledText } from "@keybr/textinput";
import { getLayoutLetters } from "./guided.ts";
import { LessonKeys } from "./key.ts";
import { Lesson } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { generateFragment } from "./text/fragment.ts";
import { randomWords, uniqueWords, wordSequence } from "./text/words.ts";
import {
  analyzeZhCustomText,
  type ZhCustomAnalysis,
  type ZhCustomToken,
  type ZhPinyinEngine,
} from "./zh-pinyin.ts";

export class CustomTextLesson extends Lesson {
  readonly wordList: readonly string[];
  readonly zhAnalysis: ZhCustomAnalysis | null;
  readonly zhEngine: ZhPinyinEngine | null;
  wordIndex = 0;

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    zhEngine: ZhPinyinEngine | null = null,
  ) {
    super(settings, keyboard, model);
    this.zhEngine = zhEngine;
    if (isZhLanguage(this.model.language)) {
      const scheme =
        getZhSchemeFromLayout(this.keyboard.layout) ??
        (isZhQuanpin(this.model.language) ? "zh-qp" : "zh-sp");
      const content = this.settings.get(lessonProps.customText.zhContent);
      const lettersOnly = this.settings.get(lessonProps.customText.lettersOnly);
      this.wordList = [];
      this.zhAnalysis = analyzeZhCustomText(content, scheme, zhEngine, {
        lettersOnly,
      });
    } else {
      this.zhAnalysis = null;
      this.wordList = this.#getWordList();
    }
  }

  override get letters() {
    return getLayoutLetters(this.keyboard.layout, this.model.letters);
  }

  override update(keyStatsMap: KeyStatsMap) {
    return LessonKeys.includeAll(keyStatsMap, this.createTarget());
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream): StyledText {
    if (this.zhAnalysis != null) {
      return this.#generateZh(this.zhAnalysis, rng);
    }
    return generateFragment(this.settings, this.#makeWordGenerator(rng));
  }

  #generateZh(analysis: ZhCustomAnalysis, rng: RNGStream): StyledText {
    const tokens = analysis.tokens;
    const wordTokens = tokens.filter(
      (token): token is Extract<ZhCustomToken, { readonly kind: "word" }> =>
        token.kind === "word",
    );
    if (wordTokens.length === 0) {
      return generateFragment(this.settings, () => "?");
    }

    const targetLength =
      100 + Math.round(this.settings.get(lessonProps.length) * 100);
    const randomize = this.settings.get(lessonProps.customText.randomize);
    const out: StyledText[] = [];
    let currentWordId = 0;
    let nextUnitId = 1;
    let emittedKeys = 0;

    if (randomize) {
      let prevIdx = -1;
      while (emittedKeys < targetLength) {
        let idx = Math.floor(rng() * wordTokens.length);
        if (wordTokens.length > 1) {
          for (let attempt = 0; attempt < 3 && idx === prevIdx; attempt++) {
            idx = Math.floor(rng() * wordTokens.length);
          }
        }
        prevIdx = idx;
        if (out.length > 0) {
          out.push(" ");
          emittedKeys += 1;
        }
        currentWordId += 1;
        for (const unit of wordTokens[idx].units) {
          const unitId = nextUnitId;
          nextUnitId += 1;
          out.push({
            text: unit.code,
            zhHanzi: unit.hanzi,
            zhUnit: unitId,
            zhWord: currentWordId,
            ...(unit.altCodes.length > 0 ? { zhAlts: unit.altCodes } : null),
          });
          emittedKeys += unit.code.length;
        }
      }
      return out;
    }

    let pendingSpace = false;
    while (emittedKeys < targetLength) {
      if (this.wordIndex >= tokens.length) {
        this.wordIndex = 0;
      }
      const token = tokens[this.wordIndex];
      this.wordIndex += 1;

      if (token.kind === "punct") {
        pendingSpace = false;
        out.push({ text: token.punct, zhHanzi: token.hanzi });
        emittedKeys += 1;
        continue;
      }

      if (pendingSpace) {
        out.push(" ");
        emittedKeys += 1;
      }
      currentWordId += 1;
      for (const unit of token.units) {
        const unitId = nextUnitId;
        nextUnitId += 1;
        out.push({
          text: unit.code,
          zhHanzi: unit.hanzi,
          zhUnit: unitId,
          zhWord: currentWordId,
          ...(unit.altCodes.length > 0 ? { zhAlts: unit.altCodes } : null),
        });
        emittedKeys += unit.code.length;
      }
      pendingSpace = token.spaceAfter;
    }
    return out;
  }

  #makeWordGenerator(rng: RNGStream) {
    const randomize = this.settings.get(lessonProps.customText.randomize);
    if (randomize && this.wordList.length > 0) {
      return uniqueWords(randomWords(this.wordList, rng));
    } else {
      return wordSequence(this.wordList, this);
    }
  }

  #getWordList() {
    const content = this.settings.get(lessonProps.customText.content);
    const lettersOnly = this.settings.get(lessonProps.customText.lettersOnly);
    const lowercase = this.settings.get(lessonProps.customText.lowercase);
    const codePoints = new Set(this.codePoints);
    if (lettersOnly) {
      for (const codePoint of codePoints) {
        if (!this.model.language.includes(codePoint)) {
          codePoints.delete(codePoint);
        }
      }
    }
    let text = filterText(content, codePoints);
    if (lowercase) {
      text = this.model.language.lowerCase(text);
    }
    return text.split(/\s+/);
  }
}
