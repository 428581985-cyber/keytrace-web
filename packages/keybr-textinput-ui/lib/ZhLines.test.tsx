import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Language } from "@keybr/keyboard";
import { Settings } from "@keybr/settings";
import {
  CaretMovementStyle,
  CaretShapeStyle,
  Font,
  type TextDisplaySettings,
  textDisplaySettings,
  TextInput,
  toTextInputSettings,
  WhitespaceStyle,
} from "@keybr/textinput";
import { render } from "@testing-library/react";
import { equal, isNotNull, isNull, isTrue } from "rich-assert";
import { StaticText } from "./StaticText.tsx";
import { ZhLines } from "./ZhLines.tsx";

test("ZhLines renders punctuation attached to preceding word without space", () => {
  const ti = new TextInput("dage,ykgo uiwu.glxi", toTextInputSettings(new Settings()));
  const r = render(
    <FakeIntlProvider>
      <ZhLines lines={ti.lines} focus={true} showToggle={false} cursor={false} />
    </FakeIntlProvider>,
  );

  const text = r.container.textContent ?? "";
  // Should contain Chinese punctuation immediately followed by next word, and middle dot only for space.
  equal(text.includes("，") && text.includes("。") && text.includes("\u00b7"), true);
  equal(text.includes("，\u00b7") || text.includes("\u00b7，"), false);
  equal(text.includes("。\u00b7") || text.includes("\u00b7。"), false);
  isNull(r.container.querySelector("[data-cursor='1']"));

  r.unmount();
});

test("ZhLines nests trailing space inside preceding word element so line wraps never start with dot", () => {
  const ti = new TextInput("dage ykgo uiwu", toTextInputSettings(new Settings()));
  const r = render(
    <FakeIntlProvider>
      <ZhLines lines={ti.lines} focus={true} showToggle={false} cursor={false} />
    </FakeIntlProvider>,
  );

  const words = [...r.container.querySelectorAll("[data-word='1']")];
  equal(words.length, 3);
  isNotNull(words[0].querySelector("[data-space='1']"));
  isNotNull(words[1].querySelector("[data-space='1']"));
  isNull(words[2].querySelector("[data-space='1']"));
  // All spaces belong inside a word wrapper; none sit as bare line children.
  equal(r.container.querySelectorAll("[data-space='1']").length, 2);
  equal(r.container.querySelectorAll("[data-word='1'] [data-space='1']").length, 2);

  r.unmount();
});

test("ZhLines applies whitespace styles, Chinese font, caret shapes, and caret movement", () => {
  const ti = new TextInput("dage ykgo", toTextInputSettings(new Settings()));
  const zhFonts = Font.select(Language.ZH_SP);
  const yahei = [...zhFonts].find((f) => f.name === "微软雅黑") ?? zhFonts.at(0);

  for (const [whitespaceStyle, selector] of [
    [WhitespaceStyle.Bullet, "[data-dot='1']"],
    [WhitespaceStyle.Bar, "[data-bar='1']"],
    [WhitespaceStyle.Space, "[data-space='1']"],
  ] as const) {
    const settings: TextDisplaySettings = {
      ...textDisplaySettings,
      language: Language.ZH_SP,
      font: yahei,
      whitespaceStyle,
      caretShapeStyle: CaretShapeStyle.Block,
      caretMovementStyle: CaretMovementStyle.Jumping,
    };
    const r = render(
      <FakeIntlProvider>
        <ZhLines settings={settings} lines={ti.lines} focus={true} showToggle={false} />
      </FakeIntlProvider>,
    );

    isNotNull(r.container.querySelector(selector));
    if (whitespaceStyle === WhitespaceStyle.Space) {
      isNull(r.container.querySelector("[data-dot='1']"));
      isNull(r.container.querySelector("[data-bar='1']"));
      equal(r.container.querySelector("[data-space='1']")?.textContent, "\u00a0");
    }

    const hanzi = r.container.querySelector<HTMLElement>("[data-hanzi='1']");
    isNotNull(hanzi);
    isTrue(hanzi.style.fontFamily.includes("Microsoft YaHei"));

    const cursor = r.container.querySelector<HTMLElement>("[data-caret-shape]");
    isNotNull(cursor);
    equal(cursor.dataset.caretShape, String(CaretShapeStyle.Block));
    equal(cursor.dataset.caretMovement, String(CaretMovementStyle.Jumping));
    equal(cursor.style.transition, "none");

    r.unmount();
  }

  for (const caretShapeStyle of [
    CaretShapeStyle.Block,
    CaretShapeStyle.Box,
    CaretShapeStyle.Line,
    CaretShapeStyle.Underline,
  ]) {
    const settings: TextDisplaySettings = {
      ...textDisplaySettings,
      language: Language.ZH_SP,
      font: yahei,
      caretShapeStyle,
      caretMovementStyle: CaretMovementStyle.Smooth,
    };
    const r = render(
      <FakeIntlProvider>
        <ZhLines settings={settings} lines={ti.lines} focus={true} showToggle={false} />
      </FakeIntlProvider>,
    );
    const cursor = r.container.querySelector<HTMLElement>("[data-caret-shape]");
    isNotNull(cursor);
    equal(cursor.dataset.caretShape, String(caretShapeStyle));
    equal(cursor.dataset.caretMovement, String(CaretMovementStyle.Smooth));
    r.unmount();
  }
});

test("StaticText with zh=true or ZH_SP settings renders Chinese characters without toggle", () => {
  const ti = new TextInput("dage ykgo", toTextInputSettings(new Settings()));
  const r = render(
    <FakeIntlProvider>
      <StaticText lines={ti.lines} zh={true} />
    </FakeIntlProvider>,
  );

  equal(r.container.querySelectorAll("input[type='checkbox']").length, 0);
  const text = r.container.textContent ?? "";
  equal(/[\u4e00-\u9fff]/.test(text), true);

  r.unmount();

  const exampleTi = new TextInput("mwtm jmii tiug uuru sudu.", toTextInputSettings(new Settings()));
  const rAuto = render(
    <FakeIntlProvider>
      <StaticText
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={exampleTi.lines}
      />
    </FakeIntlProvider>,
  );
  equal(rAuto.container.querySelectorAll("input[type='checkbox']").length, 0);
  const hanziText = [
    ...rAuto.container.querySelectorAll("[data-hanzi='1']"),
  ]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(hanziText, "每天坚持提升输入速度。");
  rAuto.unmount();
});
