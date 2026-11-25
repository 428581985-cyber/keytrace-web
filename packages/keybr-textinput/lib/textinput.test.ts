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

test("zh mode: spaceSkipsWords and clearWord treat Chinese comma/period/question/exclamation as word boundaries without breaking semicolon", () => {
  const spText = "dage,ykgo uiwu.glxi";
  const sp = new TextInput(spText, {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhShuangpin: true,
  });

  // Type "da" (pos 2 inside "dage"), then Space -> skips "ge," (g,e,!,) to 'y' of "ykgo".
  equal(sp.appendChar(100, "d".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(sp.appendChar(200, "a".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(sp.appendChar(300, Space, 100), Feedback.Recovered);
  equal(sp.pos, 5);
  equal(showChars(sp), "d|a|!g|!e|!,|[y]|k|g|o| |u|i|w|u|.|g|l|x|i");
  equal(
    showSteps(sp),
    "d,100,100|a,200,100|!g,300,0|!e,300,0|!,,300,0",
  );

  // Space at start of word right after ',' with no typo is ignored (does NOT skip "ykgo").
  equal(sp.appendChar(400, Space, 100), Feedback.Succeeded);
  equal(sp.pos, 5);

  // After a typo at word start right after ',', Space skips only "ykgo " to 'u'.
  equal(sp.appendChar(500, X, 100), Feedback.Failed);
  equal(sp.appendChar(600, Space, 100), Feedback.Recovered);
  equal(sp.pos, 10);
  equal(
    showChars(sp),
    "d|a|!g|!e|!,|!y|!k|!g|!o| |[u]|i|w|u|.|g|l|x|i",
  );

  // Type "ui", then clearWord() stops at ' ' (pos 10), then clearWord() again stays at pos 10.
  equal(sp.appendChar(700, "u".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(sp.appendChar(800, "i".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(sp.pos, 12);
  equal(sp.clearWord(), Feedback.Succeeded);
  equal(sp.pos, 10);
  equal(sp.clearWord(), Feedback.Succeeded);
  equal(sp.pos, 10);

  // Recover and type "uiwu", then press Space ON '.' -> consumes '.' with typo: true, lands on 'g' (pos 15).
  equal(sp.appendChar(900, "u".codePointAt(0)!, 100), Feedback.Recovered);
  for (const ch of "iwu") {
    equal(sp.appendChar(1000, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  equal(sp.pos, 14);
  equal(sp.appendChar(1100, Space, 100), Feedback.Recovered);
  equal(sp.pos, 15);
  equal(sp.steps[sp.steps.length - 1].typo, true);
  equal(sp.steps[sp.steps.length - 1].codePoint, ".".codePointAt(0));

  // clearWord() right after '.' stays at pos 15; typing "gl" then clearWord() rolls back to pos 15.
  equal(sp.clearWord(), Feedback.Succeeded);
  equal(sp.pos, 15);
  equal(sp.appendChar(1200, "g".codePointAt(0)!, 100), Feedback.Recovered);
  equal(sp.appendChar(1300, "l".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(sp.pos, 17);
  equal(sp.clearWord(), Feedback.Succeeded);
  equal(sp.pos, 15);

  // Finish "glxi" with Space at EOF? No EOF punctuation here, type "glxi".
  equal(sp.appendChar(1400, "g".codePointAt(0)!, 100), Feedback.Recovered);
  for (const ch of "lxi") {
    equal(sp.appendChar(1500, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  isTrue(sp.completed);

  // EOF trailing period with spaceSkipsWords: true skips '.' with typo: true and completes.
  const eofPunct = new TextInput("dage.", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhShuangpin: true,
  });
  equal(eofPunct.appendChar(100, "d".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(eofPunct.appendChar(200, Space, 100), Feedback.Recovered);
  isTrue(eofPunct.completed);
  equal(
    showSteps(eofPunct),
    "d,100,100|!a,200,0|!g,200,0|!e,200,0|!.,200,0",
  );

  // Microsoft Shuangpin (zh-sp-ms): ';' is a syllable letter, NOT a boundary!
  const ms = new TextInput("jnx;,mztm.", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhShuangpin: true,
    zhScheme: "zh-sp-ms",
  });
  equal(ms.appendChar(100, "j".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(ms.appendChar(200, "n".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(ms.appendChar(300, "x".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(ms.appendChar(400, ";".codePointAt(0)!, 100), Feedback.Succeeded);
  // Cursor is on ',' (pos 4); clearWord() rolls back ALL of "jnx;" (including ';') to pos 0.
  equal(ms.clearWord(), Feedback.Succeeded);
  equal(ms.pos, 0);

  // Retype 'j' (Recovers), then Space skips "nx;," across ';' up to ',' and lands on 'm' (pos 5).
  equal(ms.appendChar(500, "j".codePointAt(0)!, 100), Feedback.Recovered);
  equal(ms.appendChar(600, Space, 100), Feedback.Recovered);
  equal(ms.pos, 5);
  equal(showChars(ms), "!j|!n|!x|!;|!,|[m]|z|t|m|.");

  // English mode preserves comma/period inside words as non-boundaries.
  const en = new TextInput("word, next", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
  });
  equal(en.appendChar(100, "w".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(en.appendChar(200, Space, 100), Feedback.Recovered);
  equal(en.pos, 6); // skipped "ord, " to 'n'
  equal(en.steps[4].typo, true); // ','
  equal(en.steps[5].typo, false); // ' '
});

test("zh quanpin: spaceSkipsWords, stopOnError=false, and forgiveErrors combinations", () => {
  const fuzzy = {
    enEng: false,
    anAng: true,
    inIng: false,
    ianIang: false,
    uanUang: false,
    zhZ: true,
    chC: false,
    shS: false,
    lN: true,
    fH: false,
    rL: false,
    veUe: false,
  };

  // stopOnError=false + spaceSkipsWords=true + forgiveErrors=false on Quanpin with ',' and '.'
  const qp = new TextInput("fangan,meitian jianchi.shuru", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: true,
    zhQuanpin: true,
  });
  for (const ch of "fang") {
    equal(qp.appendChar(100, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  // Garbage then Space clears garbage and skips only "an," to 'm' of "meitian".
  equal(qp.appendChar(200, X, 100), Feedback.Failed);
  equal(showChars(qp), "f|a|n|g|*x|[a]|n|,|m|e|i|t|i|a|n| |j|i|a|n|c|h|i|.|s|h|u|r|u");
  equal(qp.appendChar(300, Space, 100), Feedback.Recovered);
  equal(qp.pos, 7); // 'm'
  // clearWord() right after ',' stays at pos 7.
  equal(qp.clearWord(), Feedback.Succeeded);
  equal(qp.pos, 7);

  // Space at word start after clearWord() (#typo === true, garbage empty) skips "meitian ".
  equal(qp.appendChar(400, Space, 100), Feedback.Recovered);
  equal(qp.pos, 15); // 'j' of "jianchi"

  // Quanpin fuzzy skipAndMatch ("fang " typed "fan ") still beats spaceSkipsWords!
  const qpFuzzySkip = new TextInput("fang de,fan", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: true,
    zhQuanpin: true,
    fuzzy,
  });
  for (const ch of "fan de,fan") {
    equal(
      qpFuzzySkip.appendChar(100, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  isTrue(qpFuzzySkip.completed);
  equal(makeStats(qpFuzzySkip.steps).errors, 0);
});

test("zh forgiveErrors=true: Quanpin (-n/-ng)+g- boundaries, fuzzy lookahead, and non-double-skip", () => {
  const fuzzy = {
    enEng: false,
    anAng: true,
    inIng: false,
    ianIang: false,
    uanUang: false,
    zhZ: true,
    chC: false,
    shS: false,
    lN: true,
    fH: false,
    rL: false,
    veUe: false,
  };

  // 1. "fanggang" typed "vangang": typo 'v' at pos 0, "ang" recovers and preserves pendingBoundaryG (skipG)!
  const fang = new TextInput("fanggang", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });
  equal(fang.appendChar(100, "v".codePointAt(0)!, 100), Feedback.Failed);
  equal(fang.appendChar(200, "a".codePointAt(0)!, 100), Feedback.Failed);
  equal(fang.appendChar(300, "n".codePointAt(0)!, 100), Feedback.Failed);
  equal(fang.appendChar(400, "g".codePointAt(0)!, 100), Feedback.Recovered);
  equal(fang.pos, 4);
  for (const ch of "ang") {
    equal(fang.appendChar(500, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  isTrue(fang.completed);
  equal(makeStats(fang.steps).errors, 1);
  isTrue(makeStats(fang.steps).histogram.validate());

  // 2. "canguan" typed "xangguan": typo 'x' at pos 0, "ang" recovers and preserves pendingBoundaryG (extraG)!
  const cang = new TextInput("canguan", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });
  equal(cang.appendChar(100, "x".codePointAt(0)!, 100), Feedback.Failed);
  equal(cang.appendChar(200, "a".codePointAt(0)!, 100), Feedback.Failed);
  equal(cang.appendChar(300, "n".codePointAt(0)!, 100), Feedback.Failed);
  equal(cang.appendChar(400, "g".codePointAt(0)!, 100), Feedback.Recovered);
  for (const ch of "guan") {
    equal(cang.appendChar(500, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  isTrue(cang.completed);
  equal(makeStats(cang.steps).errors, 1);

  // 3. "fanggang" typed "fanana" MUST NOT double-skip both 'g's via forgiveErrors + pendingBoundaryG!
  const noDoubleSkip = new TextInput("fanggang", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });
  for (const ch of "fan") {
    equal(
      noDoubleSkip.appendChar(100, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  equal(noDoubleSkip.appendChar(200, "a".codePointAt(0)!, 100), Feedback.Failed);
  equal(noDoubleSkip.appendChar(300, "n".codePointAt(0)!, 100), Feedback.Failed);
  equal(noDoubleSkip.appendChar(400, "a".codePointAt(0)!, 100), Feedback.Failed);
  isFalse(noDoubleSkip.completed);
  equal(noDoubleSkip.pos, 3);
  // Typing 'g' matches pos=3 ('g') -> pos=4 (second 'g'), NOT skipping both 'g's to completion!
  equal(
    noDoubleSkip.appendChar(500, "g".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  isFalse(noDoubleSkip.completed);
  equal(noDoubleSkip.pos, 4);

  // 4. Quanpin fuzzy lookahead: substitute (lN), skipAndMatch (zhZ), consumeExtra (zhZ), and clearWord rollback.
  const qpLookahead = new TextInput("a liang b zhong c ziji", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy,
  });
  // Skip 'a', type " ni" (Space, l->n substitute, 'i') -> recovers!
  equal(qpLookahead.appendChar(100, Space, 100), Feedback.Succeeded);
  equal(qpLookahead.appendChar(200, "n".codePointAt(0)!, 100), Feedback.Failed);
  equal(
    qpLookahead.appendChar(300, "i".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  equal(qpLookahead.pos, 4); // "a li"
  for (const ch of "ang ") {
    equal(
      qpLookahead.appendChar(400, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  // Skip 'b', type " zo" (Space, z->zh skipAndMatch with 'o') -> recovers to pos 13 ("a liang b zho")!
  equal(qpLookahead.appendChar(500, Space, 100), Feedback.Succeeded);
  equal(qpLookahead.appendChar(600, "z".codePointAt(0)!, 100), Feedback.Failed);
  equal(
    qpLookahead.appendChar(700, "o".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  equal(qpLookahead.pos, 13);
  for (const ch of "ng ") {
    equal(
      qpLookahead.appendChar(800, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  // Skip 'c', type " zh" (Space, 'z', consumeExtra 'h') -> recovers to pos 19 ("a liang b zhong c z")!
  equal(qpLookahead.appendChar(900, Space, 100), Feedback.Succeeded);
  equal(qpLookahead.appendChar(1000, "z".codePointAt(0)!, 100), Feedback.Failed);
  equal(
    qpLookahead.appendChar(1100, "h".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  equal(qpLookahead.pos, 19);
  for (const ch of "iji") {
    equal(
      qpLookahead.appendChar(1200, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  isTrue(qpLookahead.completed);
  // clearWord() after fuzzy recovery rolls back cleanly to before "ziji".
  equal(qpLookahead.clearWord(), Feedback.Succeeded);
  equal(qpLookahead.pos, 18);

  // 5. Shuangpin fuzzy lookahead & canonical committedChars + Space-before-recovery + StyledTextSpan cls.
  const spLookahead = new TextInput("dage vuge", {
    stopOnError: false,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhShuangpin: true,
    fuzzy,
  });
  for (const ch of "dag") {
    equal(
      spLookahead.appendChar(100, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  // Skip 'e' at pos 3 by typing " zu" (Space -> #ignoredSpace, 'z' -> zhZ fuzzy for 'v', 'u')!
  equal(spLookahead.appendChar(200, Space, 100), Feedback.Succeeded);
  equal(spLookahead.appendChar(300, "z".codePointAt(0)!, 100), Feedback.Failed);
  equal(
    spLookahead.appendChar(400, "u".codePointAt(0)!, 100),
    Feedback.Recovered,
  );
  equal(spLookahead.pos, 7); // "dage vu"
  // Committed chars hold canonical 'v' (not 'z') so ZhLines resolves Hanzi properly!
  equal(showChars(spLookahead), "d|a|g|!e| |v|u|[g]|e");
  equal(spLookahead.steps[5].codePoint, "v".codePointAt(0));
  for (const ch of "ge") {
    equal(
      spLookahead.appendChar(500, ch.codePointAt(0)!, 100),
      Feedback.Succeeded,
    );
  }
  isTrue(spLookahead.completed);

  // Bumping Space at pos 3 then typing 'e' still preserves 0 errors ("ignore the whitespace key").
  const spBump = new TextInput("dage ykgo", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
    zhShuangpin: true,
  });
  for (const ch of "dag") {
    equal(spBump.appendChar(100, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  equal(spBump.appendChar(200, Space, 100), Feedback.Succeeded);
  equal(spBump.appendChar(300, "e".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(spBump.pos, 4);
  equal(makeStats(spBump.steps).errors, 0);

  // StyledTextSpan cls + filterText.normalize lookahead preservation.
  const styled = new TextInput(
    [
      { text: "a", cls: "c1" },
      { text: "‘bc’", cls: "c2" },
    ],
    {
      stopOnError: true,
      forgiveErrors: true,
      spaceSkipsWords: false,
    },
  );
  equal(styled.appendChar(100, X, 100), Feedback.Failed);
  equal(styled.appendChar(200, "'".codePointAt(0)!, 100), Feedback.Failed);
  equal(styled.appendChar(300, B, 100), Feedback.Failed);
  equal(styled.appendChar(400, C, 100), Feedback.Recovered);
  equal(styled.chars[0].cls, "c1");
  equal(styled.chars[1].codePoint, "‘".codePointAt(0));
  equal(styled.chars[1].cls, "c2");
  equal(styled.chars[2].cls, "c2");
  equal(styled.chars[3].cls, "c2");
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

test("zh shuangpin/quanpin with stopOnError=false and forgiveErrors=false recovers on correct key without trapping garbage", () => {
  const sp = new TextInput("igvf", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhShuangpin: true,
  });

  // Two wrong keys accumulate garbage count (shown as badge 1 -> 2), then correct 'i' recovers and clears garbage.
  equal(sp.appendChar(100, "a".codePointAt(0)!, 100), Feedback.Failed);
  equal(sp.appendChar(200, "b".codePointAt(0)!, 100), Feedback.Failed);
  equal(showChars(sp), "*a|*b|[i]|g|v|f");

  equal(sp.appendChar(300, "i".codePointAt(0)!, 100), Feedback.Recovered);
  equal(showChars(sp), "!i|[g]|v|f");
  equal(sp.appendChar(400, "g".codePointAt(0)!, 100), Feedback.Succeeded);
  equal(showChars(sp), "!i|g|[v]|f");
  equal(sp.pos, 2);
});

test("tracks consecutive errorCount (0..10) on cursor char for both stopOnError=true and stopOnError=false", () => {
  const getCursor = (ti: TextInput) =>
    ti.chars.find((c) => (c.attrs & Attr.Cursor) !== 0);

  // 1. stopOnError = true, forgiveErrors = false: no Attr.Garbage emitted, errorCount increments 1..10 & caps at 10
  const stopNoForgive = new TextInput("ab cd", {
    stopOnError: true,
    forgiveErrors: false,
    spaceSkipsWords: true,
  });
  equal(getCursor(stopNoForgive)?.errorCount, undefined);

  for (let i = 1; i <= 12; i++) {
    equal(stopNoForgive.appendChar(i * 100, X, 100), Feedback.Failed);
    equal(
      stopNoForgive.chars.some((c) => (c.attrs & Attr.Garbage) !== 0),
      false,
    );
    equal(getCursor(stopNoForgive)?.errorCount, Math.min(10, i));
  }
  // Backspace decrements from 10 -> 9, and correct key resets errorCount to 0.
  equal(stopNoForgive.clearChar(), Feedback.Succeeded);
  equal(getCursor(stopNoForgive)?.errorCount, 9);
  equal(stopNoForgive.appendChar(1300, A, 100), Feedback.Recovered);
  equal(stopNoForgive.pos, 1);
  equal(getCursor(stopNoForgive)?.codePoint, B);
  equal(getCursor(stopNoForgive)?.errorCount, undefined);

  // Space skip resets errorCount.
  equal(stopNoForgive.appendChar(1400, X, 100), Feedback.Failed);
  equal(stopNoForgive.appendChar(1500, X, 100), Feedback.Failed);
  equal(getCursor(stopNoForgive)?.errorCount, 2);
  equal(stopNoForgive.appendChar(1600, Space, 100), Feedback.Recovered);
  equal(stopNoForgive.pos, 3);
  equal(getCursor(stopNoForgive)?.codePoint, C);
  equal(getCursor(stopNoForgive)?.errorCount, undefined);

  // clearWord resets errorCount when rolling back to word start.
  equal(stopNoForgive.appendChar(1700, C, 100), Feedback.Succeeded);
  equal(stopNoForgive.appendChar(1800, X, 100), Feedback.Failed);
  equal(stopNoForgive.appendChar(1900, X, 100), Feedback.Failed);
  equal(getCursor(stopNoForgive)?.errorCount, 2);
  equal(stopNoForgive.clearWord(), Feedback.Succeeded);
  equal(stopNoForgive.pos, 3);
  equal(getCursor(stopNoForgive)?.codePoint, C);
  equal(getCursor(stopNoForgive)?.errorCount, undefined);

  // reset() clears errorCount.
  equal(stopNoForgive.appendChar(2000, X, 100), Feedback.Failed);
  equal(getCursor(stopNoForgive)?.errorCount, 1);
  stopNoForgive.reset();
  equal(stopNoForgive.pos, 0);
  equal(getCursor(stopNoForgive)?.errorCount, undefined);

  // 2. stopOnError = true, forgiveErrors = true: lookahead recovery resets errorCount on next cursor char.
  const stopForgive = new TextInput("abcde", {
    stopOnError: true,
    forgiveErrors: true,
    spaceSkipsWords: false,
  });
  equal(stopForgive.appendChar(100, X, 100), Feedback.Failed);
  equal(getCursor(stopForgive)?.errorCount, 1);
  equal(stopForgive.appendChar(200, B, 100), Feedback.Failed);
  equal(getCursor(stopForgive)?.errorCount, 2);
  equal(stopForgive.appendChar(300, C, 100), Feedback.Failed);
  equal(getCursor(stopForgive)?.errorCount, 3);
  equal(stopForgive.appendChar(400, D, 100), Feedback.Recovered);
  equal(stopForgive.pos, 4);
  equal(getCursor(stopForgive)?.codePoint, "e".codePointAt(0));
  equal(getCursor(stopForgive)?.errorCount, undefined);

  // 3. stopOnError = false, forgiveErrors = false: errorCount tracks garbage count 1..10 and decrements on Backspace.
  const noStop = new TextInput("abc", {
    stopOnError: false,
    forgiveErrors: false,
    spaceSkipsWords: false,
  });
  for (let i = 1; i <= 12; i++) {
    equal(noStop.appendChar(i * 100, X, 100), Feedback.Failed);
    equal(getCursor(noStop)?.errorCount, Math.min(10, i));
  }
  for (let expected = 9; expected >= 1; expected--) {
    equal(noStop.clearChar(), Feedback.Succeeded);
    equal(getCursor(noStop)?.errorCount, expected);
  }
  equal(noStop.clearChar(), Feedback.Succeeded);
  equal(getCursor(noStop)?.errorCount, undefined);
  // Extra Backspace at 0 stays at 0.
  equal(noStop.clearChar(), Feedback.Succeeded);
  equal(getCursor(noStop)?.errorCount, undefined);

  // 4. stopOnError = true in Chinese Shuangpin & Quanpin (including space & fuzzy recovery).
  const zhQp = new TextInput("fangan meitian", {
    stopOnError: true,
    forgiveErrors: false,
    spaceSkipsWords: false,
    zhQuanpin: true,
    fuzzy: {
      enEng: false,
      anAng: true,
      inIng: false,
      ianIang: false,
      zhZ: false,
      chC: false,
      shS: false,
      lN: false,
    },
  });
  for (const ch of "fan") {
    equal(zhQp.appendChar(100, ch.codePointAt(0)!, 100), Feedback.Succeeded);
  }
  // At 'g' (pos 3), miss twice then fuzzy-skip 'g' by typing 'a' -> resets errorCount.
  equal(zhQp.appendChar(200, X, 100), Feedback.Failed);
  equal(getCursor(zhQp)?.errorCount, 1);
  equal(zhQp.appendChar(300, X, 100), Feedback.Failed);
  equal(getCursor(zhQp)?.errorCount, 2);
  equal(zhQp.appendChar(400, A, 100), Feedback.Recovered);
  equal(zhQp.pos, 5);
  equal(getCursor(zhQp)?.errorCount, undefined);
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
