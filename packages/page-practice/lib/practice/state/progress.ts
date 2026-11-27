import { keyboardProps } from "@keybr/keyboard";
import { type LoadingEventListener } from "@keybr/lang";
import { type Lesson, MutableDailyGoal } from "@keybr/lesson";
import {
  MutableKeyStatsMap,
  MutableStreakList,
  MutableSummaryStats,
  type Result,
  TextType,
} from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { DailyGoalEvents } from "./event-source-daily-goal.ts";
import { LetterEvents } from "./event-source-letter.ts";
import { TopScoreEvents } from "./event-source-top-score.ts";
import { TopSpeedEvents } from "./event-source-top-speed.ts";
import {
  type LessonEventListener,
  type LessonEventSource,
} from "./event-types.ts";

export class Progress {
  readonly #settings: Settings;
  readonly #lesson: Lesson;
  readonly #results: Result[];
  readonly #keyStatsMap: MutableKeyStatsMap;
  readonly #summaryStats: MutableSummaryStats;
  readonly #streakList: MutableStreakList;
  readonly #dailyGoal: MutableDailyGoal;
  readonly #events: LessonEventSource;
  #version = 0;

  constructor(settings: Settings, lesson: Lesson) {
    this.#settings = settings;
    this.#lesson = lesson;
    this.#results = [];
    this.#keyStatsMap = new MutableKeyStatsMap(this.#lesson.letters);
    this.#summaryStats = new MutableSummaryStats();
    this.#streakList = new MutableStreakList();
    this.#dailyGoal = new MutableDailyGoal(this.#settings);

    const letter = new LetterEvents(this.#lesson, this.#keyStatsMap);
    const topSpeed = new TopSpeedEvents();
    const topScore = new TopScoreEvents();
    const dailyGoal = new DailyGoalEvents(this.#dailyGoal);
    this.#events = new (class implements LessonEventSource {
      append(result: Result, listener: LessonEventListener): void {
        const layout = settings.get(keyboardProps.layout);
        const isNativeCurrentLayout =
          result.layout.xid === layout.xid &&
          result.textType !== TextType.KEYTRACE;
        letter.append(result, listener);
        if (isNativeCurrentLayout) {
          topSpeed.append(result, listener);
          topScore.append(result, listener);
        }
        dailyGoal.append(result, listener);
      }
    })();
  }

  async *seedAsync(
    results: readonly Result[],
    listener: LoadingEventListener | null = null,
  ) {
    // We assume that the given array of results is append-only,
    // so finding new results is a matter of comparing the array lengths.
    // This function appends all the remaining results in chunks.
    // The returned async iterator must be called repeatedly
    // to complete the seeding.
    while (true) {
      const { length } = this.#results;
      if (length < results.length) {
        for (const result of results.slice(length, length + 100)) {
          this.append(result);
        }
        if (listener != null) {
          listener({ total: results.length, current: length });
        }
        yield null; // Yield to the browser event loop, unfreeze the UI.
      } else {
        break;
      }
    }
  }

  seed(results: readonly Result[]) {
    // We assume that the given array of results is append-only,
    // so finding new results is a matter of comparing the array lengths.
    // This function appends all the remaining results.
    const { length } = this.#results;
    if (length < results.length) {
      for (const result of results.slice(length)) {
        this.append(result);
      }
    }
  }

  append(result: Result, listener: LessonEventListener = () => {}) {
    this.#results.push(result);
    this.#version += 1;
    // 键位统计只收当前布局的结果（含 KeyTrace 同步记录，用于弱键识别与全解锁模式）。
    // 双拼里 C 键打的是韵母 ao，和英文打字母 c 是两套完全不同的肌肉记忆，
    // 混在一起会让「哪个键弱」的判断失真——英文练得多，双拼的弱键就被稀释掉。
    // 顶部衡量标准（SummaryStats：输入速度 / 准确度 / 分数）只收当前布局的网页练习结果，
    // 避免日常 KeyTrace 日聚合数据或其他布局的练习覆盖当前界面的「上一次速度」。
    // 连续天数与每日目标仍然收全部，它们与布局无关。
    const layout = this.#settings.get(keyboardProps.layout);
    if (result.layout.xid === layout.xid) {
      this.#keyStatsMap.append(result);
      if (result.textType !== TextType.KEYTRACE) {
        this.#summaryStats.append(result);
      }
    }
    this.#streakList.append(result);
    this.#dailyGoal.append(result);
    this.#events.append(result, listener);
  }

  isAppendOnlyExtension(results: readonly Result[]): boolean {
    const current = this.#results;
    if (results.length < current.length) {
      return false;
    }
    for (let i = 0; i < current.length; i++) {
      if (results[i] !== current[i]) {
        return false;
      }
    }
    return true;
  }

  get version(): number {
    return this.#version;
  }

  get settings() {
    return this.#settings;
  }

  get lesson() {
    return this.#lesson;
  }

  get keyStatsMap() {
    return this.#keyStatsMap;
  }

  get summaryStats() {
    return this.#summaryStats;
  }

  get streakList() {
    return this.#streakList;
  }

  get dailyGoal() {
    return this.#dailyGoal;
  }
}
