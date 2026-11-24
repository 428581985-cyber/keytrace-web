import {
  filterText,
  isZhShuangpinSchemeId,
  type ZhInputScheme,
  type ZhShuangpinSchemeId,
} from "@keybr/keyboard";
import { type CodePoint } from "@keybr/unicode";
import {
  Attr,
  type Char,
  flattenStyledText,
  type LineList,
  splitStyledText,
  type StyledText,
} from "./chars.ts";
import {
  evalQuanpinFuzzy,
  nextQuanpinFuzzyStateOnExactMatch,
  type QuanpinFuzzyAction,
  type QuanpinFuzzyState,
} from "./fuzzy-quanpin.ts";
import { matchesFuzzyShuangpin } from "./fuzzy-shuangpin.ts";
import {
  type FuzzyPinyinSettings,
  type TextInputSettings,
} from "./settings.ts";

export enum Feedback {
  Succeeded,
  Recovered,
  Failed,
}

export type Step = {
  readonly timeStamp: number;
  readonly codePoint: CodePoint;
  readonly timeToType: number;
  readonly typo: boolean;
};

export type StepListener = (step: Step) => void;

type InputSnapshot = {
  readonly pos: number;
  readonly stepsLen: number;
  readonly fuzzyState: QuanpinFuzzyState;
};

type GarbageEntry = Step & {
  readonly char: Char;
};

type MatchOutcome =
  | { readonly kind: "none" }
  | {
      readonly kind: "step";
      readonly stepCodePoint: CodePoint;
      readonly char: Char;
      readonly nextPos: number;
      readonly nextFuzzyState: QuanpinFuzzyState;
    }
  | {
      readonly kind: "skipAndMatch";
      readonly stepCodePoint: CodePoint;
      readonly skippedChar: Char;
      readonly matchedChar: Char;
      readonly nextPos: number;
      readonly nextFuzzyState: QuanpinFuzzyState;
    }
  | {
      readonly kind: "consumeExtra";
      readonly stepCodePoint: CodePoint;
      readonly nextPos: number;
      readonly nextFuzzyState: QuanpinFuzzyState;
    };

const recoverBufferLength = 3;
const garbageBufferLength = 10;

export class TextInput {
  readonly text: StyledText;
  readonly stopOnError: boolean;
  readonly forgiveErrors: boolean;
  readonly spaceSkipsWords: boolean;
  readonly zhShuangpin: boolean;
  readonly zhQuanpin: boolean;
  readonly zhScheme?: ZhInputScheme;
  readonly fuzzy?: FuzzyPinyinSettings;
  readonly onStep: StepListener;
  readonly #text: string;
  readonly #chars: readonly Char[];
  #committedChars: Char[] = [];
  #steps: Step[] = [];
  #garbage: GarbageEntry[] = [];
  #ignoredSpace: GarbageEntry | null = null;
  #fuzzyState: QuanpinFuzzyState = {};
  #snapshots: InputSnapshot[] = [];
  #typo!: boolean;
  #output!: { chars: Char[]; lines: LineList; remaining: Char[] };

  constructor(
    text: StyledText,
    {
      stopOnError,
      forgiveErrors,
      spaceSkipsWords,
      zhShuangpin = false,
      zhQuanpin = false,
      zhScheme,
      fuzzy,
    }: TextInputSettings,
    onStep: StepListener = () => {},
  ) {
    this.text = text;
    this.stopOnError = stopOnError;
    this.forgiveErrors = forgiveErrors;
    this.spaceSkipsWords = spaceSkipsWords;
    this.zhShuangpin = zhShuangpin;
    this.zhQuanpin = zhQuanpin;
    this.zhScheme = zhScheme;
    this.fuzzy = fuzzy;
    this.onStep = onStep;
    this.#text = flattenStyledText(text);
    this.#chars = splitStyledText(text);
    this.reset();
  }

  reset(): void {
    this.#committedChars = [];
    this.#steps = [];
    this.#garbage = [];
    this.#ignoredSpace = null;
    this.#fuzzyState = {};
    this.#snapshots = [];
    this.#typo = false;
    this.#update();
  }

  get length(): number {
    return this.#chars.length;
  }

  at(index: number): Char {
    return this.#chars.at(index)!;
  }

  get pos(): number {
    return this.#committedChars.length;
  }

  get completed(): boolean {
    return this.pos === this.length;
  }

  get steps(): readonly Step[] {
    return this.#steps;
  }

  get chars(): readonly Char[] {
    return this.#output.chars;
  }

  get lines(): LineList {
    return this.#output.lines;
  }

  get remaining(): readonly Char[] {
    return this.#output.remaining;
  }

  onInput({
    timeStamp,
    inputType,
    codePoint,
    timeToType,
  }: {
    readonly timeStamp: number;
    readonly inputType:
      "appendChar" | "appendLineBreak" | "clearChar" | "clearWord";
    readonly codePoint: CodePoint;
    readonly timeToType: number;
  }): Feedback {
    switch (inputType) {
      case "appendChar":
        return this.appendChar(timeStamp, codePoint, timeToType);
      case "appendLineBreak":
        return this.appendChar(timeStamp, 0x0020, timeToType);
      case "clearChar":
        return this.clearChar();
      case "clearWord":
        return this.clearWord();
    }
  }

  clearChar(): Feedback {
    this.#garbage.pop();
    this.#ignoredSpace = null;
    this.#typo = true;
    return this.#return(Feedback.Succeeded);
  }

  clearWord(): Feedback {
    this.#garbage = [];
    this.#ignoredSpace = null;
    while (this.pos > 0 && !this.#isBoundaryAfter(this.pos - 1)) {
      const snapshot = this.#snapshots.pop();
      if (snapshot == null) {
        break;
      }
      this.#committedChars.length = snapshot.pos;
      this.#steps.length = snapshot.stepsLen;
      this.#fuzzyState = snapshot.fuzzyState;
    }
    this.#typo = true;
    return this.#return(Feedback.Succeeded);
  }

  appendChar(
    timeStamp: number,
    codePoint: CodePoint,
    timeToType: number,
  ): Feedback {
    if (this.completed) {
      throw new Error();
    }

    const { codePoint: expected } = this.at(this.pos);
    const canAdvance =
      this.forgiveErrors || this.#isZhMode() || this.#garbage.length === 0;

    // Evaluate Quanpin fuzzy match before space-skip/space-ignore handling so
    // omitting a trailing 'g' directly before a space (e.g. "fang " typed "fan ")
    // cleanly advances via skipAndMatch rather than triggering space-skip/ignore.
    if (
      this.zhQuanpin &&
      canAdvance &&
      expected !== codePoint &&
      filterText.normalize(expected) !== codePoint
    ) {
      const quanpinOutcome = this.#evaluateQuanpinFuzzy(
        this.pos,
        codePoint,
        this.#fuzzyState,
      );
      if (quanpinOutcome.kind !== "none") {
        const typo = this.#typo;
        this.#applyMatchOutcome(quanpinOutcome, timeStamp, timeToType, typo);
        this.#garbage = [];
        this.#ignoredSpace = null;
        this.#typo = false;
        if (typo) {
          return this.#return(Feedback.Recovered);
        } else {
          return this.#return(Feedback.Succeeded);
        }
      }
    }

    if (expected !== 0x0020 && codePoint === 0x0020) {
      if (
        this.spaceSkipsWords &&
        ((this.pos > 0 && !this.#isBoundaryAfter(this.pos - 1)) || this.#typo)
      ) {
        this.#skipWord(timeStamp);
        return this.#return(Feedback.Recovered);
      }
      if (this.#garbage.length === 0 && !this.#typo) {
        if (
          this.forgiveErrors &&
          this.pos + 1 < this.length &&
          this.at(this.pos + 1).codePoint === 0x0020
        ) {
          this.#ignoredSpace = {
            char: {
              codePoint,
              attrs: Attr.Garbage,
              cls: null,
            },
            timeStamp,
            codePoint,
            timeToType,
            typo: false,
          };
        }
        return this.#return(Feedback.Succeeded);
      }
    }

    if (canAdvance) {
      const outcome = this.#evaluateMatch(
        this.pos,
        codePoint,
        this.#fuzzyState,
      );
      if (outcome.kind !== "none") {
        const typo = this.#typo;
        this.#applyMatchOutcome(outcome, timeStamp, timeToType, typo);
        this.#garbage = [];
        this.#ignoredSpace = null;
        this.#typo = false;
        if (typo) {
          return this.#return(Feedback.Recovered);
        } else {
          return this.#return(Feedback.Succeeded);
        }
      }
    }

    this.#typo = true;
    if (!this.stopOnError || this.forgiveErrors) {
      if (this.#garbage.length < garbageBufferLength) {
        this.#garbage.push({
          char: {
            codePoint,
            attrs: Attr.Garbage,
            cls: null,
          },
          timeStamp,
          codePoint,
          timeToType,
          typo: false,
        });
      }
    }
    if (
      this.forgiveErrors &&
      (this.#handleReplacedCharacter() || this.#handleSkippedCharacter())
    ) {
      return this.#return(Feedback.Recovered);
    } else {
      return this.#return(Feedback.Failed);
    }
  }

  #return(feedback: Feedback): Feedback {
    this.#update();
    return feedback;
  }

  #update(): void {
    const text = this.#text;
    const remaining = this.#chars.slice(this.pos);
    const chars = [];
    chars.push(...this.#committedChars);
    if (!this.stopOnError) {
      chars.push(...this.#garbage.map(({ char }) => char));
    }
    if (remaining.length > 0) {
      const [head, ...tail] = remaining;
      chars.push({ ...head, attrs: Attr.Cursor }, ...tail);
    }
    const lines = { text, lines: [{ text, chars }] };
    this.#output = { chars, lines, remaining };
  }

  #saveSnapshot(): void {
    this.#snapshots.push({
      pos: this.#committedChars.length,
      stepsLen: this.#steps.length,
      fuzzyState: this.#fuzzyState,
    });
  }

  #addStep(
    step: Step,
    char: Char,
    nextFuzzyState: QuanpinFuzzyState = {},
  ): void {
    this.#saveSnapshot();
    const attrs = step.typo ? Attr.Miss : Attr.Hit;
    this.#committedChars.push({ ...char, attrs });
    this.#steps.push(step);
    this.#fuzzyState = nextFuzzyState;
    this.onStep(step);
  }

  #addSkipAndMatch(
    step: Step,
    skippedChar: Char,
    matchedChar: Char,
    nextFuzzyState: QuanpinFuzzyState,
  ): void {
    this.#saveSnapshot();
    const matchedAttrs = step.typo ? Attr.Miss : Attr.Hit;
    this.#committedChars.push(
      { ...skippedChar, attrs: Attr.Hit },
      { ...matchedChar, attrs: matchedAttrs },
    );
    this.#steps.push(step);
    this.#fuzzyState = nextFuzzyState;
    this.onStep(step);
  }

  #addConsumeExtra(step: Step, nextFuzzyState: QuanpinFuzzyState): void {
    this.#saveSnapshot();
    this.#steps.push(step);
    this.#fuzzyState = nextFuzzyState;
    this.onStep(step);
  }

  #isZhMode(): boolean {
    return this.zhShuangpin || this.zhQuanpin;
  }

  #isZhPunctuation(codePoint: CodePoint): boolean {
    return (
      codePoint === 0x002c ||
      codePoint === 0x002e ||
      codePoint === 0x003f ||
      codePoint === 0x0021
    );
  }

  #isSeparatorAt(index: number): boolean {
    const codePoint = this.at(index).codePoint;
    if (codePoint === 0x0020) {
      return true;
    }
    return (
      this.#isZhMode() &&
      this.#isZhPunctuation(codePoint) &&
      (index + 1 >= this.length || this.at(index + 1).codePoint !== 0x0020)
    );
  }

  #isBoundaryAfter(index: number): boolean {
    return this.#isSeparatorAt(index);
  }

  #evaluateQuanpinFuzzy(
    pos: number,
    codePoint: CodePoint,
    fuzzyState: QuanpinFuzzyState,
  ): MatchOutcome {
    const char = this.at(pos);
    const expected = char.codePoint;
    const action: QuanpinFuzzyAction = evalQuanpinFuzzy(
      this.#chars,
      pos,
      codePoint,
      this.fuzzy,
      fuzzyState,
    );
    switch (action.kind) {
      case "none":
        return { kind: "none" };
      case "substitute":
        return {
          kind: "step",
          stepCodePoint: expected,
          char,
          nextPos: pos + 1,
          nextFuzzyState: action.nextState,
        };
      case "skipAndMatch": {
        const matchedChar = this.at(pos + 1);
        const matchedCodePoint =
          matchedChar.codePoint === codePoint ||
          filterText.normalize(matchedChar.codePoint) === codePoint
            ? codePoint
            : matchedChar.codePoint;
        return {
          kind: "skipAndMatch",
          stepCodePoint: matchedCodePoint,
          skippedChar: char,
          matchedChar,
          nextPos: pos + 2,
          nextFuzzyState: action.nextState,
        };
      }
      case "consumeExtra":
        return {
          kind: "consumeExtra",
          stepCodePoint: codePoint,
          nextPos: pos,
          nextFuzzyState: action.nextState,
        };
    }
  }

  #evaluateMatch(
    pos: number,
    codePoint: CodePoint,
    fuzzyState: QuanpinFuzzyState,
  ): MatchOutcome {
    if (pos < 0 || pos >= this.length) {
      return { kind: "none" };
    }
    const char = this.at(pos);
    const expected = char.codePoint;

    if (
      expected === codePoint ||
      filterText.normalize(expected) === codePoint
    ) {
      const nextFuzzyState = this.zhQuanpin
        ? nextQuanpinFuzzyStateOnExactMatch(
            this.#chars,
            pos,
            this.fuzzy,
            fuzzyState,
          )
        : {};
      return {
        kind: "step",
        stepCodePoint: codePoint,
        char,
        nextPos: pos + 1,
        nextFuzzyState,
      };
    }

    if (this.zhQuanpin) {
      const quanpinOutcome = this.#evaluateQuanpinFuzzy(
        pos,
        codePoint,
        fuzzyState,
      );
      if (quanpinOutcome.kind !== "none") {
        return quanpinOutcome;
      }
    }

    if (this.zhShuangpin) {
      const fuzzyScheme: ZhShuangpinSchemeId =
        this.zhScheme != null && isZhShuangpinSchemeId(this.zhScheme)
          ? this.zhScheme
          : "zh-sp";
      if (
        matchesFuzzyShuangpin(
          this.#chars,
          pos,
          expected,
          codePoint,
          this.fuzzy,
          fuzzyScheme,
        )
      ) {
        return {
          kind: "step",
          stepCodePoint: expected,
          char,
          nextPos: pos + 1,
          nextFuzzyState: {},
        };
      }
    }

    return { kind: "none" };
  }

  #applyMatchOutcome(
    outcome: Exclude<MatchOutcome, { readonly kind: "none" }>,
    timeStamp: number,
    timeToType: number,
    typo: boolean,
  ): void {
    switch (outcome.kind) {
      case "step":
        this.#addStep(
          {
            timeStamp,
            codePoint: outcome.stepCodePoint,
            timeToType,
            typo,
          },
          outcome.char,
          outcome.nextFuzzyState,
        );
        break;
      case "skipAndMatch":
        this.#addSkipAndMatch(
          {
            timeStamp,
            codePoint: outcome.stepCodePoint,
            timeToType,
            typo,
          },
          outcome.skippedChar,
          outcome.matchedChar,
          outcome.nextFuzzyState,
        );
        break;
      case "consumeExtra":
        this.#addConsumeExtra(
          {
            timeStamp,
            codePoint: outcome.stepCodePoint,
            timeToType,
            typo,
          },
          outcome.nextFuzzyState,
        );
        break;
    }
  }

  #skipWord(timeStamp: number): void {
    // Skip the remaining characters inside the word before the separator.
    while (this.pos < this.length && !this.#isSeparatorAt(this.pos)) {
      this.#addStep(
        {
          timeStamp,
          codePoint: this.at(this.pos).codePoint,
          timeToType: 0,
          typo: true,
        },
        this.at(this.pos),
      );
    }
    // Skip the separator character to position at the beginning of the next word.
    if (this.pos < this.length) {
      const codePoint = this.at(this.pos).codePoint;
      if (codePoint === 0x0020) {
        this.#addStep(
          {
            timeStamp,
            codePoint,
            timeToType: 0,
            typo: false,
          },
          this.at(this.pos),
        );
      } else if (this.#isZhMode() && this.#isZhPunctuation(codePoint)) {
        this.#addStep(
          {
            timeStamp,
            codePoint,
            timeToType: 0,
            typo: true,
          },
          this.at(this.pos),
        );
      }
    }
    this.#garbage = [];
    this.#ignoredSpace = null;
    this.#typo = false;
  }

  #tryRecoverLookahead(
    firstTimeStamp: number,
    entries: readonly GarbageEntry[],
  ): boolean {
    if (
      this.pos + 1 >= this.length ||
      entries.length < recoverBufferLength
    ) {
      return false;
    }

    let simPos = this.pos + 1;
    let simFuzzyState: QuanpinFuzzyState = {};
    const matched: {
      readonly entry: GarbageEntry;
      readonly outcome: Exclude<MatchOutcome, { readonly kind: "none" }>;
    }[] = [];

    for (const entry of entries) {
      const outcome = this.#evaluateMatch(
        simPos,
        entry.codePoint,
        simFuzzyState,
      );
      if (outcome.kind === "none") {
        return false;
      }
      matched.push({ entry, outcome });
      simPos = outcome.nextPos;
      simFuzzyState = outcome.nextFuzzyState;
    }

    // Append a step with an error for the replaced or skipped character.
    this.#addStep(
      {
        timeStamp: firstTimeStamp,
        codePoint: this.at(this.pos).codePoint,
        timeToType: 0,
        typo: true,
      },
      this.at(this.pos),
      {},
    );

    // Replay the matched lookahead steps with canonical Char / fuzzyState.
    for (const { entry, outcome } of matched) {
      this.#applyMatchOutcome(
        outcome,
        entry.timeStamp,
        entry.timeToType,
        entry.typo,
      );
    }

    this.#garbage = [];
    this.#ignoredSpace = null;
    this.#typo = false;
    return true;
  }

  #handleReplacedCharacter(): boolean {
    // text:    abcd
    // garbage: xbcd
    // offset:  0

    if (this.#garbage.length < recoverBufferLength + 1) {
      return false;
    }

    return this.#tryRecoverLookahead(
      this.#garbage[0].timeStamp,
      this.#garbage.slice(1),
    );
  }

  #handleSkippedCharacter(): boolean {
    // text:    abcd
    // garbage: bcd
    // offset:  0

    if (
      this.#garbage.length >= recoverBufferLength &&
      this.#tryRecoverLookahead(this.#garbage[0].timeStamp, this.#garbage)
    ) {
      return true;
    }

    if (
      this.#ignoredSpace != null &&
      this.pos + 1 < this.length &&
      this.at(this.pos + 1).codePoint === 0x0020 &&
      this.#garbage.length + 1 >= recoverBufferLength
    ) {
      return this.#tryRecoverLookahead(this.#ignoredSpace.timeStamp, [
        this.#ignoredSpace,
        ...this.#garbage,
      ]);
    }

    return false;
  }
}
