import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  KeyboardOptions,
  keyboardProps,
  Layout,
  useKeyboard,
} from "@keybr/keyboard";
import { lessonProps } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import {
  FakeResultContext,
  type KeyStatsMap,
  ResultFaker,
  speedToTime,
  useResults,
} from "@keybr/result";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { Histogram } from "@keybr/textinput";
import { fireEvent, render } from "@testing-library/react";
import { equal, isTrue } from "rich-assert";
import { MasterySection } from "./MasterySection.tsx";
import { ResultGrouper } from "./ResultGrouper.tsx";

const faker = new ResultFaker();

test("empty database", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings().set(
          keyboardProps.layout,
          Layout.EN_DVORAK,
        )}
      >
        <FakeResultContext>
          <ResultGrouper>
            {(keyStatsMap) => <TestChild keyStatsMap={keyStatsMap} />}
          </ResultGrouper>
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  equal((await r.findByTitle("layout")).textContent, "en-dvorak");

  r.unmount();
});

test("select default layout", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings().set(
          keyboardProps.layout,
          Layout.EN_DVORAK,
        )}
      >
        <FakeResultContext
          initialResults={[faker.nextResult({ layout: Layout.EN_COLEMAK })]}
        >
          <ResultGrouper>
            {(keyStatsMap) => <TestChild keyStatsMap={keyStatsMap} />}
          </ResultGrouper>
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  equal((await r.findByTitle("layout")).textContent, "en-colemak");

  fireEvent.click(await r.findByTitle("clear"));

  equal((await r.findByTitle("layout")).textContent, "en-dvorak");

  r.unmount();
});

test("select text type", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings().set(keyboardProps.layout, Layout.EN_US)}
      >
        <FakeResultContext
          initialResults={[faker.nextResult({ layout: Layout.EN_US })]}
        >
          <ResultGrouper>
            {(keyStatsMap) => <TestChild keyStatsMap={keyStatsMap} />}
          </ResultGrouper>
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  fireEvent.click(await r.findByText("Letters"));

  equal((await r.findByTitle("alphabet")).textContent, "ABCDEFGHIJ");

  fireEvent.click(await r.findByText("Digits"));

  equal((await r.findByTitle("alphabet")).textContent, "0123456789");

  r.unmount();
});

test("ResultGrouper and MasterySection include semicolon key with ing label for Microsoft Shuangpin", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings()
          .set(keyboardProps.layout, Layout.ZH_SP_MS)
          .set(keyboardProps.zhScheme, Layout.ZH_SP_MS)}
      >
        <FakeResultContext
          initialResults={[faker.nextResult({ layout: Layout.ZH_SP_MS })]}
        >
          <ResultGrouper>
            {(keyStatsMap) => (
              <>
                <TestChild keyStatsMap={keyStatsMap} />
                <MasterySection keyStatsMap={keyStatsMap} />
              </>
            )}
          </ResultGrouper>
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  const alphabet = (await r.findByTitle("alphabet")).textContent ?? "";
  isTrue(alphabet.includes(";"));
  const text = r.container.textContent ?? "";
  isTrue(text.includes(";ing"));

  r.unmount();
});

test("ResultGrouper evaluates MasterySection against viewed layout EN vs ZH target speed", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const letters = FakePhoneticModel.letters;
  const localFaker = new ResultFaker({ letters });
  const hist150 = new Histogram([
    {
      codePoint: 0x0061, // 'a' at 150 CPM (30 WPM)
      hitCount: 20,
      missCount: 0,
      timeToType: speedToTime(150),
    },
  ]);

  const zhResult = localFaker.nextResult({
    layout: Layout.ZH_SP,
    histogram: hist150,
  });
  const enResult = localFaker.nextResult({
    layout: Layout.EN_US,
    histogram: hist150,
  });

  // Active practice language is ZH_SP, with ZH target=100 CPM (20 WPM) and EN target=250 CPM (50 WPM).
  const settings = KeyboardOptions.default()
    .withLanguage(Layout.ZH_SP.language)
    .withLayout(Layout.ZH_SP)
    .save(new Settings())
    .set(lessonProps.zhTargetSpeed, 100)
    .set(lessonProps.targetSpeed, 250);

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext initialSettings={settings}>
        <FakeResultContext initialResults={[zhResult, enResult]}>
          <ResultGrouper>
            {(keyStatsMap) => (
              <>
                <TestChild keyStatsMap={keyStatsMap} />
                <MasterySection keyStatsMap={keyStatsMap} />
              </>
            )}
          </ResultGrouper>
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  const colorOfKeyA = () => {
    const tile = r.container.querySelector('[title^="A · "]');
    const fill = tile?.lastElementChild
      ?.firstElementChild as HTMLElement | null;
    return fill?.style.background ?? null;
  };

  try {
    // Initially viewing ZH_SP: 150 CPM >= 100 CPM zhTargetSpeed -> done green (#7fae8f).
    equal((await r.findByTitle("layout")).textContent, "zh-sp");
    equal(colorOfKeyA(), "rgb(127, 174, 143)");

    // Switch ResultGrouper OptionList to EN_US (without changing practice language in settings):
    // 150 CPM vs 250 CPM targetSpeed = 0.60 -> mid amber (#c98a3a).
    fireEvent.click(r.getByText("Chinese / Xiaohe Shuangpin"));
    fireEvent.click(await r.findByText(/英语|English/));
    equal((await r.findByTitle("layout")).textContent, "en-us");
    equal(colorOfKeyA(), "rgb(201, 138, 58)");
  } finally {
    r.unmount();
  }
});

function TestChild({ keyStatsMap }: { keyStatsMap: KeyStatsMap }) {
  const { layout } = useKeyboard();
  const { clearResults } = useResults();
  return (
    <div>
      <div title="layout">{layout.id}</div>
      <div title="alphabet">{keyStatsMap.letters.map(String).join("")}</div>
      <button
        title="clear"
        onClick={() => {
          clearResults();
        }}
      >
        clear
      </button>
    </div>
  );
}
