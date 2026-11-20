import { type Focusable } from "@keybr/widget";
import {
  type CSSProperties,
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { type Callbacks, InputHandler } from "./inputhandler.ts";

export const TextEvents = memo(function TextEvents({
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  onInput,
  focusRef,
  bypassIme,
}: Callbacks & {
  readonly focusRef?: RefObject<Focusable | null>;
  readonly bypassIme?: boolean;
}): ReactNode {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const handler = useInputHandler();
  useImperativeHandle(focusRef, () => handler);
  handler.setBypassIme(Boolean(bypassIme));
  useEffect(() => {
    handler.setInput(bypassIme ? divRef.current : inputRef.current);
    return () => {
      handler.setInput(null);
    };
  }, [handler, bypassIme]);
  handler.setCallbacks({ onFocus, onBlur, onKeyDown, onKeyUp, onInput });
  return (
    <div style={divStyle}>
      {bypassIme ? (
        <div
          ref={divRef}
          tabIndex={0}
          role="textbox"
          aria-readonly="true"
          style={inputStyle}
        />
      ) : (
        <textarea
          ref={inputRef}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          style={inputStyle}
        />
      )}
    </div>
  );
});

function useInputHandler() {
  const [handler] = useState(() => new InputHandler());
  return handler;
}

const divStyle = {
  position: "absolute",
  insetInlineStart: "0px",
  insetBlockStart: "0px",
  inlineSize: "0px",
  blockSize: "0px",
  overflow: "hidden",
} satisfies CSSProperties;

const inputStyle = {
  display: "block",
  margin: "0px",
  padding: "0px",
  inlineSize: "1em",
  blockSize: "1em",
  border: "none",
  outline: "none",
} satisfies CSSProperties;
