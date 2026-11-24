import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { LessonKey } from "@keybr/lesson";
import { FakePhoneticModel, type Letter } from "@keybr/phonetic-model";
import {
  type KeyStatsMap,
  makeKeyStatsMap,
  ResultFaker,
  speedToTime,
} from "@keybr/result";
import { FakeSettingsContext } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { fireEvent, render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { equal, isNotNull, isTrue } from "rich-assert";
import { Key } from "./Key.tsx";
import { KeySelector } from "./KeySelector.tsx";

const { letters } = FakePhoneticModel;
const keyStatsMap = makeKeyStatsMap(letters, []);

test("props", () => {
  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <KeySelector
          keyStatsMap={keyStatsMap}
          current={letters[0]}
          title="underTest"
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  const element = r.getByTitle("underTest");

  equal(element.textContent, "ABCDEFGHIJ");

  r.rerender(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <KeySelector
          keyStatsMap={keyStatsMap}
          current={letters[1]}
          title="underTest"
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  equal(element.textContent, "ABCDEFGHIJ");

  r.unmount();
});

test("controlled", async () => {
  let current: Letter | undefined;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <Controlled
          keyStatsMap={keyStatsMap}
          onChange={(letter) => {
            current = letter;
          }}
        />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
  const element = r.getByTitle("underTest");

  await userEvent.click(r.getByText("A"));
  await userEvent.click(r.getByText("B"));

  equal(current?.label, "B");

  await userEvent.click(r.getByText("B"));
  await userEvent.click(r.getByText("A"));

  equal(current?.label, "A");

  fireEvent.keyDown(element, { code: "ArrowLeft" });

  equal(current?.label, "J");

  fireEvent.keyDown(element, { code: "ArrowUp" });

  equal(current?.label, "I");

  fireEvent.keyDown(element, { code: "ArrowRight" });

  equal(current?.label, "J");

  fireEvent.keyDown(element, { code: "ArrowDown" });

  equal(current?.label, "A");

  r.unmount();
});

function Controlled({
  keyStatsMap,
  onChange,
}: {
  keyStatsMap: KeyStatsMap;
  onChange: (value: Letter) => void;
}) {
  const [value, setValue] = useState(keyStatsMap.letters[0]);
  return (
    <KeySelector
      keyStatsMap={keyStatsMap}
      current={value}
      onSelect={(value) => {
        setValue(value);
        onChange(value);
      }}
      title="underTest"
    />
  );
}

test("calibrates tile confidence using accuracy and sample sufficiency", () => {
  const faker = new ResultFaker({ letters });
  const fastTime = speedToTime(300); // 60 WPM
  const rErrorProne = faker.nextResult({
    length: 50,
    time: 10000,
    errors: 10,
    histogram: new Histogram([
      // letters[0]: fast but 20% error rate -> calibrated confidence < 0.6
      {
        codePoint: letters[0].codePoint,
        hitCount: 50,
        missCount: 10,
        timeToType: fastTime,
      },
      // letters[1]: fast but only 2 hits -> damped < 0.6
      {
        codePoint: letters[1].codePoint,
        hitCount: 2,
        missCount: 0,
        timeToType: fastTime,
      },
      // letters[2]: fast, 20 hits, 0 misses -> calibrated confidence == 1.0
      {
        codePoint: letters[2].codePoint,
        hitCount: 20,
        missCount: 0,
        timeToType: fastTime,
      },
    ]),
  });
  const calibratedMap = makeKeyStatsMap(letters, [rErrorProne]);
  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <KeySelector keyStatsMap={calibratedMap} current={letters[0]} />
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  const key0 = Key.attached(
    r.container.querySelector(`[data-code-point="${letters[0].codePoint}"]`),
  );
  const key1 = Key.attached(
    r.container.querySelector(`[data-code-point="${letters[1].codePoint}"]`),
  );
  const key2 = Key.attached(
    r.container.querySelector(`[data-code-point="${letters[2].codePoint}"]`),
  );
  isNotNull(key0);
  isNotNull(key1);
  isNotNull(key2);
  isTrue(key0 instanceof LessonKey);
  isTrue((key0!.confidence ?? 1) < 0.6);
  isTrue((key1!.confidence ?? 1) < 0.6);
  equal(key2!.confidence, 1);

  r.unmount();
});
