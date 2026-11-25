import { test } from "node:test";
import { deepEqual, equal, isFalse, isTrue } from "rich-assert";
import {
  Attr,
  charArraysAreEqual,
  charsAreEqual,
  flattenStyledText,
  splitStyledText,
} from "./chars.ts";

test("flatten styled text", () => {
  equal(flattenStyledText("abc"), "abc");
  equal(flattenStyledText([["abc"]]), "abc");
  equal(flattenStyledText([{ text: "xyz", cls: "c1" }]), "xyz");
  equal(flattenStyledText([["abc"], [{ text: "xyz", cls: "c1" }]]), "abcxyz");
});

test("split styled text", () => {
  deepEqual(splitStyledText("abc"), [
    { codePoint: 0x0061, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0062, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0063, attrs: Attr.Normal, cls: null },
  ]);
  deepEqual(splitStyledText([["abc"]]), [
    { codePoint: 0x0061, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0062, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0063, attrs: Attr.Normal, cls: null },
  ]);
  deepEqual(splitStyledText([[{ text: "xyz", cls: "c1" }]]), [
    { codePoint: 0x0078, attrs: Attr.Normal, cls: "c1" },
    { codePoint: 0x0079, attrs: Attr.Normal, cls: "c1" },
    { codePoint: 0x007a, attrs: Attr.Normal, cls: "c1" },
  ]);
  deepEqual(splitStyledText([["abc"], [{ text: "xyz", cls: "c1" }]]), [
    { codePoint: 0x0061, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0062, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0063, attrs: Attr.Normal, cls: null },
    { codePoint: 0x0078, attrs: Attr.Normal, cls: "c1" },
    { codePoint: 0x0079, attrs: Attr.Normal, cls: "c1" },
    { codePoint: 0x007a, attrs: Attr.Normal, cls: "c1" },
  ]);
});

test("equal chars", () => {
  isTrue(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c1" },
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c1" },
    ),
  );
  isFalse(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c1" },
      { codePoint: 0x0062, attrs: Attr.Normal, cls: "c1" },
    ),
  );
  isFalse(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c1" },
      { codePoint: 0x0061, attrs: Attr.Hit, cls: "c1" },
    ),
  );
  isFalse(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c1" },
      { codePoint: 0x0061, attrs: Attr.Normal, cls: "c2" },
    ),
  );
  isTrue(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null },
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 0 },
    ),
  );
  isTrue(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 2 },
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 2 },
    ),
  );
  isFalse(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null },
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 1 },
    ),
  );
  isFalse(
    charsAreEqual(
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 1 },
      { codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 2 },
    ),
  );
  isFalse(
    charArraysAreEqual(
      [{ codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 1 }],
      [{ codePoint: 0x0061, attrs: Attr.Cursor, cls: null, errorCount: 2 }],
    ),
  );
});
