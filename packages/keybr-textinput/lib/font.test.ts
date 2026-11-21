import { test } from "node:test";
import { Language } from "@keybr/keyboard";
import { equal, isNotNull, isTrue } from "rich-assert";
import { Font } from "./font.ts";

test("select fonts for each language", () => {
  for (const language of Language.ALL) {
    const fonts = Font.select(language);
    isTrue(fonts.size > 0);
    for (const font of Font.ALL) {
      isNotNull(Font.find(fonts, font));
    }
  }
});

test("select Chinese fonts for zh-sp with Songti default", () => {
  const fonts = Font.select(Language.ZH_SP);
  equal(fonts.size, 7);
  equal(fonts.at(0).name, "宋体");
  for (const font of fonts) {
    isTrue(font.scripts.includes("han"));
  }
});
