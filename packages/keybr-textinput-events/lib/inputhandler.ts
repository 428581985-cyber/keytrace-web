import { type CodePoint } from "@keybr/unicode";
import { type Focusable } from "@keybr/widget";
import { mapEvent, timeStampOf } from "./events.ts";
import { isTextInput, ModifierState } from "./modifiers.ts";
import { TimeToType } from "./timetotype.ts";
import { type IKeyboardEvent, type InputListener } from "./types.ts";

// https://w3c.github.io/uievents/
// https://www.w3.org/TR/input-events-1/
// https://www.w3.org/TR/input-events-2/
// https://domeventviewer.com/key-event-viewer.html

const US_QWERTY_CODES = new Map<string, readonly [CodePoint, CodePoint]>([
  ["Space", [0x0020, 0x0020]],
  ["Comma", [0x002c, 0x003c]],
  ["Period", [0x002e, 0x003e]],
  ["Slash", [0x002f, 0x003f]],
  ["Semicolon", [0x003b, 0x003a]],
  ["Quote", [0x0027, 0x0022]],
  ["Minus", [0x002d, 0x005f]],
  ["Equal", [0x003d, 0x002b]],
  ["BracketLeft", [0x005b, 0x007b]],
  ["BracketRight", [0x005d, 0x007d]],
  ["Backslash", [0x005c, 0x007c]],
  ["Backquote", [0x0060, 0x007e]],
]);

for (let i = 0; i < 26; i++) {
  const upper = 0x0041 + i;
  const lower = 0x0061 + i;
  US_QWERTY_CODES.set(`Key${String.fromCodePoint(upper)}`, [lower, upper]);
}

const DIGIT_SHIFT_SYMBOLS = ")!@#$%^&*(";
for (let i = 0; i < 10; i++) {
  US_QWERTY_CODES.set(`Digit${i}`, [
    0x0030 + i,
    DIGIT_SHIFT_SYMBOLS.codePointAt(i)!,
  ]);
}

function mapUsQwertyCode(code: string, shift: boolean): CodePoint {
  const pair = US_QWERTY_CODES.get(code);
  if (pair == null) {
    return 0x0000;
  }
  return shift ? pair[1] : pair[0];
}

export type Callbacks = {
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
} & Partial<InputListener>;

export class InputHandler implements Focusable {
  readonly #timeToType = new TimeToType();
  #callbacks: Callbacks = {};
  #input: HTMLElement | null = null;
  #bypassIme = false;

  setCallbacks(callbacks: Callbacks) {
    this.#callbacks = callbacks;
  }

  setBypassIme(enabled: boolean): void {
    this.#bypassIme = enabled;
  }

  setInput(input: HTMLElement | null) {
    if (input != null) {
      this.#input = input;
      this.#attachInput();
    } else {
      this.#detachInput();
      this.#input = null;
    }
  }

  focus() {
    this.#input?.focus();
  }

  blur() {
    this.#input?.blur();
  }

  #attachInput() {
    ModifierState.initialize();
    const input = this.#input;
    if (input != null) {
      input.addEventListener("focus", this.handleFocus);
      input.addEventListener("blur", this.handleBlur);
      input.addEventListener("keydown", this.handleKeyboard);
      input.addEventListener("keyup", this.handleKeyboard);
      input.addEventListener("input", this.handleInput as any);
      input.addEventListener("compositionstart", this.handleComposition);
      input.addEventListener("compositionupdate", this.handleComposition);
      input.addEventListener("compositionend", this.handleComposition);
    }
    this.focus();
    this.#clearInput();
  }

  #detachInput() {
    const input = this.#input;
    if (input != null) {
      input.removeEventListener("focus", this.handleFocus);
      input.removeEventListener("blur", this.handleBlur);
      input.removeEventListener("keydown", this.handleKeyboard);
      input.removeEventListener("keyup", this.handleKeyboard);
      input.removeEventListener("input", this.handleInput as any);
      input.removeEventListener("compositionstart", this.handleComposition);
      input.removeEventListener("compositionupdate", this.handleComposition);
      input.removeEventListener("compositionend", this.handleComposition);
    }
  }

  #clearInput() {
    const input = this.#input;
    if (input instanceof HTMLTextAreaElement) {
      // Keep the input value non-empty, otherwise Safari will not generate
      // events `deleteContentBackward` and `deleteWordBackward`.
      input.value = "?";
    }
  }

  handleFocus = () => {
    this.#callbacks.onFocus?.();
  };

  handleBlur = () => {
    this.#callbacks.onBlur?.();
  };

  handleKeyboard = (event: KeyboardEvent) => {
    if (process.env.NODE_ENV === "production") {
      if (!(event instanceof KeyboardEvent && event.isTrusted)) {
        return;
      }
    }
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    const mapped = mapEvent(event);
    if (isTextInput(mapped.modifiers) && event.key === "Tab") {
      event.preventDefault();
    }
    if (event.code) {
      this.#timeToType.add(mapped);
      switch (mapped.type) {
        case "keydown":
          this.#callbacks.onKeyDown?.(mapped);
          if (this.#bypassIme) {
            this.#handleBypassImeKeyDown(event, mapped);
          }
          break;
        case "keyup":
          this.#callbacks.onKeyUp?.(mapped);
          break;
      }
    }
  };

  #handleBypassImeKeyDown(event: KeyboardEvent, mapped: IKeyboardEvent) {
    if (event.code === "Backspace") {
      if (
        mapped.modifiers.includes("Alt") ||
        mapped.modifiers.includes("Meta")
      ) {
        return;
      }
      event.preventDefault();
      this.#callbacks.onInput?.({
        type: "input",
        timeStamp: mapped.timeStamp,
        inputType: mapped.modifiers.includes("Control")
          ? "clearWord"
          : "clearChar",
        codePoint: 0x0000,
        timeToType: this.#timeToType.measure(mapped),
      });
      return;
    }
    if (
      (event.code === "Enter" || event.code === "NumpadEnter") &&
      isTextInput(mapped.modifiers)
    ) {
      event.preventDefault();
      this.#callbacks.onInput?.({
        type: "input",
        timeStamp: mapped.timeStamp,
        inputType: "appendLineBreak",
        codePoint: 0x0000,
        timeToType: this.#timeToType.measure(mapped),
      });
      return;
    }
    if (isTextInput(mapped.modifiers)) {
      const codePoint = mapUsQwertyCode(
        event.code,
        mapped.modifiers.includes("Shift"),
      );
      if (codePoint > 0x0000) {
        event.preventDefault();
        this.#callbacks.onInput?.({
          type: "input",
          timeStamp: mapped.timeStamp,
          inputType: "appendChar",
          codePoint,
          timeToType: this.#timeToType.measure(mapped),
        });
      }
    }
  }

  handleInput = (event: InputEvent) => {
    if (this.#bypassIme) {
      return;
    }
    if (process.env.NODE_ENV === "production") {
      if (!(event instanceof InputEvent && event.isTrusted)) {
        return;
      }
    }
    switch (event.inputType) {
      case "insertText":
        this.#appendChar(event);
        this.#clearInput();
        break;
      case "insertLineBreak":
        this.#callbacks.onInput?.({
          type: "input",
          timeStamp: timeStampOf(event),
          inputType: "appendLineBreak",
          codePoint: 0x0000,
          timeToType: this.#timeToType.measure(event),
        });
        this.#clearInput();
        break;
      case "deleteContentBackward":
        this.#callbacks.onInput?.({
          type: "input",
          timeStamp: timeStampOf(event),
          inputType: "clearChar",
          codePoint: 0x0000,
          timeToType: this.#timeToType.measure(event),
        });
        this.#clearInput();
        break;
      case "deleteWordBackward":
        this.#callbacks.onInput?.({
          type: "input",
          timeStamp: timeStampOf(event),
          inputType: "clearWord",
          codePoint: 0x0000,
          timeToType: this.#timeToType.measure(event),
        });
        this.#clearInput();
        break;
      case "insertFromPaste":
        this.#clearInput();
        break;
    }
  };

  handleComposition = (event: CompositionEvent) => {
    if (this.#bypassIme) {
      return;
    }
    switch (event.type) {
      case "compositionstart":
      case "compositionupdate":
        break;
      case "compositionend":
        this.#appendChar(event);
        this.#clearInput();
        break;
    }
  };

  #appendChar(event: InputEvent | CompositionEvent) {
    const { data } = event;
    if (data != null && data.length > 0) {
      const codePoint = data.codePointAt(0) ?? 0x0000;
      if (codePoint > 0x0000) {
        this.#callbacks.onInput?.({
          type: "input",
          timeStamp: timeStampOf(event),
          inputType: "appendChar",
          codePoint,
          timeToType: this.#timeToType.measure(event),
        });
      }
    }
  }
}
