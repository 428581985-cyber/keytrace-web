import { test } from "node:test";
import {
  Attr,
  CaretShapeStyle,
  textDisplaySettings,
  TextInput,
  WhitespaceStyle,
} from "@keybr/textinput";
import { render } from "@testing-library/react";
import { equal, isNotNull, isNull } from "rich-assert";
import { findCursor } from "./chars.tsx";
import { TextLines } from "./TextLines.tsx";

test("render chars", () => {
  const r = render(
    <TextLines
      settings={textDisplaySettings}
      lines={{
        text: "abcd",
        lines: [
          {
            text: "abcd",
            chars: [
              { codePoint: /* "a" */ 0x0061, attrs: Attr.Miss },
              { codePoint: /* "b" */ 0x0062, attrs: Attr.Hit },
              { codePoint: /* "c" */ 0x0063, attrs: Attr.Cursor },
              { codePoint: /* "d" */ 0x0064, attrs: Attr.Normal },
            ],
          },
        ],
      }}
      cursor={false}
      focus={true}
    />,
  );

  equal(r.container.textContent, "abcd");

  r.unmount();
});

test("render chars with line template", () => {
  const r = render(
    <TextLines
      settings={textDisplaySettings}
      lines={{
        text: "abcd",
        lines: [
          {
            text: "abcd",
            chars: [
              { codePoint: /* "a" */ 0x0061, attrs: Attr.Miss },
              { codePoint: /* "b" */ 0x0062, attrs: Attr.Hit },
              { codePoint: /* "c" */ 0x0063, attrs: Attr.Cursor },
              { codePoint: /* "d" */ 0x0064, attrs: Attr.Normal },
            ],
          },
        ],
      }}
      cursor={false}
      focus={true}
      lineTemplate={({ children }) => <div>[{children}]</div>}
    />,
  );

  equal(r.container.textContent, "[abcd]");

  r.unmount();
});

test("TextLines shows error highlight on 1st miss and badge 2..10 for both stopOnError=true and stopOnError=false (regular char + space)", () => {
  for (const stopOnError of [true, false]) {
    const ti = new TextInput("a b", {
      stopOnError,
      forgiveErrors: false,
      spaceSkipsWords: false,
    });
    const settings = {
      ...textDisplaySettings,
      caretShapeStyle: CaretShapeStyle.Block,
      whitespaceStyle: WhitespaceStyle.Bullet,
    };

    const r = render(
      <TextLines
        settings={settings}
        lines={ti.lines}
        cursor={true}
        focus={true}
      />,
    );

    const rerenderLines = () => {
      r.rerender(
        <TextLines
          settings={settings}
          lines={ti.lines}
          cursor={true}
          focus={true}
        />,
      );
    };

    const getCaret = () =>
      r.container.firstElementChild?.firstElementChild as HTMLElement | null;

    // Initially clean: no badge, no cursor error, Block caret shows "a".
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(getCaret()?.dataset.cursorError, undefined);
    equal(getCaret()?.textContent, "a");

    // 1st error on 'a': red highlight + cursor error, NO badge!
    ti.appendChar(100, "x".codePointAt(0)!, 100);
    rerenderLines();
    isNull(r.container.querySelector("[data-error-badge='1']"));
    const cursor1 = findCursor(r.container);
    isNotNull(cursor1);
    equal(cursor1.dataset.errorCount, "1");
    equal(cursor1.style.color, "var(--textinput--miss__color)");
    equal(getCaret()?.dataset.cursorError, "1");
    equal(getCaret()?.style.backgroundColor, "var(--textinput--miss__color)");
    equal(getCaret()?.textContent, "a");

    // 2nd through 10th consecutive errors -> badge "2".."10" (Block caret stays "a", NOT "a2"!).
    for (let n = 2; n <= 10; n++) {
      ti.appendChar(n * 100, "x".codePointAt(0)!, 100);
      rerenderLines();
      const badge = r.container.querySelector<HTMLElement>(
        "[data-error-badge='1']",
      );
      isNotNull(badge);
      equal(badge.textContent, String(n));
      equal(getCaret()?.textContent, "a");
    }

    // 11th error stays capped at "10".
    ti.appendChar(1100, "x".codePointAt(0)!, 100);
    rerenderLines();
    equal(
      r.container.querySelector("[data-error-badge='1']")?.textContent,
      "10",
    );

    // Backspace decrements 10 -> 9 -> ... -> 2 -> 1 (badge hides) -> 0 (error clears).
    ti.clearChar();
    rerenderLines();
    equal(
      r.container.querySelector("[data-error-badge='1']")?.textContent,
      "9",
    );
    for (let i = 0; i < 8; i++) {
      ti.clearChar();
    }
    rerenderLines();
    // At errorCount = 1: NO badge, still red highlight!
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(findCursor(r.container)?.dataset.errorCount, "1");
    equal(getCaret()?.dataset.cursorError, "1");

    // Clear last error -> back to clean state; type 'a' -> advances to space ' '.
    ti.clearChar();
    rerenderLines();
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(findCursor(r.container)?.dataset.errorCount, undefined);
    equal(getCaret()?.dataset.cursorError, undefined);

    ti.appendChar(1200, "a".codePointAt(0)!, 100);
    rerenderLines();
    equal(getCaret()?.textContent, "\uE000");

    // Test whitespace/space char errors: 1st miss -> red no badge, 2nd miss -> badge "2", space recovers -> clears!
    ti.appendChar(1300, "z".codePointAt(0)!, 100);
    rerenderLines();
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(findCursor(r.container)?.dataset.errorCount, "1");
    equal(getCaret()?.dataset.cursorError, "1");

    ti.appendChar(1400, "z".codePointAt(0)!, 100);
    rerenderLines();
    equal(
      r.container.querySelector("[data-error-badge='1']")?.textContent,
      "2",
    );
    equal(getCaret()?.textContent, "\uE000");

    // Recover space (for stopOnError=false + forgiveErrors=false, clear garbage first).
    if (!stopOnError) {
      ti.clearChar();
      ti.clearChar();
    }
    ti.appendChar(1500, " ".codePointAt(0)!, 100);
    rerenderLines();
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(findCursor(r.container)?.dataset.errorCount, undefined);
    equal(getCaret()?.dataset.cursorError, undefined);
    equal(getCaret()?.textContent, "b");

    r.unmount();
  }
});

test("TextLines Cursor reflects error color across Underline, Box, Line, and Block carets and resets on recovery", () => {
  for (const caretShapeStyle of [
    CaretShapeStyle.Underline,
    CaretShapeStyle.Box,
    CaretShapeStyle.Line,
    CaretShapeStyle.Block,
  ]) {
    const ti = new TextInput("ab", {
      stopOnError: true,
      forgiveErrors: false,
      spaceSkipsWords: false,
    });
    const settings = { ...textDisplaySettings, caretShapeStyle };
    const r = render(
      <TextLines
        settings={settings}
        lines={ti.lines}
        cursor={true}
        focus={true}
      />,
    );
    const getCaret = () =>
      r.container.firstElementChild?.firstElementChild as HTMLElement | null;

    ti.appendChar(100, "z".codePointAt(0)!, 100);
    ti.appendChar(200, "z".codePointAt(0)!, 100);
    r.rerender(
      <TextLines
        settings={settings}
        lines={ti.lines}
        cursor={true}
        focus={true}
      />,
    );
    equal(
      r.container.querySelector("[data-error-badge='1']")?.textContent,
      "2",
    );
    equal(getCaret()?.dataset.cursorError, "1");
    if (caretShapeStyle === CaretShapeStyle.Box) {
      equal(getCaret()?.style.borderColor, "var(--textinput--miss__color)");
    } else {
      equal(getCaret()?.style.backgroundColor, "var(--textinput--miss__color)");
    }

    ti.appendChar(300, "a".codePointAt(0)!, 100);
    r.rerender(
      <TextLines
        settings={settings}
        lines={ti.lines}
        cursor={true}
        focus={true}
      />,
    );
    isNull(r.container.querySelector("[data-error-badge='1']"));
    equal(getCaret()?.dataset.cursorError, undefined);
    if (caretShapeStyle === CaretShapeStyle.Box) {
      equal(
        getCaret()?.style.borderColor,
        "var(--textinput-cursor__background-color)",
      );
    } else {
      equal(
        getCaret()?.style.backgroundColor,
        "var(--textinput-cursor__background-color)",
      );
    }
    r.unmount();
  }
});
