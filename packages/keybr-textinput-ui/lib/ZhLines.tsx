import { Language } from "@keybr/keyboard";
import {
  Attr,
  CaretMovementStyle,
  CaretShapeStyle,
  type Char,
  Font,
  type Line,
  type LineList,
  type TextDisplaySettings,
  textDisplaySettings,
  WhitespaceStyle,
} from "@keybr/textinput";
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
const DEFAULT_ZH_FONT_CSS: CSSProperties = Font.select(Language.ZH_SP).at(0)
  .cssProperties;

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
    position: "relative" as const,
    zIndex: 1,
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
  /** 词与词之间的空格：半个汉字宽，附着在词尾以防行首出现中点或行尾丢点 */
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
  spaceBar: {
    display: "inline-block",
    width: "9px",
    height: "4px",
    borderLeft: "1.5px solid currentColor",
    borderBottom: "1.5px solid currentColor",
    borderRight: "1.5px solid currentColor",
    marginTop: "8px",
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
  // 光标层：位置和尺寸由 JS 按当前字与光标形状算出来
  cursorLayer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: `${LINE_HEIGHT}px`,
    display: "flex",
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

type SpaceToken = {
  readonly cursor: boolean;
  /** 空格自己的状态，用来决定空白标记变绿还是变红 */
  readonly attrs: number;
};

type Group =
  | {
      readonly kind: "word";
      readonly units: readonly Unit[];
      readonly trailingSpace?: SpaceToken;
    }
  | ({
      readonly kind: "space";
    } & SpaceToken);

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

function isPunctuation(codePoint: number): boolean {
  return (
    codePoint === 0x2c ||
    codePoint === 0x2e ||
    codePoint === 0x3f ||
    codePoint === 0x21
  );
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
      const space: SpaceToken = {
        cursor: has(char.attrs, Attr.Cursor),
        attrs: char.attrs,
      };
      const prev = groups[groups.length - 1];
      if (prev != null && prev.kind === "word" && prev.trailingSpace == null) {
        // 把词尾空格附着到上一个词组内，防止 flex 换行把间隔点丢到行首或藏掉。
        groups[groups.length - 1] = { ...prev, trailingSpace: space };
      } else {
        groups.push({ kind: "space", ...space });
      }
      continue;
    }
    if (isPunctuation(char.codePoint)) {
      flush();
      const punctUnit: Unit = {
        code: String.fromCodePoint(char.codePoint),
        chars: [char],
        cursor: has(char.attrs, Attr.Cursor),
      };
      const prev = groups[groups.length - 1];
      if (prev != null && prev.kind === "word" && prev.trailingSpace == null) {
        // Attach punctuation to the preceding word so line wraps keep them together.
        groups[groups.length - 1] = {
          kind: "word",
          units: [...prev.units, punctUnit],
        };
      } else {
        groups.push({ kind: "word", units: [punctUnit] });
      }
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

type CursorMeta = {
  readonly left: string;
  readonly right: string | null;
  readonly halfIndex: 0 | 1;
};

function findCursorMeta(groupsByLine: readonly Group[][]): CursorMeta | null {
  for (const groups of groupsByLine) {
    for (const group of groups) {
      if (group.kind === "space") {
        if (group.cursor) {
          return { left: COLOR.current, right: null, halfIndex: 0 };
        }
        continue;
      }
      for (const unit of group.units) {
        if (unit.cursor) {
          const first = unit.chars[0]?.attrs ?? 0;
          const second =
            unit.chars.length === 2 ? (unit.chars[1]?.attrs ?? 0) : null;
          const halfIndex: 0 | 1 =
            second != null &&
            has(unit.chars[1].attrs, Attr.Cursor) &&
            !has(unit.chars[0].attrs, Attr.Cursor)
              ? 1
              : 0;
          return {
            left: stateColor(first) ?? COLOR.current,
            right:
              second == null ? null : (stateColor(second) ?? COLOR.current),
            halfIndex,
          };
        }
      }
      if (group.trailingSpace?.cursor) {
        return { left: COLOR.current, right: null, halfIndex: 0 };
      }
    }
  }
  return null;
}

// 把光标挪到当前字或空格处。
//
// 关键：width/height 不能参与 transition。窗口缩放或字宽变化时只能位置平滑，
// 尺寸必须瞬变，否则缩放或换字宽时会出现被拉长的白条。
function placeCursor(
  board: HTMLElement,
  cursor: HTMLElement,
  caretShapeStyle: CaretShapeStyle,
  halfIndex: 0 | 1,
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
  const targetOffset = offsetIn(target, board);
  const body = target.querySelector<HTMLElement>("[data-hanzi]") ?? target;
  const bodyOffset = body === target ? targetOffset : offsetIn(body, board);

  let x = targetOffset.x;
  let y = targetOffset.y;
  let width = Math.max(14, target.offsetWidth);
  let height = LINE_HEIGHT;

  switch (caretShapeStyle) {
    case CaretShapeStyle.Underline:
      y = targetOffset.y + target.offsetHeight - LINE_GAP - LINE_HEIGHT;
      break;
    case CaretShapeStyle.Block:
    case CaretShapeStyle.Box: {
      const padX = caretShapeStyle === CaretShapeStyle.Box ? 1 : 0;
      x = bodyOffset.x - padX;
      y = bodyOffset.y;
      width = Math.max(14, body.offsetWidth) + padX * 2;
      height = Math.max(24, body.offsetHeight);
      break;
    }
    case CaretShapeStyle.Line: {
      const bodyWidth = Math.max(14, body.offsetWidth);
      const isTwoKey = target.dataset.two === "1";
      x =
        bodyOffset.x +
        (isTwoKey && halfIndex === 1 ? Math.round(bodyWidth / 2) : 0);
      y = bodyOffset.y;
      width = 2;
      height = Math.max(24, body.offsetHeight);
      break;
    }
  }

  cursor.style.transition = smooth
    ? "transform 110ms ease-out, opacity 110ms"
    : "none";
  cursor.style.width = `${width}px`;
  cursor.style.height = `${height}px`;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.style.opacity = "1";
}

function getCursorLayerStyle(caretShapeStyle: CaretShapeStyle): CSSProperties {
  switch (caretShapeStyle) {
    case CaretShapeStyle.Block:
      return {
        ...styles.cursorLayer,
        zIndex: 0,
        borderRadius: "2px",
        overflow: "hidden",
        opacity: 0,
      };
    case CaretShapeStyle.Box:
      return {
        ...styles.cursorLayer,
        zIndex: 2,
        boxSizing: "border-box",
        border: "1.5px solid var(--textinput-cursor__background-color, #a8a29a)",
        borderRadius: "2px",
        background: "transparent",
        opacity: 0,
      };
    case CaretShapeStyle.Line:
      return {
        ...styles.cursorLayer,
        zIndex: 2,
        borderRadius: "1px",
        backgroundColor: "var(--textinput-cursor__background-color, #a8a29a)",
        opacity: 0,
      };
    case CaretShapeStyle.Underline:
      return {
        ...styles.cursorLayer,
        zIndex: 2,
        borderRadius: "1.5px",
        overflow: "hidden",
        opacity: 0,
      };
  }
}

export function ZhLines({
  settings,
  lines,
  focus,
  cursor = true,
  showToggle = true,
}: {
  readonly settings?: TextDisplaySettings;
  readonly lines: LineList;
  readonly focus: boolean;
  readonly cursor?: boolean;
  readonly showToggle?: boolean;
}): ReactNode {
  const effectiveSettings = settings ?? textDisplaySettings;
  const { caretShapeStyle, caretMovementStyle, whitespaceStyle, font } =
    effectiveSettings;
  const hanziFontCss = font.scripts.includes("han")
    ? font.cssProperties
    : DEFAULT_ZH_FONT_CSS;

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
  const prevShapeRef = useRef(caretShapeStyle);

  const groupsByLine = lines.lines.map((line: Line) => toGroups(line.chars));
  const cursorMeta = findCursorMeta(groupsByLine);
  const halfIndex: 0 | 1 = cursorMeta?.halfIndex ?? 0;

  const cursorLayoutRef = useRef({ cursor, caretShapeStyle, halfIndex });

  // 布局变了（窗口缩放、换行、字体加载完）就重算一次，且不带过渡——
  // 这种变化不是"光标走了一步"，不该有滑动动画。
  useEffect(() => {
    const board = boardRef.current;
    if (board == null) {
      return;
    }
    const replant = () => {
      const current = cursorLayoutRef.current;
      const cursorEl = cursorRef.current;
      if (current.cursor && cursorEl != null) {
        placeCursor(
          board,
          cursorEl,
          current.caretShapeStyle,
          current.halfIndex,
          false,
        );
      }
    };
    window.addEventListener("resize", replant);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(replant);
      observer.observe(board);
    }
    // 字体加载完成前可能用的是回退字体，字宽度不一样，位置会偏
    document.fonts?.ready.then(replant).catch(() => {});
    return () => {
      window.removeEventListener("resize", replant);
      observer?.disconnect();
    };
  }, []);

  // 每次渲染后把光标挪到当前字或空格处。首次渲染与切换光标形状不做过渡。
  useIsomorphicLayoutEffect(() => {
    cursorLayoutRef.current = { cursor, caretShapeStyle, halfIndex };
    const board = boardRef.current;
    if (board == null) {
      return;
    }
    const shapeChanged = prevShapeRef.current !== caretShapeStyle;
    prevShapeRef.current = caretShapeStyle;
    const cursorEl = cursorRef.current;
    if (cursor && cursorEl != null) {
      const smooth =
        caretMovementStyle === CaretMovementStyle.Smooth &&
        mountedRef.current &&
        !shapeChanged;
      placeCursor(board, cursorEl, caretShapeStyle, halfIndex, smooth);
      mountedRef.current = true;
    }
  });

  return (
    <div style={styles.root}>
      {showToggle ? (
        <label style={styles.toggleRow}>
          <input type="checkbox" checked={showCode} onChange={toggle} />
          <FormattedMessage
            id="practice.zh.showCode"
            defaultMessage="Show Shuangpin code"
          />
        </label>
      ) : null}

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
                  return (
                    <SpaceView
                      key={groupIndex}
                      space={group}
                      showCursor={cursor}
                      whitespaceStyle={whitespaceStyle}
                    />
                  );
                }
                const chars = resolveWordChars(group.units);
                return (
                  <span key={groupIndex} data-word="1" style={styles.word}>
                    {group.units.map((unit, i) => (
                      <UnitView
                        key={i}
                        unit={unit}
                        char={chars[i]}
                        hanziFontCss={hanziFontCss}
                        showCode={showCode}
                        showCursor={cursor}
                      />
                    ))}
                    {group.trailingSpace != null ? (
                      <SpaceView
                        space={group.trailingSpace}
                        showCursor={cursor}
                        whitespaceStyle={whitespaceStyle}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          );
        })}

        {cursor ? (
          <span
            ref={cursorRef}
            aria-hidden={true}
            data-caret-shape={caretShapeStyle}
            data-caret-movement={caretMovementStyle}
            style={getCursorLayerStyle(caretShapeStyle)}
          >
            {caretShapeStyle === CaretShapeStyle.Underline ? (
              <>
                <span
                  style={{
                    ...styles.cursorHalf,
                    background: cursorMeta?.left ?? COLOR.current,
                  }}
                />
                {cursorMeta?.right != null ? (
                  <span
                    style={{
                      ...styles.cursorHalf,
                      background: cursorMeta.right,
                    }}
                  />
                ) : null}
              </>
            ) : caretShapeStyle === CaretShapeStyle.Block ? (
              <>
                <span
                  style={{
                    ...styles.cursorHalf,
                    background:
                      "var(--textinput-cursor__background-color, #a8a29a)",
                    opacity:
                      cursorMeta?.right != null
                        ? halfIndex === 0
                          ? 0.34
                          : 0.16
                        : 0.34,
                  }}
                />
                {cursorMeta?.right != null ? (
                  <span
                    style={{
                      ...styles.cursorHalf,
                      background:
                        "var(--textinput-cursor__background-color, #a8a29a)",
                      opacity: halfIndex === 1 ? 0.34 : 0.16,
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SpaceView({
  space,
  showCursor,
  whitespaceStyle,
}: {
  readonly space: SpaceToken;
  readonly showCursor: boolean;
  readonly whitespaceStyle: WhitespaceStyle;
}): ReactNode {
  return (
    <span
      data-space="1"
      data-whitespace={whitespaceStyle}
      data-cursor={showCursor && space.cursor ? "1" : undefined}
      style={{
        ...styles.space,
        color: stateColor(space.attrs) ?? COLOR.todo,
      }}
    >
      {whitespaceStyle === WhitespaceStyle.Bullet ? (
        <span data-dot="1">{"\u00b7"}</span>
      ) : whitespaceStyle === WhitespaceStyle.Bar ? (
        <span data-bar="1" style={styles.spaceBar} />
      ) : (
        "\u00a0"
      )}
    </span>
  );
}

function UnitView({
  unit,
  char,
  hanziFontCss,
  showCode,
  showCursor,
}: {
  readonly unit: Unit;
  /** 整词查表得到的汉字；空串表示查不到，退回按音节取字 */
  readonly char: string;
  readonly hanziFontCss: CSSProperties;
  readonly showCode: boolean;
  readonly showCursor: boolean;
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
  const hanziStyle: CSSProperties = { ...styles.hanzi, ...hanziFontCss };
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
      data-two={two ? "1" : undefined}
      data-cursor={showCursor && unit.cursor ? "1" : undefined}
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
      <span data-hanzi="1" style={hanziStyle}>
        {char !== "" ? char : pickChar(unit.code)}
      </span>
    </span>
  );
}
