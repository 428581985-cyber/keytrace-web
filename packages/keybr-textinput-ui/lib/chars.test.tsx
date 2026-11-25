import { test } from "node:test";
import { Attr, textDisplaySettings, WhitespaceStyle } from "@keybr/textinput";
import { render } from "@testing-library/react";
import { deepEqual, equal, isNotNull, isNull } from "rich-assert";
import { findCursor, renderChars } from "./chars.tsx";

test("render empty chars", () => {
  deepEqual(renderChars(textDisplaySettings, []), []);
});

test("render simple chars", () => {
  deepEqual(
    renderChars(textDisplaySettings, [
      { codePoint: /* "a" */ 0x0061, attrs: Attr.Hit },
      { codePoint: /* "b" */ 0x0062, attrs: Attr.Miss },
      { codePoint: /* "c" */ 0x0063, attrs: Attr.Hit },
      { codePoint: /* " " */ 0x0020, attrs: Attr.Hit },
      { codePoint: /* "x" */ 0x0078, attrs: Attr.Cursor },
      { codePoint: /* "y" */ 0x0079, attrs: Attr.Normal },
      { codePoint: /* "z" */ 0x007a, attrs: Attr.Normal },
    ]),
    [
      <span
        key={0}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        a
      </span>,
      <span
        key={1}
        className={undefined}
        style={{ color: "var(--textinput--miss__color)" }}
      >
        b
      </span>,
      <span
        key={2}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        c
      </span>,
      <span
        key={3}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        {"\uE000"}
      </span>,
      <span
        key={4}
        className="cursor"
        style={{ color: "var(--textinput__color)" }}
      >
        x
      </span>,
      <span
        key={5}
        className={undefined}
        style={{ color: "var(--textinput__color)" }}
      >
        yz
      </span>,
    ],
  );
});

test("render styled chars", () => {
  deepEqual(
    renderChars(textDisplaySettings, [
      { codePoint: /* "a" */ 0x0061, attrs: Attr.Hit, cls: "keyword" },
      { codePoint: /* "b" */ 0x0062, attrs: Attr.Miss, cls: "keyword" },
      { codePoint: /* "c" */ 0x0063, attrs: Attr.Hit, cls: "keyword" },
      { codePoint: /* " " */ 0x0020, attrs: Attr.Hit, cls: "keyword" },
      { codePoint: /* "x" */ 0x0078, attrs: Attr.Cursor, cls: "keyword" },
      { codePoint: /* "y" */ 0x0079, attrs: Attr.Normal, cls: "keyword" },
      { codePoint: /* "z" */ 0x007a, attrs: Attr.Normal, cls: "keyword" },
    ]),
    [
      <span
        key={0}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        a
      </span>,
      <span
        key={1}
        className={undefined}
        style={{ color: "var(--textinput--miss__color)" }}
      >
        b
      </span>,
      <span
        key={2}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        c
      </span>,
      <span
        key={3}
        className={undefined}
        style={{ color: "var(--textinput--hit__color)" }}
      >
        {"\uE000"}
      </span>,
      <span
        key={4}
        className="cursor"
        style={{ color: "var(--syntax-keyword)" }}
      >
        x
      </span>,
      <span
        key={5}
        className={undefined}
        style={{ color: "var(--syntax-keyword)" }}
      >
        yz
      </span>,
    ],
  );
});

test("render special chars", () => {
  deepEqual(
    renderChars(textDisplaySettings, [
      { codePoint: 0x0000, attrs: Attr.Normal },
      { codePoint: 0x0009, attrs: Attr.Normal },
      { codePoint: 0x000a, attrs: Attr.Normal },
      { codePoint: 0x0020, attrs: Attr.Normal },
    ]),
    [
      <span
        key={0}
        className={undefined}
        style={{ color: "var(--textinput--special__color)" }}
      >
        U+0000
      </span>,
      <span
        key={1}
        className={undefined}
        style={{ color: "var(--textinput--special__color)" }}
      >
        {"\uE002"}
      </span>,
      <span
        key={2}
        className={undefined}
        style={{ color: "var(--textinput--special__color)" }}
      >
        {"\uE003"}
      </span>,
      <span
        key={3}
        className={undefined}
        style={{ color: "var(--textinput--special__color)" }}
      >
        {"\uE000"}
      </span>,
    ],
  );
});

test("render cursor char error highlight and badge threshold (2..10) for regular and whitespace chars", () => {
  // 1st error: red color + data-error-count="1", NO badge!
  deepEqual(
    renderChars(textDisplaySettings, [
      { codePoint: 0x0078, attrs: Attr.Cursor, cls: "keyword", errorCount: 1 },
    ]),
    [
      <span
        key={0}
        className="cursor"
        style={{ color: "var(--textinput--miss__color)" }}
        data-error-count="1"
      >
        x
      </span>,
    ],
  );

  // 2nd error: red color + data-error-badge="1" showing "2"
  deepEqual(
    renderChars(textDisplaySettings, [
      { codePoint: 0x0078, attrs: Attr.Cursor, errorCount: 2 },
    ]),
    [
      <span
        key={0}
        className="cursor"
        style={{ color: "var(--textinput--miss__color)" }}
        data-error-count="2"
      >
        x
        <span className="errorBadge" data-error-badge="1" aria-hidden={true}>
          2
        </span>
      </span>,
    ],
  );

  // >10 errors on space char: capped at "10", findCursor still returns exact .cursor element
  const r = render(
    <div>
      {renderChars(
        { ...textDisplaySettings, whitespaceStyle: WhitespaceStyle.Bar },
        [{ codePoint: 0x0020, attrs: Attr.Cursor, errorCount: 15 }],
      )}
    </div>,
  );
  const cursor = findCursor(r.container);
  isNotNull(cursor);
  equal(cursor.dataset.errorCount, "10");
  equal(cursor.style.color, "var(--textinput--miss__color)");
  const badge = cursor.querySelector<HTMLElement>("[data-error-badge='1']");
  isNotNull(badge);
  equal(badge.textContent, "10");
  r.unmount();

  // 1 error on space char: red color, NO badge
  const rOne = render(
    <div>
      {renderChars(textDisplaySettings, [
        { codePoint: 0x0020, attrs: Attr.Cursor, errorCount: 1 },
      ])}
    </div>,
  );
  const cursorOne = findCursor(rOne.container);
  isNotNull(cursorOne);
  equal(cursorOne.dataset.errorCount, "1");
  equal(cursorOne.style.color, "var(--textinput--miss__color)");
  isNull(cursorOne.querySelector("[data-error-badge='1']"));
  rOne.unmount();
});
