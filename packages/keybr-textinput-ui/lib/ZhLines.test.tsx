import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Language, Layout } from "@keybr/keyboard";
import { Settings } from "@keybr/settings";
import {
  Attr,
  CaretMovementStyle,
  CaretShapeStyle,
  Font,
  type LineList,
  type TextDisplaySettings,
  textDisplaySettings,
  TextInput,
  toTextInputSettings,
  WhitespaceStyle,
} from "@keybr/textinput";
import { fireEvent, render } from "@testing-library/react";
import { equal, isNotNull, isNull, isTrue } from "rich-assert";
import { StaticText } from "./StaticText.tsx";
import { TextArea } from "./TextArea.tsx";
import { ZhLines } from "./ZhLines.tsx";

test("ZhLines renders punctuation attached to preceding word without space", () => {
  const ti = new TextInput(
    "dage,ykgo uiwu.glxi",
    toTextInputSettings(new Settings()),
  );
  const r = render(
    <FakeIntlProvider>
      <ZhLines
        lines={ti.lines}
        focus={true}
        showToggle={false}
        cursor={false}
      />
    </FakeIntlProvider>,
  );

  const text = r.container.textContent ?? "";
  // Should contain Chinese punctuation immediately followed by next word, and middle dot only for space.
  equal(
    text.includes("，") && text.includes("。") && text.includes("\u00b7"),
    true,
  );
  equal(text.includes("，\u00b7") || text.includes("\u00b7，"), false);
  equal(text.includes("。\u00b7") || text.includes("\u00b7。"), false);
  isNull(r.container.querySelector("[data-cursor='1']"));

  r.unmount();
});

test("ZhLines nests trailing space inside preceding word element so line wraps never start with dot", () => {
  const ti = new TextInput(
    "dage ykgo uiwu",
    toTextInputSettings(new Settings()),
  );
  const r = render(
    <FakeIntlProvider>
      <ZhLines
        lines={ti.lines}
        focus={true}
        showToggle={false}
        cursor={false}
      />
    </FakeIntlProvider>,
  );

  const words = [...r.container.querySelectorAll("[data-word='1']")];
  equal(words.length, 3);
  isNotNull(words[0].querySelector("[data-space='1']"));
  isNotNull(words[1].querySelector("[data-space='1']"));
  isNull(words[2].querySelector("[data-space='1']"));
  // All spaces belong inside a word wrapper; none sit as bare line children.
  equal(r.container.querySelectorAll("[data-space='1']").length, 2);
  equal(
    r.container.querySelectorAll("[data-word='1'] [data-space='1']").length,
    2,
  );

  r.unmount();
});

test("ZhLines applies whitespace styles, Chinese font, caret shapes, and caret movement", () => {
  const ti = new TextInput("dage ykgo", toTextInputSettings(new Settings()));
  const zhFonts = Font.select(Language.ZH_SP);
  const yahei =
    [...zhFonts].find((f) => f.name === "微软雅黑") ?? zhFonts.at(0);

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
        <ZhLines
          settings={settings}
          lines={ti.lines}
          focus={true}
          showToggle={false}
        />
      </FakeIntlProvider>,
    );

    isNotNull(r.container.querySelector(selector));
    if (whitespaceStyle === WhitespaceStyle.Space) {
      isNull(r.container.querySelector("[data-dot='1']"));
      isNull(r.container.querySelector("[data-bar='1']"));
      equal(
        r.container.querySelector("[data-space='1']")?.textContent,
        "\u00a0",
      );
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
        <ZhLines
          settings={settings}
          lines={ti.lines}
          focus={true}
          showToggle={false}
        />
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

  const exampleTi = new TextInput(
    "mwtm jmii tiug uuru sudu.",
    toTextInputSettings(new Settings()),
  );
  const rAuto = render(
    <FakeIntlProvider>
      <StaticText
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={exampleTi.lines}
      />
    </FakeIntlProvider>,
  );
  equal(rAuto.container.querySelectorAll("input[type='checkbox']").length, 0);
  const hanziText = [...rAuto.container.querySelectorAll("[data-hanzi='1']")]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(hanziText, "每天坚持提升输入速度。");
  rAuto.unmount();
});

test("ZhLines in zh-qp mode slices variable-length words (fangan, zhuang 6-key, lv, nve) with in-flow pinyin", () => {
  const ti = new TextInput(
    "fangan zhuang lv nve",
    toTextInputSettings(new Settings()),
  );
  const settings: TextDisplaySettings = {
    ...textDisplaySettings,
    language: Language.ZH_QP,
  };
  const r = render(
    <FakeIntlProvider>
      <ZhLines
        settings={settings}
        lines={ti.lines}
        focus={true}
        showToggle={false}
        cursor={false}
      />
    </FakeIntlProvider>,
  );

  const root = r.container.querySelector<HTMLElement>("[data-scheme]");
  isNotNull(root);
  equal(root.dataset.scheme, "zh-qp");

  const words = [
    ...r.container.querySelectorAll<HTMLElement>("[data-word='1']"),
  ];
  equal(words.length, 4);
  // Trailing spaces nested inside preceding words, never bare or on last word.
  isNotNull(words[0].querySelector("[data-space='1']"));
  isNotNull(words[1].querySelector("[data-space='1']"));
  isNotNull(words[2].querySelector("[data-space='1']"));
  isNull(words[3].querySelector("[data-space='1']"));
  equal(r.container.querySelectorAll("[data-space='1']").length, 3);
  equal(
    r.container.querySelectorAll("[data-word='1'] [data-space='1']").length,
    3,
  );

  // Word 0: fangan -> 方案 [4, 2]
  const w0Units = [
    ...words[0].querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(w0Units.length, 2);
  equal(w0Units[0].dataset.segments, "4");
  equal(w0Units[0].querySelector("[data-code='1']")?.textContent, "fang");
  equal(w0Units[0].querySelector("[data-hanzi='1']")?.textContent, "方");
  equal(w0Units[1].dataset.segments, "2");
  equal(w0Units[1].querySelector("[data-code='1']")?.textContent, "an");
  equal(w0Units[1].querySelector("[data-hanzi='1']")?.textContent, "案");

  // Word 1: zhuang -> 6-key single char
  const w1Units = [
    ...words[1].querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(w1Units.length, 1);
  equal(w1Units[0].dataset.segments, "6");
  equal(w1Units[0].querySelector("[data-code='1']")?.textContent, "zhuang");
  isTrue(
    /[\u4e00-\u9fff]/.test(
      w1Units[0].querySelector("[data-hanzi='1']")?.textContent ?? "",
    ),
  );

  // Word 2 & 3: lv (2-key) and nve (3-key)
  const w2Units = [
    ...words[2].querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(w2Units.length, 1);
  equal(w2Units[0].dataset.segments, "2");
  equal(w2Units[0].querySelector("[data-code='1']")?.textContent, "lv");
  isTrue(
    /[\u4e00-\u9fff]/.test(
      w2Units[0].querySelector("[data-hanzi='1']")?.textContent ?? "",
    ),
  );

  const w3Units = [
    ...words[3].querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(w3Units.length, 1);
  equal(w3Units[0].dataset.segments, "3");
  equal(w3Units[0].querySelector("[data-code='1']")?.textContent, "nve");
  isTrue(
    /[\u4e00-\u9fff]/.test(
      w3Units[0].querySelector("[data-hanzi='1']")?.textContent ?? "",
    ),
  );

  // Anti-overlap layout: in-flow flex pinyin (position: static) & minWidth >= 28px.
  const codeEls = [
    ...r.container.querySelectorAll<HTMLElement>("[data-code='1']"),
  ];
  equal(codeEls.length, 5);
  for (const el of codeEls) {
    equal(el.style.position, "static");
  }
  for (const el of r.container.querySelectorAll<HTMLElement>(
    "[data-unit='1']",
  )) {
    equal(el.dataset.inflow, "1");
    equal(el.style.minWidth, "28px");
  }

  r.unmount();
});

test("ZhLines in zh-qp mode attaches punctuation without space and keeps trailing space dots", () => {
  const ti = new TextInput(
    "fangan,meitian jianchi.shuru",
    toTextInputSettings(new Settings()),
  );
  const r = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_QP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
        cursor={false}
      />
    </FakeIntlProvider>,
  );

  const hanziText = [
    ...r.container.querySelectorAll<HTMLElement>("[data-hanzi='1']"),
  ]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(hanziText, "方案，每天坚持。输入");

  const text = r.container.textContent ?? "";
  equal(text.includes("\u00b7"), true);
  equal(text.includes("，\u00b7") || text.includes("\u00b7，"), false);
  equal(text.includes("。\u00b7") || text.includes("\u00b7。"), false);
  equal(r.container.querySelectorAll("[data-space='1']").length, 1);
  equal(
    r.container.querySelectorAll("[data-word='1'] [data-space='1']").length,
    1,
  );

  r.unmount();
});

test("ZhLines in zh-qp mode renders N-segment cursor and per-key gradient progress for 6-key syllable", () => {
  const ti = new TextInput("zhuang fangan", {
    stopOnError: true,
    forgiveErrors: false,
    spaceSkipsWords: false,
  });
  // Type z (hit), h (hit), x (typo), u (miss recovery) -> cursor at 'a' (index 3 of 6)
  ti.appendChar(100, "z".codePointAt(0)!, 100);
  ti.appendChar(200, "h".codePointAt(0)!, 100);
  ti.appendChar(300, "x".codePointAt(0)!, 100);
  ti.appendChar(400, "u".codePointAt(0)!, 100);

  const rUnderline = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{
          ...textDisplaySettings,
          language: Language.ZH_QP,
          caretShapeStyle: CaretShapeStyle.Underline,
        }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );

  const cursorEl =
    rUnderline.container.querySelector<HTMLElement>("[data-caret-shape]");
  isNotNull(cursorEl);
  equal(cursorEl.dataset.cursorSegments, "6");
  equal(cursorEl.dataset.cursorActiveIndex, "3");

  const segEls = [
    ...cursorEl.querySelectorAll<HTMLElement>("[data-cursor-segment]"),
  ];
  equal(segEls.length, 6);
  equal(segEls[3].dataset.cursorActive, "1");
  equal(segEls[4].style.opacity, "0.35");

  // Hanzi gradient reflects 2 hits (0..33.3333%), 1 miss (33.3333..50%), 3 todo (50..100%).
  const firstHanzi =
    rUnderline.container.querySelector<HTMLElement>("[data-hanzi='1']");
  isNotNull(firstHanzi);
  isTrue(firstHanzi.style.backgroundImage.includes("linear-gradient(90deg"));
  isTrue(firstHanzi.style.backgroundImage.includes("33.3333%"));
  isTrue(firstHanzi.style.backgroundImage.includes("50%"));

  // Active pinyin letter ('a' at index 3) is marked active.
  const activeCodeChar = rUnderline.container.querySelector<HTMLElement>(
    "[data-code-active='1']",
  );
  isNotNull(activeCodeChar);
  equal(activeCodeChar.textContent, "a");

  rUnderline.unmount();

  const rBlock = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{
          ...textDisplaySettings,
          language: Language.ZH_QP,
          caretShapeStyle: CaretShapeStyle.Block,
        }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  const blockSegs = [
    ...rBlock.container.querySelectorAll<HTMLElement>("[data-cursor-segment]"),
  ];
  equal(blockSegs.length, 6);
  equal(blockSegs[3].style.opacity, "0.34");
  equal(blockSegs[0].style.opacity, "0.16");
  rBlock.unmount();
});

test("ZhLines isolates showCode storage and toggle labels between zh-sp and zh-qp", () => {
  const prevSp = window.localStorage.getItem("keytrace.zh.showCode");
  const prevQp = window.localStorage.getItem("keytrace.zh-qp.showCode");
  window.localStorage.removeItem("keytrace.zh.showCode");
  window.localStorage.removeItem("keytrace.zh-qp.showCode");

  try {
    const qpTi = new TextInput("fangan", toTextInputSettings(new Settings()));
    const rQp = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{ ...textDisplaySettings, language: Language.ZH_QP }}
          lines={qpTi.lines}
          focus={true}
          showToggle={true}
          cursor={false}
        />
      </FakeIntlProvider>,
    );

    isTrue((rQp.container.textContent ?? "").includes("Show Pinyin"));
    equal(rQp.container.querySelectorAll("[data-code='1']").length, 2);

    const qpCheckbox = rQp.container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    );
    isNotNull(qpCheckbox);
    equal(qpCheckbox.checked, true);

    fireEvent.click(qpCheckbox);
    equal(qpCheckbox.checked, false);
    equal(window.localStorage.getItem("keytrace.zh-qp.showCode"), "0");
    equal(window.localStorage.getItem("keytrace.zh.showCode"), null);
    equal(rQp.container.querySelectorAll("[data-code='1']").length, 0);
    rQp.unmount();

    const spTi = new TextInput("dage", toTextInputSettings(new Settings()));
    const rSp = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
          lines={spTi.lines}
          focus={true}
          showToggle={true}
          cursor={false}
        />
      </FakeIntlProvider>,
    );

    isTrue((rSp.container.textContent ?? "").includes("Show Shuangpin code"));
    const spCheckbox = rSp.container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    );
    isNotNull(spCheckbox);
    equal(spCheckbox.checked, true);
    const spCode = rSp.container.querySelector<HTMLElement>("[data-code='1']");
    isNotNull(spCode);
    equal(spCode.style.position, "absolute");
    rSp.unmount();
  } finally {
    if (prevSp == null) {
      window.localStorage.removeItem("keytrace.zh.showCode");
    } else {
      window.localStorage.setItem("keytrace.zh.showCode", prevSp);
    }
    if (prevQp == null) {
      window.localStorage.removeItem("keytrace.zh-qp.showCode");
    } else {
      window.localStorage.setItem("keytrace.zh-qp.showCode", prevQp);
    }
  }
});

test("StaticText with ZH_QP settings renders Full Pinyin example text without toggle", () => {
  const exampleTi = new TextInput(
    "meitian jianchi tisheng shuru sudu.",
    toTextInputSettings(new Settings()),
  );
  const r = render(
    <FakeIntlProvider>
      <StaticText
        settings={{ ...textDisplaySettings, language: Language.ZH_QP }}
        lines={exampleTi.lines}
      />
    </FakeIntlProvider>,
  );

  equal(r.container.querySelectorAll("input[type='checkbox']").length, 0);
  const hanziText = [
    ...r.container.querySelectorAll<HTMLElement>("[data-hanzi='1']"),
  ]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(hanziText, "每天坚持提升输入速度。");
  r.unmount();
});

test("ZhLines in zh-qp mode preserves hanzi under stopOnError=false garbage and handles 1-key syllables + Line caret", () => {
  const ti = new TextInput("fangan a", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
  });
  // Type f (hit), a (hit), x (garbage) -> cursor stays at 'n' (index 2 of 4)
  ti.appendChar(100, "f".codePointAt(0)!, 100);
  ti.appendChar(200, "a".codePointAt(0)!, 100);
  ti.appendChar(300, "x".codePointAt(0)!, 100);

  const r = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{
          ...textDisplaySettings,
          language: Language.ZH_QP,
          caretShapeStyle: CaretShapeStyle.Line,
        }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );

  const units = [
    ...r.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(units.length, 3);
  // "方案" stays intact despite garbage 'x', and "a" is a 1-segment unit.
  equal(units[0].dataset.segments, "4");
  equal(units[0].querySelector("[data-hanzi='1']")?.textContent, "方");
  equal(units[1].dataset.segments, "2");
  equal(units[1].querySelector("[data-hanzi='1']")?.textContent, "案");
  equal(units[2].dataset.segments, "1");
  isTrue(
    /[\u4e00-\u9fff]/.test(
      units[2].querySelector("[data-hanzi='1']")?.textContent ?? "",
    ),
  );

  const cursorEl = r.container.querySelector<HTMLElement>("[data-caret-shape]");
  isNotNull(cursorEl);
  equal(cursorEl.dataset.caretShape, String(CaretShapeStyle.Line));
  equal(cursorEl.dataset.cursorSegments, "4");
  equal(cursorEl.dataset.cursorActiveIndex, "2");
  equal(cursorEl.style.width, "2px");

  r.unmount();
});

test("TextArea with zh and zh-qp keeps Show Pinyin checkbox synced with rendered codes without preventing toggle", () => {
  const prevQp = window.localStorage.getItem("keytrace.zh-qp.showCode");
  window.localStorage.removeItem("keytrace.zh-qp.showCode");

  try {
    const ti = new TextInput("fangan", toTextInputSettings(new Settings()));
    let blurCount = 0;
    const r = render(
      <FakeIntlProvider>
        <TextArea
          settings={{ ...textDisplaySettings, language: Language.ZH_QP }}
          zh={true}
          scheme="zh-qp"
          lines={ti.lines}
          onBlur={() => {
            blurCount++;
          }}
        />
      </FakeIntlProvider>,
    );

    const checkbox = r.container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    );
    const label = r.container.querySelector<HTMLLabelElement>("label");
    isNotNull(checkbox);
    isNotNull(label);
    equal(checkbox.checked, true);
    equal(r.container.querySelectorAll("[data-code='1']").length, 2);

    // Clicking the checkbox inside TextArea must NOT call preventDefault()
    // and must keep DOM checked state synced with rendered pinyin codes.
    const firstNotPrevented = fireEvent.click(checkbox);
    equal(firstNotPrevented, true);
    equal(checkbox.checked, false);
    equal(r.container.querySelectorAll("[data-code='1']").length, 0);

    const secondNotPrevented = fireEvent.click(checkbox);
    equal(secondNotPrevented, true);
    equal(checkbox.checked, true);
    equal(r.container.querySelectorAll("[data-code='1']").length, 2);

    // Clicking the label also toggles cleanly without blurring the typing input.
    fireEvent.click(label);
    equal(checkbox.checked, false);
    equal(r.container.querySelectorAll("[data-code='1']").length, 0);
    equal(blurCount, 0);

    r.unmount();
  } finally {
    if (prevQp == null) {
      window.localStorage.removeItem("keytrace.zh-qp.showCode");
    } else {
      window.localStorage.setItem("keytrace.zh-qp.showCode", prevQp);
    }
  }
});

test("ZhLines renders Microsoft Shuangpin (; = ing) words without splitting on semicolon", () => {
  const prevMs = window.localStorage.getItem("keytrace.zh-sp-ms.showCode");
  window.localStorage.removeItem("keytrace.zh-sp-ms.showCode");
  try {
    const ti = new TextInput(
      "jnx; mztm.",
      toTextInputSettings(new Settings()),
    );
    const r = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{
            ...textDisplaySettings,
            language: Language.ZH_SP,
            layout: Layout.ZH_SP_MS,
          }}
          lines={ti.lines}
          focus={true}
          showToggle={true}
          cursor={false}
        />
      </FakeIntlProvider>,
    );

    const root = r.container.querySelector<HTMLElement>("[data-scheme]");
    isNotNull(root);
    equal(root.dataset.scheme, "zh-sp-ms");

    const hanziText = [
      ...r.container.querySelectorAll<HTMLElement>("[data-hanzi='1']"),
    ]
      .map((el) => el.textContent ?? "")
      .join("");
    equal(hanziText, "进行每天。");

    const codes = [
      ...r.container.querySelectorAll<HTMLElement>("[data-code='1']"),
    ].map((el) => el.textContent ?? "");
    equal(codes[0], "jn");
    equal(codes[1], "x;");

    r.unmount();
  } finally {
    if (prevMs == null) {
      window.localStorage.removeItem("keytrace.zh-sp-ms.showCode");
    } else {
      window.localStorage.setItem("keytrace.zh-sp-ms.showCode", prevMs);
    }
  }
});

test("ZhLines in Shuangpin keeps Hanzi and word boundaries intact under stopOnError=false garbage (mid-word, space, punct, zh-sp-ms ;)", () => {
  // 1. Mid-word odd & even garbage, plus garbage ' ' and ',' inside word
  const ti = new TextInput("dage,ykgo uiwu", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhShuangpin: true,
  });

  // Type 'd' (hit), then garbage 'x', ' ', ',' at pos 1 ('a' - odd position!)
  ti.appendChar(100, "d".codePointAt(0)!, 100);
  ti.appendChar(200, "x".codePointAt(0)!, 100);
  ti.appendChar(300, " ".codePointAt(0)!, 100);
  ti.appendChar(400, ",".codePointAt(0)!, 100);

  const rMid = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );

  const hanziMid = [...rMid.container.querySelectorAll("[data-hanzi='1']")]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(hanziMid, "大哥，英国事务");
  // Garbage ' ' and ',' must NOT split words or inject extra spaces/punctuation!
  equal(rMid.container.querySelectorAll("[data-word='1']").length, 3);
  equal(rMid.container.querySelectorAll("[data-space='1']").length, 1);
  equal(
    rMid.container.querySelectorAll("[data-word='1'] [data-space='1']").length,
    1,
  );
  const firstUnit = rMid.container.querySelector<HTMLElement>("[data-unit='1']");
  isNotNull(firstUnit);
  equal(firstUnit.dataset.garbage, "3");
  equal(
    firstUnit.querySelector("[data-garbage-badge='1']")?.textContent,
    "3",
  );
  // [data-code='1'] remains canonical "da" without garbage chars mixed in.
  equal(firstUnit.querySelector("[data-code='1']")?.textContent, "da");
  rMid.unmount();

  // 2. Garbage at even position (pos 2 'g') and 1..10 -> Backspace decrement
  ti.clearChar();
  ti.clearChar();
  ti.clearChar();
  ti.appendChar(500, "a".codePointAt(0)!, 100);
  for (let i = 1; i <= 10; i++) {
    ti.appendChar(500 + i * 10, "z".codePointAt(0)!, 100);
  }
  const rTen = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  const unitsTen = [
    ...rTen.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(unitsTen[1].dataset.garbage, "10");
  equal(unitsTen[1].querySelector("[data-garbage-badge='1']")?.textContent, "10");
  equal(
    [...rTen.container.querySelectorAll("[data-hanzi='1']")]
      .map((el) => el.textContent ?? "")
      .join(""),
    "大哥，英国事务",
  );
  rTen.unmount();

  // Backspace once -> 9
  ti.clearChar();
  const rNine = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  const unitsNine = [
    ...rNine.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(unitsNine[1].dataset.garbage, "9");
  equal(unitsNine[1].querySelector("[data-garbage-badge='1']")?.textContent, "9");
  rNine.unmount();

  // 3. Microsoft Shuangpin (; = ing) with garbage before ';'
  const ms = new TextInput("jnx;,mztm.", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhShuangpin: true,
    zhScheme: "zh-sp-ms",
  });
  for (const ch of "jnx") {
    ms.appendChar(100, ch.codePointAt(0)!, 100);
  }
  ms.appendChar(200, "q".codePointAt(0)!, 100);
  const rMs = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{
          ...textDisplaySettings,
          language: Language.ZH_SP,
          layout: Layout.ZH_SP_MS,
        }}
        lines={ms.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  const msHanzi = [...rMs.container.querySelectorAll("[data-hanzi='1']")]
    .map((el) => el.textContent ?? "")
    .join("");
  equal(msHanzi, "进行，每天。");
  const msUnits = [
    ...rMs.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  equal(msUnits[1].dataset.garbage, "1");
  equal(msUnits[1].querySelector("[data-code='1']")?.textContent, "x;");
  rMs.unmount();
});

test("ZhLines attributes trailing garbage to SpaceToken and punctuation in Shuangpin & Quanpin across WhitespaceStyle and CaretShapeStyle", () => {
  // Shuangpin: type "dage", then at ',' type 2 garbage keys.
  const spPunct = new TextInput("dage,ykgo uiwu", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhShuangpin: true,
  });
  for (const ch of "dage") {
    spPunct.appendChar(100, ch.codePointAt(0)!, 100);
  }
  spPunct.appendChar(200, "x".codePointAt(0)!, 100);
  spPunct.appendChar(300, "y".codePointAt(0)!, 100);

  const rPunct = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={spPunct.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  const punctUnits = [
    ...rPunct.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
  ];
  // Preceding "哥" (index 1) has NO garbage; comma (index 2) has garbageCount = 2!
  equal(punctUnits[1].dataset.garbage, undefined);
  isNull(punctUnits[1].querySelector("[data-garbage-badge='1']"));
  equal(punctUnits[2].dataset.garbage, "2");
  equal(punctUnits[2].querySelector("[data-garbage-badge='1']")?.textContent, "2");
  equal(punctUnits[2].querySelector("[data-hanzi='1']")?.textContent, "，");
  const punctHanziEl =
    punctUnits[2].querySelector<HTMLElement>("[data-hanzi='1']");
  isNotNull(punctHanziEl);
  isTrue(
    punctHanziEl.style.color === "#d4503a" ||
      punctHanziEl.style.color === "rgb(212, 80, 58)",
  );
  rPunct.unmount();

  // Quanpin: type "fangan", then at ' ' type 3 garbage keys -> test WhitespaceStyle.Space & Bullet + all 4 CaretShapeStyles.
  const qpSpace = new TextInput("fangan meitian", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhQuanpin: true,
  });
  for (const ch of "fangan") {
    qpSpace.appendChar(100, ch.codePointAt(0)!, 100);
  }
  qpSpace.appendChar(200, "x".codePointAt(0)!, 100);
  qpSpace.appendChar(300, "y".codePointAt(0)!, 100);
  qpSpace.appendChar(400, "z".codePointAt(0)!, 100);

  for (const whitespaceStyle of [
    WhitespaceStyle.Space,
    WhitespaceStyle.Bullet,
  ]) {
    const rWs = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{
            ...textDisplaySettings,
            language: Language.ZH_QP,
            whitespaceStyle,
            caretShapeStyle: CaretShapeStyle.Underline,
          }}
          lines={qpSpace.lines}
          focus={true}
          showToggle={false}
        />
      </FakeIntlProvider>,
    );
    const units = [
      ...rWs.container.querySelectorAll<HTMLElement>("[data-unit='1']"),
    ];
    // "方" and "案" stay clean!
    equal(units[0].dataset.garbage, undefined);
    equal(units[1].dataset.garbage, undefined);
    const spaceEl = rWs.container.querySelector<HTMLElement>("[data-space='1']");
    isNotNull(spaceEl);
    equal(spaceEl.dataset.garbage, "3");
    equal(spaceEl.querySelector("[data-garbage-badge='1']")?.textContent, "3");
    isTrue(
      spaceEl.style.color === "#d4503a" ||
        spaceEl.style.color === "rgb(212, 80, 58)",
    );
    const cursorEl =
      rWs.container.querySelector<HTMLElement>("[data-caret-shape]");
    isNotNull(cursorEl);
    equal(cursorEl.dataset.cursorError, "1");
    const seg = cursorEl.querySelector<HTMLElement>("[data-cursor-segment='0']");
    isNotNull(seg);
    isTrue(
      seg.style.background === "#d4503a" ||
        seg.style.background === "rgb(212, 80, 58)",
    );
    rWs.unmount();
  }

  // Verify Box, Line, and Block cursor error tinting when garbage is active.
  for (const caretShapeStyle of [
    CaretShapeStyle.Box,
    CaretShapeStyle.Line,
    CaretShapeStyle.Block,
  ]) {
    const rCaret = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{
            ...textDisplaySettings,
            language: Language.ZH_QP,
            caretShapeStyle,
          }}
          lines={qpSpace.lines}
          focus={true}
          showToggle={false}
        />
      </FakeIntlProvider>,
    );
    const cursorEl =
      rCaret.container.querySelector<HTMLElement>("[data-caret-shape]");
    isNotNull(cursorEl);
    equal(cursorEl.dataset.cursorError, "1");
    if (caretShapeStyle === CaretShapeStyle.Box) {
      isTrue(
        cursorEl.style.border.includes("#d4503a") ||
          cursorEl.style.border.includes("rgb(212, 80, 58)"),
      );
    } else if (caretShapeStyle === CaretShapeStyle.Line) {
      isTrue(
        cursorEl.style.backgroundColor === "#d4503a" ||
          cursorEl.style.backgroundColor === "rgb(212, 80, 58)",
      );
    } else if (caretShapeStyle === CaretShapeStyle.Block) {
      const seg = cursorEl.querySelector<HTMLElement>(
        "[data-cursor-active='1']",
      );
      isNotNull(seg);
      isTrue(
        seg.style.background === "#d4503a" ||
          seg.style.background === "rgb(212, 80, 58)",
      );
      equal(seg.style.opacity, "0.34");
    }
    rCaret.unmount();
  }
});

test("ZhLines renders EOF pure garbage without hallucinating Hanzi and integrates stopOnError=false + forgiveErrors + spaceSkipsWords", () => {
  // 1. Pure garbage EOF line (must render raw 'a' in COLOR.miss, NOT hallucinate "啊")
  const pureGarbageLines: LineList = {
    text: "a",
    lines: [
      {
        text: "a",
        chars: [{ codePoint: "a".codePointAt(0)!, attrs: Attr.Garbage }],
      },
    ],
  };
  for (const language of [Language.ZH_SP, Language.ZH_QP]) {
    const rPure = render(
      <FakeIntlProvider>
        <ZhLines
          settings={{ ...textDisplaySettings, language }}
          lines={pureGarbageLines}
          focus={true}
          showToggle={false}
        />
      </FakeIntlProvider>,
    );
    const hanziEl =
      rPure.container.querySelector<HTMLElement>("[data-hanzi='1']");
    isNotNull(hanziEl);
    equal(hanziEl.textContent, "a");
    isTrue(
      hanziEl.style.color === "#d4503a" ||
        hanziEl.style.color === "rgb(212, 80, 58)",
    );
    rPure.unmount();
  }

  // 2. Combined TextInput (stopOnError=false, forgiveErrors=true, spaceSkipsWords=true) -> ZhLines
  const ti = new TextInput("dage,ykgo uiwu", {
    stopOnError: false,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhShuangpin: true,
  });
  // Type 'd' hit, 'x' garbage (shows badge=1), then Space skips only "dage," to 'y'.
  ti.appendChar(100, "d".codePointAt(0)!, 100);
  ti.appendChar(200, "x".codePointAt(0)!, 100);
  const rBeforeSkip = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  equal(
    rBeforeSkip.container.querySelector("[data-garbage-badge='1']")?.textContent,
    "1",
  );
  rBeforeSkip.unmount();

  ti.appendChar(300, " ".codePointAt(0)!, 100);
  const rAfterSkip = render(
    <FakeIntlProvider>
      <ZhLines
        settings={{ ...textDisplaySettings, language: Language.ZH_SP }}
        lines={ti.lines}
        focus={true}
        showToggle={false}
      />
    </FakeIntlProvider>,
  );
  // Garbage badge is gone, cursor is now on '英' of "英国", and "大哥，英国事务" stays intact.
  isNull(rAfterSkip.container.querySelector("[data-garbage-badge='1']"));
  equal(
    [...rAfterSkip.container.querySelectorAll("[data-hanzi='1']")]
      .map((el) => el.textContent ?? "")
      .join(""),
    "大哥，英国事务",
  );
  const cursorUnit =
    rAfterSkip.container.querySelector<HTMLElement>("[data-cursor='1']");
  isNotNull(cursorUnit);
  equal(cursorUnit.querySelector("[data-hanzi='1']")?.textContent, "英");
  rAfterSkip.unmount();
});
