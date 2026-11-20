import { Attr, type Char, type Line, type LineList } from "@keybr/textinput";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FormattedMessage } from "react-intl";
import { ZH_CODE_TO_CHARS } from "./zhMap.ts";
import { ZH_CODE_TO_WORD } from "./zhWords.ts";

// 中文双拼的练习文本渲染。
//
// 一个"词"由空格分隔，词内每两个字母是一个汉字（hc = 好、hcde = 好的）。
//
// 显示汉字时优先整词查 ZH_CODE_TO_WORD：练习文本里存的是双拼码，
// 同一个码对应一堆同音字，逐音节猜会把「巴黎」画成「罢李」、「备案」画成「被安」。
// 查不到才退回按音节取字（zhMap.ts），保证不至于显示成光秃秃的码。
//
// 光标是一条贴在字底的横线，单独绝对定位在整块文本上（不在每个字里面），
// 这样换字时可以 transition 平滑滑过去，也能落在词与词之间的空格上。
// 左半段＝第一个键、右半段＝第二个键，各自取色：
// 打对绿、打错红、还没打白。汉字和拼音本身只标错（红），其余一律灰，
// 打字进度完全靠光标判断。
//
// 只改渲染，不动输入状态机——字母还是一个一个按，keybr 的统计照常。

const STORAGE_KEY = "keytrace.zh.showCode";

const COLOR = {
  /** 未打/已打的字都用这一个灰，不闪烁 */
  todo: "#8a857c",
  hit: "#7fae8f",
  miss: "#d4503a",
  /** 光标还没走到的那半段（灰色，不用白色，白色在大片灰字里太跳） */
  current: "#a8a29a",
  code: "#6d6a63",
};

/** 光标线离字底的间距，和 unit 的 padding-bottom 对应 */
const LINE_GAP = 4;
const LINE_HEIGHT = 2.5;

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#8c8880",
    fontSize: "11px",
    userSelect: "none" as const,
  },
  // 所有行的容器，光标相对它定位
  board: {
    position: "relative" as const,
    display: "flex",
    flexDirection: "column" as const,
    // 拼音悬在字上方 19px，放大后会更靠外，留出空间别顶到容器边框。
    // 不显示拼音时这里要收回去，否则顶部会空一大块（运行时按 showCode 覆盖）
    paddingTop: "22px",
    // 行间距要同时容下「上一行的光标线」和「下一行字上方的拼音」。
    // 拼音悬在字顶上方 13px、高 10px，光标线在行底往上 4~6.5px。
    gap: "36px",
  },
  line: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "flex-end" as const,
    // 词间距完全由空格元素承担（半字宽），这里不能再加 columnGap，
    // 否则 space 两侧各多 9px，词间距会接近一整字
    columnGap: 0,
    // 真正的行间距在这里：文本只有一行 LineList，三行是 flex 自动换行出来的，
    // board 的 gap 管不到换行，必须由 rowGap 决定
    rowGap: "30px",
  },
  word: {
    display: "inline-flex",
    alignItems: "flex-end" as const,
  },
  /** 词与词之间的空格：半个汉字宽，中间点一个中点，也是光标可以停留的位置 */
  space: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "14px",
    height: "34px",
    color: COLOR.todo,
    fontSize: "28px",
    lineHeight: 1.05,
  },
  unit: {
    position: "relative" as const,
    display: "inline-flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "0 0.5px 5px",
  },
  hanzi: {
    fontSize: "28px",
    lineHeight: 1.05,
    fontFamily: '"Songti SC", "SimSun", serif',
    letterSpacing: 0,
  },
  code: {
    position: "absolute" as const,
    top: "-19px",
    fontSize: "16px",
    fontFamily: "ui-monospace, Consolas, monospace",
    color: COLOR.code,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
  },
  // 光标层：位置和宽度由 JS 按当前字算出来
  cursorLayer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: `${LINE_HEIGHT}px`,
    display: "flex",
    borderRadius: "1.5px",
    overflow: "hidden",
    pointerEvents: "none" as const,
    willChange: "transform,width",
  },
  cursorHalf: {
    flex: 1,
    height: "100%",
  },
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Unit = {
  readonly code: string;
  readonly chars: readonly Char[];
  /** 光标正停在这个字上 */
  readonly cursor: boolean;
};

type Group =
  | { readonly kind: "word"; readonly units: readonly Unit[] }
  | {
      readonly kind: "space";
      readonly cursor: boolean;
      /** 空格自己的状态，用来决定中点变绿还是变红 */
      readonly attrs: number;
    };

function has(attr: number, mask: number): boolean {
  return (attr & mask) !== 0;
}

/** 一个键的状态色：打对绿、打错红、还没打返回 null */
function stateColor(attr: number): string | null {
  if (has(attr, Attr.Hit)) {
    return COLOR.hit;
  }
  if (has(attr, Attr.Miss) || has(attr, Attr.Garbage)) {
    return COLOR.miss;
  }
  return null;
}

function toGroups(chars: readonly Char[]): Group[] {
  const groups: Group[] = [];
  let buffer: Char[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const units: Unit[] = [];
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      const pair = buffer.slice(i, i + 2);
      units.push({
        code: pair.map((c) => String.fromCodePoint(c.codePoint)).join(""),
        chars: pair,
        cursor: pair.some((c) => has(c.attrs, Attr.Cursor)),
      });
    }
    // 奇数个字母（标点）时，最后落单的那个也画出来，别吞字
    if (buffer.length % 2 === 1) {
      const last = buffer[buffer.length - 1];
      units.push({
        code: String.fromCodePoint(last.codePoint),
        chars: [last],
        cursor: has(last.attrs, Attr.Cursor),
      });
    }
    groups.push({ kind: "word", units });
    buffer = [];
  };

  for (const char of chars) {
    if (char.codePoint === 0x20) {
      flush();
      groups.push({
        kind: "space",
        cursor: has(char.attrs, Attr.Cursor),
        attrs: char.attrs,
      });
      continue;
    }
    buffer.push(char);
  }
  flush();
  return groups;
}

function pickChar(code: string): string {
  // 标点在文本里存的是 ASCII（键盘上真按的键），显示成中文标点
  switch (code) {
    case ",":
      return "，";
    case ".":
      return "。";
    case "?":
      return "？";
    case "!":
      return "！";
  }
  const chars = ZH_CODE_TO_CHARS[code];
  if (chars == null || chars.length === 0) {
    return code;
  }
  // 同一音节不再按位置轮换——轮换会让同一个词每次重画都换字，看起来在跳
  return chars[0];
}

// 整词取汉字：把一个 group 里的音节码拼回完整的词码，查表拿到真词。
// 词尾可能跟着一个 ASCII 标点（, . ? !），它也是独立的一个 unit，要先剥掉。
// 返回与 units 等长的数组，值是空串表示"这个词没查到，调用方自己退回 pickChar"。
function resolveWordChars(units: readonly Unit[]): readonly string[] {
  const isCode = (u: Unit) => /^[a-z]{2}$/.test(u.code);
  let end = units.length;
  while (end > 0 && !isCode(units[end - 1])) {
    end--;
  }
  const code = units
    .slice(0, end)
    .map((u) => u.code)
    .join("");
  const word = ZH_CODE_TO_WORD[code];
  const empty = units.map(() => "");
  // 用 Array.from 而不是 word[i]：生僻字是代理对，按下标取会被拆成半个字符
  const chars = word == null ? [] : Array.from(word);
  if (chars.length !== end) {
    return empty;
  }
  return units.map((_, i) => (i < end ? chars[i] : ""));
}

// 累加 offsetLeft/offsetTop 直到 board，得到纯布局坐标（不受 scale 影响）
function offsetIn(el: HTMLElement, board: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node != null && node !== board) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

// 把光标挪到当前字下面。
//
// 关键：width 不能参与 transition。之前把 `width` 也写进过渡列表，
// 窗口缩放时宽度会从旧值往新值"长大"，屏幕上就是一条被拉长的白条——
// 位置可以平滑，宽度必须瞬变。
function placeCursor(
  board: HTMLElement,
  cursor: HTMLElement,
  smooth: boolean,
): void {
  const target = board.querySelector<HTMLElement>('[data-cursor="1"]');
  if (target == null) {
    cursor.style.opacity = "0";
    return;
  }
  // 用 offsetLeft/offsetTop 而不是 getBoundingClientRect：
  // rect 是"缩放之后"的视觉坐标，而 transform: translate() 作用在"缩放之前"的
  // 布局坐标系里。keybr 的 Zoomer 会给文本区套 transform: scale，
  // 两者一旦混用，缩放后光标就会整体偏移。
  // offset 是纯布局坐标，完全不受 transform 影响，天然对齐。
  // unit 和空格的 offsetParent 都是 board（中间几层都没有 position），所以直接可用。
  const x = offsetIn(target, board).x;
  const y = offsetIn(target, board).y + target.offsetHeight - LINE_GAP - LINE_HEIGHT;
  const w = Math.max(14, target.offsetWidth);

  cursor.style.transition = smooth ? "transform 110ms ease-out, opacity 110ms" : "none";
  cursor.style.width = `${w}px`;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.style.opacity = "1";
}

// 换行是 CSS 算出来的，React 里不知道"哪一行从哪个词开始"。
// 所以在渲染后量一次：紧贴容器左边的空格就是行首，把它中间那个点藏掉，
// 否则一行会以「·」开头。宽度保留，保证换行位置不会因此跳来跳去。
function hideLineStartDots(board: HTMLElement): void {
  const left = board.getBoundingClientRect().left;
  for (const el of board.querySelectorAll<HTMLElement>("[data-space]")) {
    const rect = el.getBoundingClientRect();
    const atLineStart = Math.abs(rect.left - left) < 2;
    const dot = el.querySelector<HTMLElement>("[data-dot]");
    if (dot != null) {
      dot.style.visibility = atLineStart ? "hidden" : "visible";
    }
  }
}

export function ZhLines({
  lines,
  focus,
}: {
  readonly lines: LineList;
  readonly focus: boolean;
}): ReactNode {
  const [showCode, setShowCode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setShowCode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 隐私模式下写不了，忽略
      }
      return next;
    });
  }, []);

  const boardRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);

  // 布局变了（窗口缩放、换行、字体加载完）就重算一次，且不带过渡——
  // 这种变化不是"光标走了一步"，不该有滑动动画。
  useEffect(() => {
    const board = boardRef.current;
    const cursor = cursorRef.current;
    if (board == null || cursor == null) {
      return;
    }
    const replant = () => {
      placeCursor(board, cursor, false);
      hideLineStartDots(board);
    };
    window.addEventListener("resize", replant);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(replant);
      observer.observe(board);
    }
    // 宋体/思源宋体加载完成前用的是回退字体，字宽度不一样，位置会偏
    document.fonts?.ready.then(replant).catch(() => {});
    return () => {
      window.removeEventListener("resize", replant);
      observer?.disconnect();
    };
  }, []);

  const groupsByLine = lines.lines.map((line: Line) => toGroups(line.chars));

  // 找出光标落在哪，顺便定它的两半颜色
  let cursorColor: { left: string; right: string | null } | null = null;
  for (const groups of groupsByLine) {
    for (const group of groups) {
      if (group.kind === "space") {
        if (group.cursor) {
          // 空格只有一个宽度，整条一个颜色
          cursorColor = { left: COLOR.current, right: null };
        }
        continue;
      }
      for (const unit of group.units) {
        if (unit.cursor) {
          const first = unit.chars[0]?.attrs ?? 0;
          const second = unit.chars.length === 2 ? (unit.chars[1]?.attrs ?? 0) : null;
          cursorColor = {
            left: stateColor(first) ?? COLOR.current,
            right: second == null ? null : (stateColor(second) ?? COLOR.current),
          };
        }
      }
      if (cursorColor != null) {
        break;
      }
    }
    if (cursorColor != null) {
      break;
    }
  }

  // 每次渲染后把光标挪到当前字底下。首次渲染不做过渡，避免从左上角飞过来。
  useIsomorphicLayoutEffect(() => {
    const board = boardRef.current;
    const cursor = cursorRef.current;
    if (board == null || cursor == null) {
      return;
    }
    placeCursor(board, cursor, mountedRef.current);
    hideLineStartDots(board);
    mountedRef.current = true;
  });

  return (
    <div style={styles.root}>
      <label style={styles.toggleRow}>
        <input type="checkbox" checked={showCode} onChange={toggle} />
        <FormattedMessage
          id="practice.zh.showCode"
          defaultMessage="Show Shuangpin code"
        />
      </label>

      <div
        ref={boardRef}
        style={{
          ...styles.board,
          // 不显示拼音时，字上方那 19px 和行间为拼音留的空隙都不需要了
          paddingTop: showCode ? "22px" : "2px",
        }}
      >
        {groupsByLine.map((groups, lineIndex) => {
          return (
            <div
              key={lineIndex}
              style={{
                ...styles.line,
                rowGap: showCode ? "30px" : "12px",
                opacity: focus ? 1 : 0.55,
              }}
            >
              {groups.map((group, groupIndex) => {
                if (group.kind === "space") {
                  // 空格是被真正输入的字符（打完一个词光标停在它上面），
                  // 颜色只认它自己的状态。之前让它继承前一个字是错的——
                  // 前一个字一打完它就绿，比实际敲空格早一步。
                  return (
                    <span
                      key={groupIndex}
                      data-space="1"
                      data-cursor={group.cursor ? "1" : undefined}
                      style={{
                        ...styles.space,
                        color: stateColor(group.attrs) ?? COLOR.todo,
                      }}
                    >
                      {/* 中点：跟 keybr 原版一样，让词与词的边界看得见 */}
                      <span data-dot="1">{"\u00b7"}</span>
                    </span>
                  );
                }
                const chars = resolveWordChars(group.units);
                return (
                  <span key={groupIndex} style={styles.word}>
                    {group.units.map((unit, i) => (
                      <UnitView
                        key={i}
                        unit={unit}
                        char={chars[i]}
                        showCode={showCode}
                      />
                    ))}
                  </span>
                );
              })}
            </div>
          );
        })}

        <span
          ref={cursorRef}
          aria-hidden={true}
          style={{
            ...styles.cursorLayer,
            opacity: 0,
          }}
        >
          <span
            style={{
              ...styles.cursorHalf,
              background: cursorColor?.left ?? COLOR.current,
            }}
          />
          {cursorColor?.right != null ? (
            <span
              style={{ ...styles.cursorHalf, background: cursorColor.right }}
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}

function UnitView({
  unit,
  char,
  showCode,
}: {
  readonly unit: Unit;
  /** 整词查表得到的汉字；空串表示查不到，退回按音节取字 */
  readonly char: string;
  readonly showCode: boolean;
}): ReactNode {
  const two = unit.chars.length === 2;
  const first = unit.chars[0]?.attrs ?? 0;
  const second = two ? (unit.chars[1]?.attrs ?? 0) : 0;

  // 一个字里两个键各自的状态色（绿/红），没打过是 null
  const c1 = stateColor(first);
  const c2 = two ? stateColor(second) : null;

  // 汉字：左右两半分别跟着两个键走。打对一半就是左绿右灰，
  // 第一个键打错就是左红右灰；两半同色时用实色，避免多画一层渐变。
  const left = c1 ?? COLOR.todo;
  const right = two ? (c2 ?? COLOR.todo) : left;
  const hanziStyle: CSSProperties = { ...styles.hanzi };
  if (two && left !== right) {
    hanziStyle.backgroundImage = `linear-gradient(90deg, ${left} 0 50%, ${right} 50% 100%)`;
    hanziStyle.WebkitBackgroundClip = "text";
    hanziStyle.backgroundClip = "text";
    hanziStyle.color = "transparent";
  } else {
    hanziStyle.color = left;
  }

  // 拼音也拆成两个字符分别上色：第一个字符对应第一个键、第二个字符对应第二个键
  const codeChars = Array.from(unit.code);
  const codeColor = (i: number): string =>
    (i === 0 ? c1 : c2) ?? COLOR.code;

  return (
    <span
      style={styles.unit}
      data-cursor={unit.cursor ? "1" : undefined}
    >
      {showCode ? (
        <span style={styles.code}>
          {codeChars.map((ch, i) => (
            <span key={i} style={{ color: codeColor(i) }}>
              {ch}
            </span>
          ))}
        </span>
      ) : null}
      <span style={hanziStyle}>{char !== "" ? char : pickChar(unit.code)}</span>
    </span>
  );
}
