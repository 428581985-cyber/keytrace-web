import { test } from "node:test";
import { Layout, type ZhSchemeId } from "@keybr/keyboard";
import { Letter } from "@keybr/phonetic-model";
import { equal } from "rich-assert";
import {
  orderZhLetters,
  ZH_CURRICULUM_ORDER,
  ZH_KEYBOARD_ORDER,
} from "./zh-curriculum.ts";

const SCHEMES: readonly {
  readonly id: ZhSchemeId;
  readonly layout: Layout;
  readonly usesSemicolon: boolean;
}[] = [
  { id: "zh-sp", layout: Layout.ZH_SP, usesSemicolon: false },
  { id: "zh-sp-zrm", layout: Layout.ZH_SP_ZRM, usesSemicolon: false },
  { id: "zh-sp-ms", layout: Layout.ZH_SP_MS, usesSemicolon: true },
  { id: "zh-sp-sg", layout: Layout.ZH_SP_SG, usesSemicolon: true },
  { id: "zh-qp", layout: Layout.ZH_QP, usesSemicolon: false },
];

test("ZH curriculum orders are exact permutations of each scheme alphabet", () => {
  for (const { id, usesSemicolon } of SCHEMES) {
    const expected = usesSemicolon
      ? "abcdefghijklmnopqrstuvwxyz;"
      : "abcdefghijklmnopqrstuvwxyz";
    for (const seq of [ZH_CURRICULUM_ORDER[id], ZH_KEYBOARD_ORDER[id]]) {
      equal(seq.length, expected.length);
      equal([...seq].sort().join(""), [...expected].sort().join(""));
    }
  }
});

test("orderZhLetters follows scheme order and places semicolon at stage 24 for MS/SG", () => {
  const letters = [..."abcdefghijklmnopqrstuvwxyz;"].map(
    (ch) => new Letter(ch.codePointAt(0)!, ch === ";" ? 0.025 : 0, ch),
  );

  const msOrder = orderZhLetters(Layout.ZH_SP_MS, letters, false)
    .map((l) => String.fromCodePoint(l.codePoint))
    .join("");
  equal(msOrder, ZH_CURRICULUM_ORDER["zh-sp-ms"]);
  equal(msOrder.indexOf(";"), 23); // 24th key (0-indexed 23), never #1

  const qpOrder = orderZhLetters(
    Layout.ZH_QP,
    letters.filter((l) => l.codePoint !== 0x003b),
    false,
  )
    .map((l) => String.fromCodePoint(l.codePoint))
    .join("");
  equal(qpOrder, ZH_CURRICULUM_ORDER["zh-qp"]);

  const qpKbOrder = orderZhLetters(
    Layout.ZH_QP,
    letters.filter((l) => l.codePoint !== 0x003b),
    true,
  )
    .map((l) => String.fromCodePoint(l.codePoint))
    .join("");
  equal(qpKbOrder, ZH_KEYBOARD_ORDER["zh-qp"]);
});
