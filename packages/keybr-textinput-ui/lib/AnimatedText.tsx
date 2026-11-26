import { Tasks } from "@keybr/lang";
import {
  type Char,
  type TextDisplaySettings,
  TextInput,
} from "@keybr/textinput";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { StaticText } from "./StaticText.tsx";
import { type TextLineSize } from "./TextLines.tsx";

export function AnimatedText({
  settings,
  text,
  wrap,
  size,
}: {
  readonly settings: TextDisplaySettings;
  readonly text: string;
  readonly wrap?: boolean;
  readonly size?: TextLineSize;
}): ReactNode {
  const chars = useAnimatedTextState(text);
  return (
    <StaticText
      settings={settings}
      lines={{ text, lines: [{ text, chars }] }}
      cursor={true}
      wrap={wrap}
      size={size}
    />
  );
}

function useAnimatedTextState(text: string): readonly Char[] {
  const textInput = useMemo(
    () =>
      new TextInput(text, {
        stopOnError: false,
        forgiveErrors: false,
        spaceSkipsWords: false,
      }),
    [text],
  );
  const [state, setState] = useState<{
    readonly textInput: TextInput;
    readonly chars: readonly Char[];
  }>(() => ({ textInput, chars: textInput.chars }));
  useEffect(() => {
    const tasks = new Tasks();
    tasks.repeated(500, () => {
      if (textInput.completed) {
        textInput.reset();
      } else {
        textInput.appendChar(0, textInput.at(textInput.pos).codePoint, 0);
      }
      setState({ textInput, chars: textInput.chars });
    });
    return () => {
      tasks.cancelAll();
    };
  }, [textInput]);
  return state.textInput === textInput ? state.chars : textInput.chars;
}
