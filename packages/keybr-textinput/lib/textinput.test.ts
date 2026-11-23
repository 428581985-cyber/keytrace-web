import { test } from "node:test";
import { toCodePoints } from "@keybr/unicode";
import { deepEqual, equal, isFalse, isTrue, throws } from "rich-assert";
import { Attr } from "./chars.ts";
import { Histogram } from "./histogram.ts";
import { makeStats } from "./stats.ts";
import { Feedback, TextInput } from "./textinput.ts";

const A = /* "a" */ 0x0061;
const B = /* "b" */ 0x0062;
const C = /* "c" */ 0x0063;
const D = /* "d" */ 0x0064;
const X = /* "x" */ 0x0078;
const Space = /* SPACE */ 0x0020;

test("allow empty text", () => {
  const textInput = new TextInput("", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.length, 0);
  equal(textInput.pos, 0);
  isTrue(textInput.completed);
  throws(() => {
    textInput.appendChar(100, A, 100);
  });
  throws(() => {
    textInput.appendChar(100, Space, 100);
  });
  deepEqual(makeStats(textInput.steps), {
    time: 0,
    speed: 0,
    length: 0,
    errors: 0,
    accuracy: 0.0,
    histogram: new Histogram([]),
  });
});

test("advance to completion", () => {
  const textInput = new TextInput("abcd", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(100, A, 101), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101");
  equal(showChars(textInput), "a|[b]|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, B, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101|b,200,102");
  equal(showChars(textInput), "a|b|[c]|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 2);
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, C, 103), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101|b,200,102|c,300,103");
  equal(showChars(textInput), "a|b|c|[d]");
  equal(textInput.length, 4);
  equal(textInput.pos, 3);
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, D, 104), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101|b,200,102|c,300,103|d,400,104");
  equal(showChars(textInput), "a|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 4);
  isTrue(textInput.completed);

  deepEqual(makeStats(textInput.steps), {
    time: 300,
    speed: 800,
    length: 4,
    errors: 0,
    accuracy: 1.0,
    histogram: new Histogram([
      { codePoint: B, hitCount: 1, missCount: 0, timeToType: 102 },
      { codePoint: C, hitCount: 1, missCount: 0, timeToType: 103 },
      { codePoint: D, hitCount: 1, missCount: 0, timeToType: 104 },
    ]),
  });
});

test("accumulate and delete garbage", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: true,
  });

  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(100, X, 100), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, A, 100), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|*a|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(500, A, 91), Feedback.Recovered);
  equal(showSteps(textInput), "!a,500,91");
  equal(showChars(textInput), "!a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);
});

test("limit garbage length", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: true,
  });

  for (let i = 1; i <= 100; i++) {
    equal(textInput.appendChar(i * 100, X, 100), Feedback.Failed);
  }

  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|*x|*x|*x|*x|*x|*x|*x|*x|*x|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);
});

test("handle backspace at the start of a word", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 100), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, A, 101), Feedback.Recovered);
  equal(showSteps(textInput), "!a,400,101");
  equal(showChars(textInput), "!a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);
});

test("handle backspace in the middle of a word", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, A, 101), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101");
  equal(showChars(textInput), "a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, X, 100), Feedback.Failed);
  equal(showSteps(textInput), "a,100,101");
  equal(showChars(textInput), "a|*x|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101");
  equal(showChars(textInput), "a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "a,100,101");
  equal(showChars(textInput), "a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(500, B, 102), Feedback.Recovered);
  equal(showSteps(textInput), "a,100,101|!b,500,102");
  equal(showChars(textInput), "a|!b|[c]");
  equal(textInput.length, 3);
  equal(textInput.pos, 2);
  isFalse(textInput.completed);
});

test("forgive an inserted character", () => {
  const textInput = new TextInput("abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(100, X, 100), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, A, 101), Feedback.Recovered);
  equal(showSteps(textInput), "!a,200,101");
  equal(showChars(textInput), "!a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, B, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "!a,200,101|b,300,102");
  equal(showChars(textInput), "!a|b|[c]");
  equal(textInput.length, 3);
  equal(textInput.pos, 2);
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, C, 103), Feedback.Succeeded);
  equal(showSteps(textInput), "!a,200,101|b,300,102|c,400,103");
  equal(showChars(textInput), "!a|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 3);
  isTrue(textInput.completed);
});

test("forgive a skipped character", () => {
  const textInput = new TextInput("abcd", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, B, 101), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, C, 102), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, D, 103), Feedback.Recovered);
  equal(showSteps(textInput), "!a,100,0|b,100,101|c,200,102|d,300,103");
  equal(showChars(textInput), "!a|b|c|d");
  isTrue(textInput.completed);
});

test("forgive a replaced character", () => {
  const textInput = new TextInput("abcd", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, B, 102), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, C, 103), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, D, 104), Feedback.Recovered);
  equal(showSteps(textInput), "!a,100,0|b,200,102|c,300,103|d,400,104");
  equal(showChars(textInput), "!a|b|c|d");
  equal(textInput.length, 4);
  equal(textInput.pos, 4);
  isTrue(textInput.completed);
});

test("ignore the whitespace key", () => {
  const textInput = new TextInput("abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
  });

  equal(textInput.appendChar(100, Space, 100), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, A, 101), Feedback.Succeeded);
  equal(showSteps(textInput), "a,200,101");
  equal(showChars(textInput), "a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, Space, 100), Feedback.Succeeded);
  equal(showSteps(textInput), "a,200,101");
  equal(showChars(textInput), "a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, B, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "a,200,101|b,400,102");
  equal(showChars(textInput), "a|b|[c]");
  equal(textInput.length, 3);
  equal(textInput.pos, 2);
  isFalse(textInput.completed);
});

test("space in garbage", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
  });

  equal(textInput.appendChar(100, X, 100), Feedback.Failed);
  equal(textInput.appendChar(200, Space, 100), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|* |[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(500, A, 101), Feedback.Recovered);
  equal(showSteps(textInput), "!a,500,101");
  equal(showChars(textInput), "!a|[b]|c");
  equal(textInput.length, 3);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);
});

test("space skips words at the beginning of a text, ignore space", () => {
  const textInput = new TextInput("abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, Space, 100), Feedback.Succeeded);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[a]|b|c");
  isFalse(textInput.completed);
});

test("space skips words at the beginning of a word, ignore space", () => {
  const textInput = new TextInput("x abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Succeeded);
  equal(textInput.appendChar(200, Space, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "x,100,101| ,200,102");
  equal(showChars(textInput), "x| |[a]|b|c");
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, Space, 103), Feedback.Succeeded);
  equal(showSteps(textInput), "x,100,101| ,200,102");
  equal(showChars(textInput), "x| |[a]|b|c");
  isFalse(textInput.completed);
});

test("space skips words at the beginning of a text, skip after error", () => {
  const textInput = new TextInput("abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Failed);
  equal(textInput.appendChar(200, Space, 102), Feedback.Recovered);
  equal(showSteps(textInput), "!a,200,0|!b,200,0|!c,200,0");
  equal(showChars(textInput), "!a|!b|!c");
  isTrue(textInput.completed);
});

test("space skips words at the beginning of a word, skip after error", () => {
  const textInput = new TextInput("x abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Succeeded);
  equal(textInput.appendChar(200, Space, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "x,100,101| ,200,102");
  equal(showChars(textInput), "x| |[a]|b|c");
  isFalse(textInput.completed);

  equal(textInput.appendChar(300, X, 103), Feedback.Failed);
  equal(textInput.appendChar(400, Space, 104), Feedback.Recovered);
  equal(showSteps(textInput), "x,100,101| ,200,102|!a,400,0|!b,400,0|!c,400,0");
  equal(showChars(textInput), "x| |!a|!b|!c");
  isTrue(textInput.completed);
});

test("space skips words in the middle of a word, skip word", () => {
  const textInput = new TextInput("x abc", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Succeeded);
  equal(textInput.appendChar(200, Space, 102), Feedback.Succeeded);
  equal(textInput.appendChar(300, A, 103), Feedback.Succeeded);
  equal(showSteps(textInput), "x,100,101| ,200,102|a,300,103");
  equal(showChars(textInput), "x| |a|[b]|c");
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, Space, 104), Feedback.Recovered);
  equal(
    showSteps(textInput),
    "x,100,101| ,200,102|a,300,103|!b,400,0|!c,400,0",
  );
  equal(showChars(textInput), "x| |a|!b|!c");
  isTrue(textInput.completed);
});

test("space skips words at the beginning of a text, remove garbage", () => {
  const textInput = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Failed);
  equal(showSteps(textInput), "");
  equal(showChars(textInput), "*x|[a]|b|c");
  equal(textInput.appendChar(200, Space, 102), Feedback.Recovered);
  equal(showSteps(textInput), "!a,200,0|!b,200,0|!c,200,0");
  equal(showChars(textInput), "!a|!b|!c");
  isTrue(textInput.completed);
});

test("space skips words in the middle of a word, remove garbage", () => {
  const textInput = new TextInput("x abc", {
    stopOnError: false,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(textInput.appendChar(100, X, 101), Feedback.Succeeded);
  equal(textInput.appendChar(200, Space, 102), Feedback.Succeeded);
  equal(textInput.appendChar(300, A, 103), Feedback.Succeeded);
  equal(textInput.appendChar(300, X, 104), Feedback.Failed);
  equal(showSteps(textInput), "x,100,101| ,200,102|a,300,103");
  equal(showChars(textInput), "x| |a|*x|[b]|c");
  isFalse(textInput.completed);

  equal(textInput.appendChar(400, Space, 105), Feedback.Recovered);
  equal(
    showSteps(textInput),
    "x,100,101| ,200,102|a,300,103|!b,400,0|!c,400,0",
  );
  equal(showChars(textInput), "x| |a|!b|!c");
  isTrue(textInput.completed);
});

test("normalize characters", () => {
  const check = (text: string, input: string) => {
    const textInput = new TextInput(text, {
      stopOnError: true,
      forgiveErrors: false,
      spaceSkipsWords: false,
    });
    equal(textInput.text, text);
    let timeStamp = 0;
    for (const codePoint of toCodePoints(input)) {
      equal(
        textInput.appendChar((timeStamp += 100), codePoint, 100),
        Feedback.Succeeded,
      );
    }
  };

  check(`‘’`, `''`);
  check(`‘’`, `‘’`);
  check(`“”`, `""`);
  check(`“”`, `“”`);
  check(`«»`, `""`);
  check(`«»`, `«»`);
  check(`¿?¡!`, `??!!`);
  check(`¿?¡!`, `¿?¡!`);
});

test("whitespace", () => {
  const textInput = new TextInput("a  ", {
    stopOnError: true,
    forgiveErrors: false,
    spaceSkipsWords: false,
  });

  equal(textInput.appendChar(100, A, 100), Feedback.Succeeded);
  equal(textInput.appendChar(200, Space, 100), Feedback.Succeeded);
  equal(textInput.appendChar(300, Space, 100), Feedback.Succeeded);
  equal(textInput.length, 3);
  equal(textInput.pos, 3);
  isTrue(textInput.completed);
});

test("emoji", () => {
  const textInput = new TextInput("🍬🍭", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });

  equal(showSteps(textInput), "");
  equal(showChars(textInput), "[🍬]|🍭");
  equal(textInput.length, 2);
  equal(textInput.pos, 0);
  isFalse(textInput.completed);

  equal(textInput.appendChar(100, 0x1f36c, 101), Feedback.Succeeded);
  equal(showSteps(textInput), "🍬,100,101");
  equal(showChars(textInput), "🍬|[🍭]");
  equal(textInput.length, 2);
  equal(textInput.pos, 1);
  isFalse(textInput.completed);

  equal(textInput.appendChar(200, 0x1f36d, 102), Feedback.Succeeded);
  equal(showSteps(textInput), "🍬,100,101|🍭,200,102");
  equal(showChars(textInput), "🍬|🍭");
  equal(textInput.length, 2);
  equal(textInput.pos, 2);
  isTrue(textInput.completed);
});

test("zh shuangpin fuzzy pinyin end-to-end", () => {
  const fuzzy = {
    enEng: true,
    anAng: true,
    inIng: true,
    ianIang: true,
    zhZ: true,
    chC: true,
    shS: true,
    lN: true,
  };

  // Expected text: "ve nj en hk" (这 难 恩 坏)
  // User types fuzzy alternatives: "ze lhrf"? Let's test "ze lh eg hk":
  // - 'v' typed as 'z' (zhZ) -> accepted, step records 'v'
  // - 'n' typed as 'l' (lN), 'j' typed as 'h' (anAng) -> accepted, steps record 'n', 'j'
  // - 'n' after 'e' typed as 'g' (zero-initial enEng) -> accepted, step records 'n'
  // - 'k' after 'h' (huai) must NOT accept 'b' (no false positive on uai)
  const textInput = new TextInput("ve nj en hk", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhShuangpin: true,
    fuzzy,
  });

  const keys = ["z", "e", " ", "l", "h", " ", "e", "g", " ", "h"];
  let ts = 0;
  for (const ch of keys) {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }

  // 'hk' (huai) must reject 'b' even with inIng enabled.
  equal(
    textInput.appendChar((ts += 100), "b".codePointAt(0)!, 100),
    Feedback.Failed,
  );
  // Recover with 'k'.
  equal(
    textInput.appendChar((ts += 100), "k".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  isTrue(textInput.completed);
  equal(
    showSteps(textInput),
    "v,100,100|e,200,100| ,300,100|n,400,100|j,500,100| ,600,100|e,700,100|n,800,100| ,900,100|h,1000,100|!k,1200,100",
  );
  equal(makeStats(textInput.steps).errors, 1);

  // Disabled zhShuangpin ignores fuzzy settings.
  const enInput = new TextInput("ve", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhShuangpin: false,
    fuzzy,
  });
  equal(enInput.appendChar(100, "z".codePointAt(0)!, 100), Feedback.Failed);

  // Disabled fuzzy toggle rejects fuzzy alternative even in zhShuangpin mode.
  const strictZhInput = new TextInput("ve", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhShuangpin: true,
    fuzzy: { ...fuzzy, zhZ: false },
  });
  equal(
    strictZhInput.appendChar(100, "z".codePointAt(0)!, 100),
    Feedback.Failed,
  );
});

test("zh quanpin fuzzy: skipped key does not forge 0ms step & stats stay valid", () => {
  const fuzzy = {
    enEng: false,
    anAng: true,
    inIng: false,
    ianIang: false,
    uanUang: false,
    zhZ: true,
    chC: false,
    shS: false,
    lN: false,
    fH: false,
    rL: false,
    veUe: false,
  };

  // Target: "zhongguo fangan" (中国 方案)
  // Type:   "zongguo fanan" (skip 'h' in zhong, skip 'g' in fang)
  const textInput = new TextInput("zhongguo fangan", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });

  const typed = "zongguo fanan";
  let ts = 0;
  for (const ch of typed) {
    equal(
      textInput.appendChar((ts += 150), ch.codePointAt(0)!, 150),
      Feedback.Succeeded,
    );
  }

  isTrue(textInput.completed);
  // Canonical length is 15, committed chars align 1:1 with canonical text.
  equal(textInput.pos, 15);
  equal(textInput.chars.length, 15);
  equal(
    showChars(textInput),
    "z|h|o|n|g|g|u|o| |f|a|n|g|a|n",
  );
  // Real physical keystrokes recorded: 13 steps (no forged 0ms steps for 'h' or skipped 'g').
  equal(textInput.steps.length, 13);
  equal(
    showSteps(textInput),
    "z,150,150|o,300,150|n,450,150|g,600,150|g,750,150|u,900,150|o,1050,150| ,1200,150|f,1350,150|a,1500,150|n,1650,150|a,1800,150|n,1950,150",
  );
  const stats = makeStats(textInput.steps);
  equal(stats.errors, 0);
  equal(stats.length, 13);
  isTrue(stats.histogram.validate());
  // Skipped 'h' never entered histogram.
  equal(stats.histogram.get("h".codePointAt(0)!), null);
  // 'o' and 'a' keep real 150ms timeToType.
  equal(stats.histogram.get("o".codePointAt(0)!)?.timeToType, 150);
  equal(stats.histogram.get("a".codePointAt(0)!)?.timeToType, 150);
});

test("zh quanpin fuzzy: extra permissive keys, cross-syllable boundaries, and space boundary", () => {
  const fuzzy = {
    enEng: true,
    anAng: true,
    inIng: true,
    ianIang: true,
    uanUang: true,
    zhZ: true,
    chC: true,
    shS: true,
    lN: true,
    fH: true,
    rL: true,
    veUe: true,
  };

  // Target: "ziji canguan fanggang fang zhanlve"
  // Typed:  "zhiji cangguan fangang fan zhanlue"
  // - ziji -> zhiji: consumeExtra 'h' (attributed to real pressed 'h')
  // - canguan -> cangguan: (-n)+g- boundary extraG
  // - fanggang -> fangang: (-ng)+g- boundary skipG
  // - "fang " -> "fan ": omit trailing 'g' directly before space!
  // - zhanlve -> zhanlue: same-length veUe substitute (step records 'v')
  const textInput = new TextInput("ziji canguan fanggang fang zhanlve", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhQuanpin: true,
    fuzzy,
  });

  const typed = "zhiji cangguan fangang fan zhanlue";
  let ts = 0;
  for (const ch of typed) {
    equal(
      textInput.appendChar((ts += 120), ch.codePointAt(0)!, 120),
      Feedback.Succeeded,
    );
  }

  isTrue(textInput.completed);
  equal(textInput.pos, "ziji canguan fanggang fang zhanlve".length);
  equal(textInput.steps.length, typed.length);
  const stats = makeStats(textInput.steps);
  equal(stats.errors, 0);
  isTrue(stats.histogram.validate());
  // Extra 'h' from "zhiji" was attributed to 'h' with real timing (120ms).
  equal(stats.histogram.get("h".codePointAt(0)!)?.hitCount, 2);
  equal(stats.histogram.get("h".codePointAt(0)!)?.timeToType, 120);
  // Same-length veUe substitute on zhanlve recorded expected 'v'.
  equal(stats.histogram.get("v".codePointAt(0)!)?.hitCount, 1);

  // Disabled zhQuanpin ignores Quanpin fuzzy rules.
  const enInput = new TextInput("zhongguo", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: false,
    fuzzy,
  });
  equal(enInput.appendChar(100, "z".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(enInput.appendChar(200, "o".codePointAt(0)!, 100), Feedback.Failed);

  // spaceSkipsWords: false still allows omitting trailing 'g' directly before space
  // and adding/omitting trailing 'g' directly before punctuation.
  const spaceNoSkip = new TextInput("fang de,fan,fang.", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy: { ...fuzzy },
  });
  const typedPunct = "fan de,fang,fan.";
  let ts2 = 0;
  for (const ch of typedPunct) {
    equal(
      spaceNoSkip.appendChar((ts2 += 120), ch.codePointAt(0)!, 120),
      Feedback.Succeeded,
    );
  }
  isTrue(spaceNoSkip.completed);
  equal(spaceNoSkip.steps.length, typedPunct.length);
  equal(makeStats(spaceNoSkip.steps).errors, 0);
});

test("zh quanpin fuzzy: clearWord snapshot rollback after skip, extra, and boundary state", () => {
  const fuzzy = {
    enEng: false,
    anAng: true,
    inIng: false,
    ianIang: false,
    uanUang: false,
    zhZ: true,
    chC: false,
    shS: false,
    lN: false,
    fH: false,
    rL: false,
    veUe: false,
  };

  // Word 1: "ziji" (type "zhiji" with extra 'h'), Word 2: "zhongguo" (skip 'h', then clearWord!)
  const textInput = new TextInput("ziji zhongguo canguan", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });

  let ts = 0;
  for (const ch of "zhiji ") {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  equal(textInput.pos, 5); // "ziji "
  equal(textInput.steps.length, 6); // z,h,i,j,i,' '

  // Start typing "zhongguo" as "zong" (skipping 'h').
  for (const ch of "zong") {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  equal(textInput.pos, 10); // "ziji zhong"
  equal(textInput.steps.length, 10); // 6 ("zhiji ") + 4 ("zong")
  // clearWord() must roll back cleanly to right after "ziji " (pos 5, steps 6)!
  equal(textInput.clearWord(), Feedback.Succeeded);
  equal(textInput.pos, 5);
  equal(textInput.steps.length, 6);
  equal(showChars(textInput), "z|i|j|i| |[z]|h|o|n|g|g|u|o| |c|a|n|g|u|a|n");

  // Re-type "zhongguo " canonically; first char recovers from clearWord typo flag.
  equal(
    textInput.appendChar((ts += 100), "z".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  for (const ch of "hongguo ") {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  equal(textInput.pos, 14); // "ziji zhongguo "

  // Now type "cang" (sets pendingBoundaryG: extraG), add typo 'x', clearChar() pops 'x',
  // then second 'g' is still absorbed by pendingBoundaryG!
  for (const ch of "cang") {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  equal(
    textInput.appendChar((ts += 100), "x".codePointAt(0)!, 100),
    Feedback.Failed,
  );
  equal(textInput.clearChar(), Feedback.Succeeded);
  equal(
    textInput.appendChar((ts += 100), "g".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  // Now clearWord() after extraG absorbed must roll back all of "canguan" cleanly to pos 14!
  equal(textInput.clearWord(), Feedback.Succeeded);
  equal(textInput.pos, 14);
  equal(textInput.steps.length, 15); // 6 ("zhiji ") + 9 ("zhongguo ")

  // Re-type "cangguan" cleanly to finish.
  equal(
    textInput.appendChar((ts += 100), "c".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  for (const ch of "angguan") {
    equal(
      textInput.appendChar((ts += 100), ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  isTrue(textInput.completed);
  equal(textInput.pos, "ziji zhongguo canguan".length);
});

function showSteps({ steps }: TextInput) {
  return steps
    .map(({ codePoint, timeStamp, timeToType, typo }) => {
      let s = String.fromCodePoint(codePoint);
      s = `${s},${timeStamp},${timeToType}`;
      if (typo) {
        s = `!${s}`;
      }
      return s;
    })
    .join("|");
}

function showChars({ chars }: TextInput) {
  return chars
    .map(({ codePoint, attrs }) => {
      let s = String.fromCodePoint(codePoint);
      if (attrs & Attr.Miss) {
        s = `!${s}`;
      }
      if (attrs & Attr.Garbage) {
        s = `*${s}`;
      }
      if (attrs & Attr.Cursor) {
        s = `[${s}]`;
      }
      return s;
    })
    .join("|");
}
