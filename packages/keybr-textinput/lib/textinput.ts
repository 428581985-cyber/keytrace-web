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
  #garbage: (Step & { readonly char: Char })[] = [];
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
    this.#typo = true;
    return this.#return(Feedback.Succeeded);
  }

  clearWord(): Feedback {
    this.#garbage = [];
    while (this.pos > 0 && this.at(this.pos - 1).codePoint !== 0x0020) {
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
    const canAdvance = this.forgiveErrors || this.#garbage.length === 0;

    // Evaluate Quanpin fuzzy match before space-skip/space-ignore handling so
    // omitting a trailing 'g' directly before a space (e.g. "fang " typed "fan ")
    // cleanly advances via skipAndMatch rather than triggering space-skip/ignore.
    const quanpinAction: QuanpinFuzzyAction =
      this.zhQuanpin &&
      canAdvance &&
      expected !== codePoint &&
      filterText.normalize(expected) !== codePoint
        ? evalQuanpinFuzzy(
            this.#chars,
            this.pos,
            codePoint,
            this.fuzzy,
            this.#fuzzyState,
          )
        : { kind: "none" };

    if (quanpinAction.kind !== "none") {
      const typo = this.#typo;
      if (quanpinAction.kind === "substitute") {
        this.#addStep(
          {
            timeStamp,
            codePoint: expected,
            timeToType,
            typo,
          },
          this.at(this.pos),
          quanpinAction.nextState,
        );
      } else if (quanpinAction.kind === "skipAndMatch") {
        const skippedChar = this.at(this.pos);
        const matchedChar = this.at(this.pos + 1);
        const matchedCodePoint =
          matchedChar.codePoint === codePoint ||
          filterText.normalize(matchedChar.codePoint) === codePoint
            ? codePoint
            : matchedChar.codePoint;
        this.#addSkipAndMatch(
          {
            timeStamp,
            codePoint: matchedCodePoint,
            timeToType,
            typo,
          },
          skippedChar,
          matchedChar,
          quanpinAction.nextState,
        );
      } else {
        this.#addConsumeExtra(
          {
            timeStamp,
            codePoint,
            timeToType,
            typo,
          },
          quanpinAction.nextState,
        );
      }
      this.#garbage = [];
      this.#typo = false;
      if (typo) {
        return this.#return(Feedback.Recovered);
      } else {
        return this.#return(Feedback.Succeeded);
      }
    }

    if (expected !== 0x0020 && codePoint === 0x0020) {
      if (
        this.spaceSkipsWords &&
        ((this.pos > 0 && this.at(this.pos - 1).codePoint !== 0x0020) ||
          this.#typo)
      ) {
        this.#skipWord(timeStamp);
        return this.#return(Feedback.Recovered);
      }
      if (this.#garbage.length === 0 && !this.#typo) {
        return this.#return(Feedback.Succeeded);
      }
    }

    const fuzzyScheme: ZhShuangpinSchemeId =
      this.zhScheme != null && isZhShuangpinSchemeId(this.zhScheme)
        ? this.zhScheme
        : "zh-sp";
    const fuzzyMatch =
      this.zhShuangpin &&
      matchesFuzzyShuangpin(
        this.#chars,
        this.pos,
        expected,
        codePoint,
        this.fuzzy,
        fuzzyScheme,
      );

    if (
      (expected === codePoint ||
        filterText.normalize(expected) === codePoint ||
        fuzzyMatch) &&
      canAdvance
    ) {
      const typo = this.#typo;
      const nextFuzzyState = this.zhQuanpin
        ? nextQuanpinFuzzyStateOnExactMatch(
            this.#chars,
            this.pos,
            this.fuzzy,
            this.#fuzzyState,
          )
        : {};
      this.#addStep(
        {
          timeStamp,
          codePoint: fuzzyMatch ? expected : codePoint,
          timeToType,
          typo,
        },
        this.at(this.pos),
        nextFuzzyState,
      );
      this.#garbage = [];
      this.#typo = false;
      if (typo) {
        return this.#return(Feedback.Recovered);
      } else {
        return this.#return(Feedback.Succeeded);
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

  #skipWord(timeStamp: number): void {
    // Skip the remaining non-space characters inside the word.
    while (this.pos < this.length && this.at(this.pos).codePoint !== 0x0020) {
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
    // Skip the space character to position at the beginning of the next word.
    if (this.pos < this.length && this.at(this.pos).codePoint === 0x0020) {
      this.#addStep(
        {
          timeStamp,
          codePoint: this.at(this.pos).codePoint,
          timeToType: 0,
          typo: false,
        },
        this.at(this.pos),
      );
    }
    this.#garbage = [];
    this.#typo = false;
  }

  #handleReplacedCharacter(): boolean {
    // text:    abcd
    // garbage: xbcd
    // offset:  0

    // Check if the buffer size is right.
    if (
      this.pos + recoverBufferLength + 1 > this.length ||
      this.#garbage.length < recoverBufferLength + 1
    ) {
      return false;
    }

    // Check whether we can recover.
    for (let i = 0; i < recoverBufferLength; i++) {
      const char = this.at(this.pos + i + 1);
      if (char.codePoint !== this.#garbage[i + 1].codePoint) {
        return false;
      }
    }

    // Append a step with an error.
    this.#addStep(
      {
        timeStamp: this.#garbage[0].timeStamp,
        codePoint: this.at(this.pos).codePoint,
        timeToType: 0,
        typo: true,
      },
      this.at(this.pos),
    );

    // Append successful steps.
    for (let i = 1; i < this.#garbage.length; i++) {
      const { timeStamp, codePoint, timeToType, typo, char } = this.#garbage[i];
      this.#addStep({ timeStamp, codePoint, timeToType, typo }, char);
    }

    this.#garbage = [];
    this.#typo = false;
    return true;
  }

  #handleSkippedCharacter(): boolean {
    // text:    abcd
    // garbage: bcd
    // offset:  0

    // Check if the buffer size is right.
    if (
      this.pos + recoverBufferLength + 1 > this.length ||
      this.#garbage.length < recoverBufferLength
    ) {
      return false;
    }

    // Check whether we can recover.
    for (let i = 0; i < recoverBufferLength; i++) {
      const char = this.at(this.pos + i + 1);
      if (char.codePoint !== this.#garbage[i].codePoint) {
        return false;
      }
    }

    // Append a step with an error.
    this.#addStep(
      {
        timeStamp: this.#garbage[0].timeStamp,
        codePoint: this.at(this.pos).codePoint,
        timeToType: 0,
        typo: true,
      },
      this.at(this.pos),
    );

    // Append successful steps.
    for (let i = 0; i < this.#garbage.length; i++) {
      const { timeStamp, codePoint, timeToType, typo, char } = this.#garbage[i];
      this.#addStep({ timeStamp, codePoint, timeToType, typo }, char);
    }

    this.#garbage = [];
    this.#typo = false;
    return true;
  }
}
