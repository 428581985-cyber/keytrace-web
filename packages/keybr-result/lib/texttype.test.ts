import { test } from "node:test";
import { Layout } from "@keybr/keyboard";
import { Histogram } from "@keybr/textinput";
import { equal } from "rich-assert";
import { Result } from "./result.ts";
import { hasKeyTraceResults, TextType } from "./texttype.ts";

test("TextType.KEYTRACE registration", () => {
  equal(TextType.KEYTRACE.id, "keytrace");
  equal(TextType.KEYTRACE.xid, 5);
  equal(TextType.ALL.get("keytrace"), TextType.KEYTRACE);
  equal(TextType.ALL.xget(5), TextType.KEYTRACE);
});

test("hasKeyTraceResults detects KEYTRACE origin", () => {
  const mk = (textType: TextType) =>
    new Result(Layout.EN_US, textType, 1000, 100, 10000, 0, Histogram.empty);

  equal(hasKeyTraceResults([]), false);
  equal(hasKeyTraceResults([mk(TextType.GENERATED), mk(TextType.NATURAL)]), false);
  equal(
    hasKeyTraceResults([mk(TextType.GENERATED), mk(TextType.KEYTRACE)]),
    true,
  );
});
