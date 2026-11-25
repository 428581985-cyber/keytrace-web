import { type WordList } from "@keybr/content";
import {
  isZhLanguage,
  isZhQuanpin,
  type Keyboard,
  type Layout,
  layoutUsesSemicolon,
} from "@keybr/keyboard";
import { Filter, Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { randomSample, type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { isQuanpinIdiom } from "@keybr/textinput";
import { Dictionary, filterWordList } from "./dictionary.ts";
import { LessonKey, LessonKeys } from "./key.ts";
import { Lesson } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { generateFragment } from "./text/fragment.ts";
import {
  mangledWords,
  phoneticWords,
  randomWords,
  uniqueWords,
} from "./text/words.ts";
import { orderZhLetters } from "./zh-curriculum.ts";

export type GuidedLessonOptions = {
  readonly unlockAllKeys?: boolean;
};

/** 越慢越常出现：confidence 趋近 0 时，该键在词里的权重最多 ×5 */
const SLOW_BOOST = 4;
/** 错误率 100% 的键额外 +3（配合基础 1，共 ×4） */
const ERROR_BOOST = 3;
/** 当前聚焦的那个键再乘一点，让练习更集中 */
const FOCUS_BOOST = 1.5;
/** 中文抽词冷却窗口：近期抽过的词短期内不重复，避免低频键（如 v/p/f）词池复读 */
const ZH_COOLDOWN_WINDOW = 16;

const ZH_SP_LOCKED_FOCUS_KEY = "keybr.zh.lockedFocusKey";
const ZH_SP_DRILL_OVERRIDE_KEY = "keybr.zh.drillFocusKey";

export function getLayoutLetters(
  layout: Layout,
  modelLetters: readonly Letter[],
): readonly Letter[] {
  if (
    layoutUsesSemicolon(layout) &&
    !modelLetters.some((letter) => letter.codePoint === 0x003b)
  ) {
    return [...modelLetters, new Letter(0x003b, 0.025)];
  }
  return modelLetters;
}

export function getZhFocusStorageKeys(layoutId: string): {
  readonly lockedKey: string;
  readonly drillKey: string;
} {
  if (layoutId === "zh-sp") {
    return {
      lockedKey: ZH_SP_LOCKED_FOCUS_KEY,
      drillKey: ZH_SP_DRILL_OVERRIDE_KEY,
    };
  }
  return {
    lockedKey: `keybr.${layoutId}.lockedFocusKey`,
    drillKey: `keybr.${layoutId}.drillFocusKey`,
  };
}

export const getFocusStorageKeys = getZhFocusStorageKeys;

function readStorageCodePoint(key: string): number | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    const raw = localStorage.getItem(key);
    if (raw == null || raw.length === 0) {
      return null;
    }
    return raw.codePointAt(0) ?? null;
  } catch {
    return null;
  }
}

function consumeDrillOverrideStorage(key: string): number | null {
  const cp = readStorageCodePoint(key);
  if (cp != null) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  }
  return cp;
}

function writeLockedFocusStorage(key: string, codePoint: number | null): void {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    if (codePoint == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String.fromCodePoint(codePoint));
    }
  } catch {
    // Ignore storage errors (e.g. restricted or full storage).
  }
}

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

function sampleWeightedExcluding(
  items: readonly string[],
  weights: Float64Array,
  excluded: ReadonlySet<string>,
  rng: RNGStream,
): string | null {
  let total = 0;
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    if (excluded.has(items[i])) {
      continue;
    }
    total += weights[i];
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  if (!(total > 0)) {
    let target = Math.floor(rng() * count);
    for (let i = 0; i < items.length; i++) {
      if (excluded.has(items[i])) {
        continue;
      }
      if (target === 0) {
        return items[i];
      }
      target -= 1;
    }
  }
  let r = rng() * total;
  let lastValid = items[0];
  for (let i = 0; i < items.length; i++) {
    if (excluded.has(items[i])) {
      continue;
    }
    lastValid = items[i];
    r -= weights[i];
    if (r <= 0) {
      return items[i];
    }
  }
  return lastValid;
}

function pickWithCooldown(
  pool: readonly string[],
  weights: Float64Array,
  recent: string[],
  rng: RNGStream,
): string | null {
  if (pool.length === 0) {
    return null;
  }
  if (pool.length === 1) {
    return pool[0];
  }
  const fullExcluded = new Set<string>(recent);
  let chosen = sampleWeightedExcluding(pool, weights, fullExcluded, rng);
  if (chosen == null) {
    // Small pool: exclude only the most recent half of pool entries (at least 1).
    const halfWindow = Math.max(1, Math.floor(pool.length / 2));
    const poolSet = new Set<string>(pool);
    const partialExcluded = new Set<string>();
    for (
      let i = recent.length - 1;
      i >= 0 && partialExcluded.size < halfWindow;
      i--
    ) {
      const word = recent[i];
      if (poolSet.has(word)) {
        partialExcluded.add(word);
      }
    }
    chosen =
      sampleWeightedExcluding(pool, weights, partialExcluded, rng) ??
      sampleWeighted(pool, weights, rng);
  }
  const existingIdx = recent.indexOf(chosen);
  if (existingIdx >= 0) {
    recent.splice(existingIdx, 1);
  }
  recent.push(chosen);
  if (recent.length > ZH_COOLDOWN_WINDOW) {
    recent.shift();
  }
  return chosen;
}

export class GuidedLesson extends Lesson {
  readonly dictionary: Dictionary;
  readonly idioms: Dictionary;
  readonly #letters: readonly Letter[];
  readonly #unlockAllKeys: boolean;
  // 每个字符的抽样权重：1 表示中性，越大越常出现。
  // update() 根据打字统计算出来，generate() 抽词时用。
  // 空表 = 没有数据 = 均匀抽样（与原先行为一致）。
  #keyWeights = new Map<number, number>();
  #lockedFocusCodePoint: number | null = null;
  #recentZhWords: string[] = [];

  #readLockedFocus(): number | null {
    if (typeof localStorage !== "undefined") {
      const { lockedKey } = getFocusStorageKeys(this.keyboard.layout.id);
      return readStorageCodePoint(lockedKey);
    }
    return this.#lockedFocusCodePoint;
  }

  #writeLockedFocus(codePoint: number | null): void {
    this.#lockedFocusCodePoint = codePoint;
    const { lockedKey } = getFocusStorageKeys(this.keyboard.layout.id);
    writeLockedFocusStorage(lockedKey, codePoint);
  }

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    wordList: WordList,
    options?: GuidedLessonOptions,
  ) {
    super(settings, keyboard, model);
    this.#letters = getLayoutLetters(keyboard.layout, this.model.letters);
    this.#unlockAllKeys = options?.unlockAllKeys ?? false;
    // 上游这里是 > 2，因为英文太短的词练不到几个键。
    // 但中文双拼一个音节正好两键，按上游规则词表会被滤空，练习区就成了白板。
    // 这里放宽到 >= 2。
    const filtered = filterWordList(wordList, this.codePoints).filter(
      (word) => word.length >= 2,
    );
    // 中文双拼四字成语固定 8 字母；中文全拼变长，改查词表元数据 isQuanpinIdiom。
    const { language } = this.model;
    const isZh = isZhLanguage(language);
    const isIdiom = isZhQuanpin(language)
      ? (word: string) => isQuanpinIdiom(word)
      : (word: string) => word.length === 8;
    const idioms = isZh ? filtered.filter(isIdiom) : [];
    const commons = isZh
      ? filtered.filter((word) => !isIdiom(word))
      : filtered;
    this.dictionary = new Dictionary(commons);
    this.idioms = new Dictionary(idioms);
  }

  get unlockAllKeys(): boolean {
    return this.#unlockAllKeys;
  }

  override get letters() {
    return this.#letters;
  }

  override update(
    keyStatsMap: KeyStatsMap,
    options?: { readonly persistFocus?: boolean },
  ) {
    const isZh = isZhLanguage(this.model.language);
    const unlockAllKeys = this.#unlockAllKeys;
    const recoverKeys = this.settings.get(lessonProps.guided.recoverKeys);

    const letters = this.#getLetters();
    const target = this.createTarget();

    const lessonKeys = new LessonKeys(
      letters.map((letter) => LessonKey.from(keyStatsMap.get(letter), target)),
    );

    if (unlockAllKeys) {
      // KeyTrace 模式（中英文一致）：全部键位直接纳入，不锁定、不标记强制解锁。
      for (const lessonKey of lessonKeys) {
        lessonKeys.include(lessonKey.letter);
      }
    } else {
      // 独立网页渐进课程模式（中英文一致）：从 minSize = 6 起逐键解锁。
      const alphabetSize = this.settings.get(lessonProps.guided.alphabetSize);
      const minSize = 6;
      const maxSize =
        minSize + Math.round((letters.length - minSize) * alphabetSize);

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

        // 中文模糊音 consumeExtra 可能在未解锁键上产生单次击键样本；要求 >= 2 个样本
        // 才能提前自动纳入，避免单次噪声打乱渐进解锁顺序。
        const hasReliableBestConfidence =
          (lessonKey.bestConfidence ?? 0) >= 1 &&
          (!isZh || lessonKey.samples.length >= 2);
        if (hasReliableBestConfidence) {
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
    }

    // Find the least confident of all included keys and focus on it.
    const confidenceOf = (key: LessonKey): number => {
      if (unlockAllKeys) {
        return key.confidence ?? 0;
      }
      return recoverKeys ? (key.confidence ?? 0) : (key.bestConfidence ?? 0);
    };
    const includedKeys = lessonKeys.findIncludedKeys();
    const weakestKeys = includedKeys
      .filter((key) => confidenceOf(key) < 1)
      .sort((a, b) => confidenceOf(a) - confidenceOf(b));
    const persistFocus = options?.persistFocus ?? true;
    if (unlockAllKeys || isZh) {
      const { drillKey } = getFocusStorageKeys(this.keyboard.layout.id);
      const overrideCp = persistFocus
        ? consumeDrillOverrideStorage(drillKey)
        : readStorageCodePoint(drillKey);
      const overrideKey =
        overrideCp != null
          ? includedKeys.find((key) => key.letter.codePoint === overrideCp)
          : undefined;
      const hasAnySamples = includedKeys.some(
        (key) => key.samples.length > 0 || key.timeToType != null,
      );
      if (overrideKey != null) {
        lessonKeys.focus(overrideKey.letter);
        if (persistFocus) {
          this.#writeLockedFocus(overrideKey.letter.codePoint);
        }
      } else if (!hasAnySamples) {
        if (persistFocus) {
          this.#writeLockedFocus(null);
        }
        if (weakestKeys.length > 0) {
          lessonKeys.focus(weakestKeys[0].letter);
        }
      } else {
        const lockedCodePoint = this.#readLockedFocus();
        const lockedKey =
          lockedCodePoint != null
            ? includedKeys.find(
                (key) => key.letter.codePoint === lockedCodePoint,
              )
            : undefined;
        if (lockedKey != null && confidenceOf(lockedKey) < 1) {
          lessonKeys.focus(lockedKey.letter);
        } else if (weakestKeys.length > 0) {
          lessonKeys.focus(weakestKeys[0].letter);
          if (persistFocus) {
            this.#writeLockedFocus(weakestKeys[0].letter.codePoint);
          }
        } else if (persistFocus) {
          this.#writeLockedFocus(null);
        }
      }
    } else if (weakestKeys.length > 0) {
      lessonKeys.focus(weakestKeys[0].letter);
    }

    // 这一步只算权重，不改纳入/聚焦逻辑；权重只影响后面抽词时哪些词更容易出现。
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
    const isZh = isZhLanguage(this.model.language);
    if (isZh) {
      // 中文标点只有逗号和句号，词与词之间要么用标点分隔，要么用空格分隔，不叠加出现。
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
    const letters = this.#letters;
    if (isZhLanguage(this.model.language)) {
      return orderZhLetters(
        this.keyboard.layout,
        letters,
        this.settings.get(lessonProps.guided.keyboardOrder),
      );
    }
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
    const isZh = isZhLanguage(this.model.language);
    if (isZh) {
      // 中文不走音素模型：直接从真实词表里抽包含当前聚焦键的词；
      // 仅在普通词和成语都找不到包含聚焦键的词时才退回全词表，避免空池。
      let commons = this.dictionary.find(filter, false);
      let idioms = this.idioms.find(filter, false);
      if (commons.length === 0 && idioms.length === 0) {
        commons = this.dictionary.find(filter, true);
        idioms = this.idioms.find(filter, true);
      }
      const ratio = this.settings.get(lessonProps.idioms);
      // 渐进解锁初期成语池极小时（< 6 条）避免反复复读个别成语，等成语池充足后再按比例混入。
      const allowIdioms =
        idioms.length > 0 &&
        (this.#unlockAllKeys || idioms.length >= 6 || commons.length === 0);
      // 权重进来时算一次，之后每次抽词只做采样，不重复遍历词表
      const commonsWeights = this.#weightsFor(commons);
      const idiomsWeights = this.#weightsFor(idioms);
      const recent = this.#recentZhWords;
      return (): string | null => {
        const useIdiom = allowIdioms && rng() < ratio;
        const pool = useIdiom ? idioms : commons;
        const poolWeights = useIdiom ? idiomsWeights : commonsWeights;
        const fallback = useIdiom ? commons : idioms;
        const fallbackWeights = useIdiom ? commonsWeights : idiomsWeights;
        if (pool.length > 0) {
          return pickWithCooldown(pool, poolWeights, recent, rng);
        }
        return fallback.length > 0
          ? pickWithCooldown(fallback, fallbackWeights, recent, rng)
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
