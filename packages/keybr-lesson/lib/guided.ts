import { type WordList } from "@keybr/content";
import { type Keyboard } from "@keybr/keyboard";
import { Filter, Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { randomSample, type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { Dictionary, filterWordList } from "./dictionary.ts";
import { LessonKey, LessonKeys } from "./key.ts";
import { Lesson } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { Target } from "./target.ts";
import { generateFragment } from "./text/fragment.ts";
import {
  mangledWords,
  phoneticWords,
  randomWords,
  uniqueWords,
} from "./text/words.ts";

/** 越慢越常出现：confidence 趋近 0 时，该键在词里的权重最多 ×5 */
const SLOW_BOOST = 4;
/** 错误率 100% 的键额外 +3（配合基础 1，共 ×4） */
const ERROR_BOOST = 3;
/** 当前聚焦的那个键再乘一点，让练习更集中 */
const FOCUS_BOOST = 1.5;

/** 按权重抽样；权重和非法时退回均匀抽样 */
function sampleWeighted<T>(
  items: readonly T[],
  weights: Float64Array,
  rng: RNGStream,
): T {
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
  }
  if (!(total > 0)) {
    return randomSample(items, rng);
  }
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

export class GuidedLesson extends Lesson {
  readonly dictionary: Dictionary;
  readonly idioms: Dictionary;
  // 每个字符的抽样权重：1 表示中性，越大越常出现。
  // update() 根据打字统计算出来，generate() 抽词时用。
  // 空表 = 没有数据 = 均匀抽样（与原先行为一致）。
  #keyWeights = new Map<number, number>();

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    wordList: WordList,
  ) {
    super(settings, keyboard, model);
    // 上游这里是 > 2，因为英文太短的词练不到几个键。
    // 但中文双拼一个音节正好两键，按上游规则词表会被滤空，练习区就成了白板。
    // 这里放宽到 >= 2。
    const filtered = filterWordList(wordList, this.codePoints).filter(
      (word) => word.length >= 2,
    );
    // 中文词表里，四字成语是 8 个字母（每字两键），单独放一份，
    // 好让"成语浓度"能在两池之间按比例抽词。
    const isZh = this.model.language.id === "zh-sp";
    const idioms = isZh ? filtered.filter((word) => word.length === 8) : [];
    const commons = isZh
      ? filtered.filter((word) => word.length !== 8)
      : filtered;
    this.dictionary = new Dictionary(commons);
    this.idioms = new Dictionary(idioms);
  }

  override get letters() {
    return this.model.letters;
  }

  override update(keyStatsMap: KeyStatsMap) {
    // 中文双拼不能按上游那套"先解锁几个字母"来：英文是 26 个字母慢慢扩，
    // 双拼的每个音节都是"声母键 + 韵母键"，只解锁 6 个键时能拼出的合法音节
    // 只剩 a / da / fa 这几种，屏幕上就全是同一个字。这里直接全解锁。
    const isZhShuangpin = this.model.language.id === "zh-sp";
    const alphabetSize = isZhShuangpin
      ? 1
      : this.settings.get(lessonProps.guided.alphabetSize);
    const recoverKeys = this.settings.get(lessonProps.guided.recoverKeys);

    const letters = this.#getLetters();

    const minSize = 6;
    const maxSize =
      minSize + Math.round((letters.length - minSize) * alphabetSize);

    const target = new Target(this.settings);

    const lessonKeys = new LessonKeys(
      letters.map((letter) => LessonKey.from(keyStatsMap.get(letter), target)),
    );

    for (const lessonKey of lessonKeys) {
      const includedKeys = lessonKeys.findIncludedKeys();

      if (includedKeys.length < minSize) {
        // Meet the minimal required alphabet size.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (includedKeys.length < maxSize) {
        // Meet the maximal required alphabet size.
        lessonKeys.force(lessonKey.letter);
        continue;
      }

      if ((lessonKey.bestConfidence ?? 0) >= 1) {
        // Must include all confident keys.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (recoverKeys) {
        if (includedKeys.every((key) => (key.confidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // are now above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      } else {
        if (includedKeys.every((key) => (key.bestConfidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // were once above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      }
    }

    // Find the least confident of all included keys and focus on it.
    const confidenceOf = (key: LessonKey): number => {
      return recoverKeys ? (key.confidence ?? 0) : (key.bestConfidence ?? 0);
    };
    const weakestKeys = lessonKeys
      .findIncludedKeys()
      .filter((key) => confidenceOf(key) < 1)
      .sort((a, b) => confidenceOf(a) - confidenceOf(b));
    if (weakestKeys.length > 0) {
      lessonKeys.focus(weakestKeys[0].letter);
    }

    // 这一步只算权重，不改纳入/聚焦逻辑——所有键仍然全部纳入，
    // 权重只影响后面抽词时哪些词更容易出现。
    this.#updateKeyWeights(lessonKeys);

    return lessonKeys;
  }

  // 弱键加权：把每个键的「慢」和「容易打错」折成一个抽样权重。
  // 速度用 keybr 自己的 confidence（目标速度 / 实际耗时），错误率从样本里累加——
  // keybr 原本只按速度选键，错误率完全不进模型，这里补上。
  #updateKeyWeights(lessonKeys: LessonKeys) {
    const focused = lessonKeys.findFocusedKey();
    const map = new Map<number, number>();
    for (const key of lessonKeys) {
      const codePoint = key.letter.codePoint;
      // confidence >= 1 说明已经达到目标速度；null 表示还没数据，都保持中性
      const confidence = key.confidence;
      const slow = confidence != null && confidence < 1 ? 1 - confidence : 0;

      let hit = 0;
      let miss = 0;
      for (const sample of key.samples) {
        hit += sample.hitCount;
        miss += sample.missCount;
      }
      const errorRate = hit + miss > 0 ? miss / (hit + miss) : 0;

      let weight = 1 + SLOW_BOOST * slow + ERROR_BOOST * errorRate;
      if (focused != null && focused.letter.codePoint === codePoint) {
        weight *= FOCUS_BOOST;
      }
      map.set(codePoint, weight);
    }
    this.#keyWeights = map;
  }

  // 给一组词算抽样权重：取词内「最弱的那个键」的权重。
  //
  // 不用平均值：4 字母词里只有一个 c 时，平均下来 3.45 被稀释成 1.61，
  // 弱键几乎被抹平（实测含 c 的词只从 11% 涨到 14%）。
  // 不用求和：字母多的词（8 字母成语）会仅因为长度而被系统性地多抽。
  // 取最大值既保住了弱键的强度，又不偏袒长词。
  #weightsFor(words: readonly string[]): Float64Array {
    const out = new Float64Array(words.length);
    const keyWeights = this.#keyWeights;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (keyWeights.size === 0) {
        out[i] = 1;
        continue;
      }
      let max = 1;
      for (let j = 0; j < word.length; j++) {
        const weight = keyWeights.get(word.charCodeAt(j)) ?? 1;
        if (weight > max) {
          max = weight;
        }
      }
      out[i] = max;
    }
    return out;
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream) {
    const filter = new Filter(
      lessonKeys.findIncludedKeys(),
      lessonKeys.findFocusedKey(),
    );
    const wordGenerator = this.#makeWordGenerator(filter, rng);
    const isZh = this.model.language.id === "zh-sp";
    if (isZh) {
      // 中文双拼标点只有逗号和句号，词与词之间要么用标点分隔，要么用空格分隔，不叠加出现。
      return generateZhFragment(
        this.settings,
        uniqueWords(wordGenerator),
        rng,
        {
          repeatWords: this.settings.get(lessonProps.repeatWords),
          punctuatorRatio: this.settings.get(lessonProps.punctuators),
        },
      );
    }
    const words = mangledWords(
      uniqueWords(wordGenerator),
      this.model.language,
      Letter.restrict(Letter.punctuators, this.codePoints),
      {
        withCapitals: this.settings.get(lessonProps.capitals),
        withPunctuators: this.settings.get(lessonProps.punctuators),
      },
      rng,
    );
    return generateFragment(this.settings, words, {
      repeatWords: this.settings.get(lessonProps.repeatWords),
    });
  }

  #getLetters() {
    const { letters } = this.model;
    const { codePoints } = this;
    if (this.settings.get(lessonProps.guided.keyboardOrder)) {
      return Letter.weightedFrequencyOrder(letters, ({ codePoint }) =>
        codePoints.weight(codePoint),
      );
    } else {
      return Letter.frequencyOrder(letters);
    }
  }

  #makeWordGenerator(filter: Filter, rng: RNGStream) {
    const isZh = this.model.language.id === "zh-sp";
    if (isZh) {
      // 中文不走音素模型：它造的是伪音节，没有意义。
      // 直接在真实词表里抽，按设置的比例决定这一轮抽成语还是普通词。
      // 第二个参数 true：不做「必须含聚焦键」的硬筛，改由权重软偏向弱键。
      const commons = this.dictionary.find(filter, true);
      const idioms = this.idioms.find(filter, true);
      const ratio = this.settings.get(lessonProps.idioms);
      // 权重进来时算一次，之后每次抽词只做采样，不重复遍历词表
      const commonsWeights = this.#weightsFor(commons);
      const idiomsWeights = this.#weightsFor(idioms);
      return (): string | null => {
        const useIdiom = idioms.length > 0 && rng() < ratio;
        const pool = useIdiom ? idioms : commons;
        const poolWeights = useIdiom ? idiomsWeights : commonsWeights;
        const fallback = useIdiom ? commons : idioms;
        const fallbackWeights = useIdiom ? commonsWeights : idiomsWeights;
        if (pool.length > 0) {
          return sampleWeighted(pool, poolWeights, rng);
        }
        return fallback.length > 0
          ? sampleWeighted(fallback, fallbackWeights, rng)
          : null;
      };
    }
    const pseudoWords = phoneticWords(this.model, filter, rng);
    if (this.settings.get(lessonProps.guided.naturalWords)) {
      const words = this.dictionary.find(filter).slice(0, 1000);
      while (words.length < 15) {
        const word = pseudoWords();
        if (word != null) {
          words.push(word);
        } else {
          break;
        }
      }
      if (words.length === 0) {
        words.push("?");
      }
      return randomWords(words, rng);
    }
    return pseudoWords;
  }
}

function generateZhFragment(
  settings: Settings,
  nextWord: () => string | null,
  rng: RNGStream,
  {
    repeatWords = 1,
    punctuatorRatio = 0,
  }: {
    readonly repeatWords?: number;
    readonly punctuatorRatio?: number;
  } = {},
): string {
  const targetLength = 100 + Math.round(settings.get(lessonProps.length) * 100);
  const words: string[] = [];
  let wordsLength = 0;
  while (wordsLength < targetLength) {
    const word = nextWord() || "?";
    for (let i = 1; i <= repeatWords; i++) {
      words.push(word);
      wordsLength += word.length;
      if (wordsLength >= targetLength) {
        break;
      }
    }
  }
  let out = "";
  for (let i = 0; i < words.length; i++) {
    out += words[i];
    if (i < words.length - 1) {
      if (punctuatorRatio > 0 && rng() < punctuatorRatio) {
        out += rng() < 0.75 ? "," : ".";
      } else {
        out += " ";
      }
    } else if (punctuatorRatio > 0 && rng() < punctuatorRatio) {
      out += ".";
    }
  }
  return out;
}
