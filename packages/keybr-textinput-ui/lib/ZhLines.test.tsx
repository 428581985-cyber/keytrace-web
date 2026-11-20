import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { Settings } from "@keybr/settings";
import { TextInput, toTextInputSettings } from "@keybr/textinput";
import { render } from "@testing-library/react";
import { equal, isNull } from "rich-assert";
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

test("StaticText with zh=true renders Chinese characters without toggle", () => {
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
});
