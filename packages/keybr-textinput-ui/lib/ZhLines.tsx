import {
  getZhSchemeFromLayout,
  isZhQuanpin,
  isZhShuangpinSchemeId,
  Language,
  type ZhInputScheme,
} from "@keybr/keyboard";
import {
  Attr,
  CaretMovementStyle,
  CaretShapeStyle,
  type Char,
  Font,
  type Line,
  type LineList,
  resolveQuanpinWord,
  resolveShuangpinChar,
  resolveShuangpinWord,
  splitQuanpinFallback,
  type TextDisplaySettings,
  textDisplaySettings,
  WhitespaceStyle,
  ZH_QP_SYLLABLE_TO_CHARS,
} from "@keybr/textinput";
import {
  type CSSProperties,
  type MouseEvent,
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

// 中文拼音（小鹤双拼 zh-sp / 全拼 zh-qp）的练习文本渲染。
//
// - 双拼（zh-sp）：每两个字母对应一个汉字，整词查 ZH_CODE_TO_WORD，查不到退回 zhMap.ts。
// - 全拼（zh-qp）：每字 1–6 键变长，整词查 resolveQuanpinWord（精确音节长度切片），
//   查不到退回 splitQuanpinFallback + ZH_QP_SYLLABLE_TO_CHARS。
//   开启「显示拼音」时拼音行使用流内 flex（position: static），让 6 键音节自然撑开字宽、
//   不与邻字重叠，且整词 nowrap 换行、底部汉字基线严格对齐。
//
// 光标单独绝对定位在整块文本上，支持 Underline / Block / Box / Line 四种形状与
// 1–6 段 N 等分逐键进度高亮，换字时可按设置平滑滑动。

const STORAGE_KEY_SP = "keytrace.zh.showCode";
const STORAGE_KEY_QP = "keytrace.zh-qp.showCode";

function getShowCodeStorageKey(scheme: ZhInputScheme): string {
  if (scheme === "zh-sp") {
    return STORAGE_KEY_SP;
  }
  if (scheme === "zh-qp") {
    return STORAGE_KEY_QP;
  }
  return `keytrace.${scheme}.showCode`;
}
const DEFAULT_ZH_FONT_CSS: CSSProperties = Font.select(Language.ZH_SP).at(
  0,
).cssProperties;

const COLOR = {
  /** 未打/已打的字都用这一个灰，不闪烁 */
  todo: "#8a857c",
  hit: "#7fae8f",
  miss: "#d4503a",
  /** 光标还没走到的那段（灰色，不用白色，白色在大片灰字里太跳） */
  current: "#a8a29a",
  code: "#6d6a63",
  /** 全拼拼音行当前待敲字母高亮色（跟随主题前景色，兼顾亮暗主题） */
  activeCode: "var(--textinput-cursor__background-color, #a8a29a)",
};

/** 光标线离字底的间距，和 unit 的 padding-bottom 对应 */
const LINE_GAP = 4;
const LINE_HEIGHT = 2.5;
const QUANPIN_UNIT_PAD_X = 3;

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
    isolation: "isolate" as const,
    display: "flex",
    flexDirection: "column" as const,
    // 双拼拼音悬在字上方 19px，留出空间别顶到容器边框；
    // 不显示拼音或全拼流内布局时在运行时覆盖 paddingTop。
    paddingTop: "22px",
    gap: "36px",
  },
  line: {
    position: "relative" as const,
    zIndex: 1,
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "flex-end" as const,
    // 词间距完全由空格元素承担（半字宽），不能再加 columnGap
    columnGap: 0,
    rowGap: "30px",
  },
  word: {
    display: "inline-flex",
    flexWrap: "nowrap" as const,
    alignItems: "flex-end" as const,
  },
  /** 词与词之间的空格：半个汉字宽，附着在词尾以防行首出现中点或行尾丢点 */
  space: {
    position: "relative" as const,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "14px",
    height: "34px",
    color: COLOR.todo,
    fontSize: "28px",
    lineHeight: 1.05,
  },
  garbageBadge: {
    position: "absolute" as const,
    bottom: "-10px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "10px",
    lineHeight: 1,
    fontWeight: 600,
    color: COLOR.miss,
    pointerEvents: "none" as const,
    whiteSpace: "nowrap" as const,
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
  unitQuanpinCode: {
    position: "relative" as const,
    display: "inline-flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "flex-end" as const,
    minWidth: "28px",
    padding: `0 ${QUANPIN_UNIT_PAD_X}px 5px`,
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
  codeQuanpin: {
    position: "static" as const,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "18px",
    lineHeight: "18px",
    marginBottom: "2px",
    fontSize: "13px",
    fontFamily: "ui-monospace, Consolas, monospace",
    color: COLOR.code,
    letterSpacing: "0.02em",
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
  cursorSegment: {
    flex: 1,
    height: "100%",
  },
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Unit = {
  readonly code: string;
  readonly chars: readonly Char[];
  /** 已解析出的汉字或中文标点（空串表示交给回退映射） */
  readonly hanzi?: string;
  /** stopOnError=false 时当前字存在未清除的错字 */
  readonly hasGarbage?: boolean;
  readonly garbageCount?: number;
  /** 当前字活跃位置的连续错误次数（stopOnError=true/false 均生效，上限 10） */
  readonly errorCount?: number;
  readonly isPureGarbage?: boolean;
  /** 光标正停在这个字上 */
  readonly cursor: boolean;
};

type SpaceToken = {
  readonly cursor: boolean;
  /** 空格自己的状态，用来决定空白标记变绿还是变红 */
  readonly attrs: number;
  readonly hasGarbage?: boolean;
  readonly garbageCount?: number;
  readonly errorCount?: number;
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

function mapPunctuation(code: string): string | null {
  switch (code) {
    case ",":
      return "，";
    case ".":
      return "。";
    case "?":
      return "？";
    case "!":
      return "！";
    default:
      return null;
  }
}

function readShowCode(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

function writeShowCode(storageKey: string, value: boolean): void {
  try {
    window.localStorage.setItem(storageKey, value ? "1" : "0");
  } catch {
    // 隐私模式下写不了，忽略
  }
}

const MAX_ERROR_BADGE = 10;

function getCursorErrorCount(chars: readonly Char[]): number {
  for (const ch of chars) {
    if (has(ch.attrs, Attr.Cursor)) {
      return ch.errorCount ?? 0;
    }
  }
  return 0;
}

function resolveErrorCount(
  garbageCount: number,
  cursorErrorCount: number,
): number {
  return Math.min(MAX_ERROR_BADGE, Math.max(garbageCount, cursorErrorCount));
}

function popTrailingGarbage(buffer: Char[]): number {
  let count = 0;
  while (
    buffer.length > 0 &&
    has(buffer[buffer.length - 1].attrs, Attr.Garbage)
  ) {
    buffer.pop();
    count++;
  }
  return count;
}

function toGroupsShuangpin(chars: readonly Char[]): Group[] {
  const groups: Group[] = [];
  let buffer: Char[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const canonical = buffer.filter((c) => !has(c.attrs, Attr.Garbage));
    if (canonical.length === 0) {
      groups.push({
        kind: "word",
        units: [
          {
            code: buffer.map((c) => String.fromCodePoint(c.codePoint)).join(""),
            chars: buffer,
            hanzi: "",
            hasGarbage: true,
            garbageCount: buffer.length,
            errorCount: resolveErrorCount(
              buffer.length,
              getCursorErrorCount(buffer),
            ),
            isPureGarbage: true,
            cursor: buffer.some((c) => has(c.attrs, Attr.Cursor)),
          },
        ],
      });
      buffer = [];
      return;
    }

    const lengths: number[] = [];
    for (let i = 0; i + 1 < canonical.length; i += 2) {
      lengths.push(2);
    }
    // 奇数个字母（标点）时，最后落单的那个也画出来，别吞字
    if (canonical.length % 2 === 1) {
      lengths.push(1);
    }

    const units: Unit[] = [];
    let bufIndex = 0;
    for (let u = 0; u < lengths.length; u++) {
      const targetLen = lengths[u];
      const unitChars: Char[] = [];
      let unitGarbageCount = 0;
      while (bufIndex < buffer.length && unitChars.length < targetLen) {
        const ch = buffer[bufIndex];
        bufIndex++;
        if (has(ch.attrs, Attr.Garbage)) {
          unitGarbageCount++;
        } else {
          unitChars.push(ch);
        }
      }
      if (u === lengths.length - 1) {
        while (bufIndex < buffer.length) {
          if (has(buffer[bufIndex].attrs, Attr.Garbage)) {
            unitGarbageCount++;
          }
          bufIndex++;
        }
      }
      units.push({
        code: unitChars.map((c) => String.fromCodePoint(c.codePoint)).join(""),
        chars: unitChars,
        hasGarbage: unitGarbageCount > 0,
        garbageCount: unitGarbageCount,
        errorCount: resolveErrorCount(
          unitGarbageCount,
          getCursorErrorCount(unitChars),
        ),
        cursor: unitChars.some((c) => has(c.attrs, Attr.Cursor)),
      });
    }

    groups.push({ kind: "word", units });
    buffer = [];
  };

  for (const char of chars) {
    if (!has(char.attrs, Attr.Garbage) && char.codePoint === 0x20) {
      const trailingGarbageCount = popTrailingGarbage(buffer);
      flush();
      const isCursor = has(char.attrs, Attr.Cursor);
      const space: SpaceToken = {
        cursor: isCursor,
        attrs: char.attrs,
        hasGarbage: trailingGarbageCount > 0,
        garbageCount: trailingGarbageCount,
        errorCount: resolveErrorCount(
          trailingGarbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
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
    if (!has(char.attrs, Attr.Garbage) && isPunctuation(char.codePoint)) {
      const trailingGarbageCount = popTrailingGarbage(buffer);
      flush();
      const isCursor = has(char.attrs, Attr.Cursor);
      const punctUnit: Unit = {
        code: String.fromCodePoint(char.codePoint),
        chars: [char],
        hasGarbage: trailingGarbageCount > 0,
        garbageCount: trailingGarbageCount,
        errorCount: resolveErrorCount(
          trailingGarbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
        cursor: isCursor,
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

function pickQuanpinSyllableChar(syllable: string): string {
  const chars = ZH_QP_SYLLABLE_TO_CHARS[syllable.toLowerCase()];
  if (chars == null || chars.length === 0) {
    return "";
  }
  return Array.from(chars)[0] ?? "";
}

function toGroupsQuanpin(chars: readonly Char[]): Group[] {
  const groups: Group[] = [];
  let buffer: Char[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const canonical = buffer.filter((c) => !has(c.attrs, Attr.Garbage));
    if (canonical.length === 0) {
      groups.push({
        kind: "word",
        units: [
          {
            code: buffer.map((c) => String.fromCodePoint(c.codePoint)).join(""),
            chars: buffer,
            hanzi: "",
            hasGarbage: true,
            garbageCount: buffer.length,
            errorCount: resolveErrorCount(
              buffer.length,
              getCursorErrorCount(buffer),
            ),
            isPureGarbage: true,
            cursor: buffer.some((c) => has(c.attrs, Attr.Cursor)),
          },
        ],
      });
      buffer = [];
      return;
    }

    const normalized = canonical
      .map((c) => String.fromCodePoint(c.codePoint))
      .join("")
      .toLowerCase();

    const wordEntry = resolveQuanpinWord(normalized);
    let lengths: readonly number[];
    let hanziList: readonly string[];

    if (
      wordEntry != null &&
      wordEntry.lengths.reduce((sum, n) => sum + n, 0) === canonical.length
    ) {
      lengths = wordEntry.lengths;
      hanziList = wordEntry.chars;
    } else {
      const syllables = splitQuanpinFallback(normalized);
      const total = syllables.reduce((sum, s) => sum + s.length, 0);
      if (syllables.length > 0 && total === canonical.length) {
        lengths = syllables.map((s) => s.length);
        hanziList = syllables.map((s) => pickQuanpinSyllableChar(s));
      } else {
        lengths = [canonical.length];
        hanziList = [pickQuanpinSyllableChar(normalized)];
      }
    }

    const units: Unit[] = [];
    let bufIndex = 0;
    for (let u = 0; u < lengths.length; u++) {
      const targetLen = lengths[u];
      const unitChars: Char[] = [];
      let unitGarbageCount = 0;
      while (bufIndex < buffer.length && unitChars.length < targetLen) {
        const ch = buffer[bufIndex];
        bufIndex++;
        if (has(ch.attrs, Attr.Garbage)) {
          unitGarbageCount++;
        } else {
          unitChars.push(ch);
        }
      }
      if (u === lengths.length - 1) {
        while (bufIndex < buffer.length) {
          if (has(buffer[bufIndex].attrs, Attr.Garbage)) {
            unitGarbageCount++;
          }
          bufIndex++;
        }
      }
      units.push({
        code: unitChars.map((c) => String.fromCodePoint(c.codePoint)).join(""),
        chars: unitChars,
        hanzi: hanziList[u] ?? "",
        hasGarbage: unitGarbageCount > 0,
        garbageCount: unitGarbageCount,
        errorCount: resolveErrorCount(
          unitGarbageCount,
          getCursorErrorCount(unitChars),
        ),
        cursor: unitChars.some((c) => has(c.attrs, Attr.Cursor)),
      });
    }

    groups.push({ kind: "word", units });
    buffer = [];
  };

  for (const char of chars) {
    if (!has(char.attrs, Attr.Garbage) && char.codePoint === 0x20) {
      const trailingGarbageCount = popTrailingGarbage(buffer);
      flush();
      const isCursor = has(char.attrs, Attr.Cursor);
      const space: SpaceToken = {
        cursor: isCursor,
        attrs: char.attrs,
        hasGarbage: trailingGarbageCount > 0,
        garbageCount: trailingGarbageCount,
        errorCount: resolveErrorCount(
          trailingGarbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
      };
      const prev = groups[groups.length - 1];
      if (prev != null && prev.kind === "word" && prev.trailingSpace == null) {
        groups[groups.length - 1] = { ...prev, trailingSpace: space };
      } else {
        groups.push({ kind: "space", ...space });
      }
      continue;
    }
    if (!has(char.attrs, Attr.Garbage) && isPunctuation(char.codePoint)) {
      const trailingGarbageCount = popTrailingGarbage(buffer);
      flush();
      const code = String.fromCodePoint(char.codePoint);
      const isCursor = has(char.attrs, Attr.Cursor);
      const punctUnit: Unit = {
        code,
        chars: [char],
        hanzi: mapPunctuation(code) ?? code,
        hasGarbage: trailingGarbageCount > 0,
        garbageCount: trailingGarbageCount,
        errorCount: resolveErrorCount(
          trailingGarbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
        cursor: isCursor,
      };
      const prev = groups[groups.length - 1];
      if (prev != null && prev.kind === "word" && prev.trailingSpace == null) {
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

function toGroupsAnnotated(chars: readonly Char[]): Group[] {
  const groups: Group[] = [];
  let currentWordId: number | null = null;
  let currentWordUnits: Unit[] = [];
  let currentUnitId: number | null = null;
  let unitChars: Char[] = [];
  let unitHanzi = "";
  let unitGarbageCount = 0;
  let pendingGarbage: Char[] = [];

  const flushUnit = () => {
    if (unitChars.length === 0) {
      currentUnitId = null;
      unitHanzi = "";
      unitGarbageCount = 0;
      return;
    }
    const cursorErrorCount = getCursorErrorCount(unitChars);
    currentWordUnits.push({
      code: unitChars.map((c) => String.fromCodePoint(c.codePoint)).join(""),
      chars: unitChars,
      hanzi: unitHanzi,
      hasGarbage: unitGarbageCount > 0,
      garbageCount: unitGarbageCount,
      errorCount: resolveErrorCount(unitGarbageCount, cursorErrorCount),
      cursor: unitChars.some((c) => has(c.attrs, Attr.Cursor)),
    });
    currentUnitId = null;
    unitChars = [];
    unitHanzi = "";
    unitGarbageCount = 0;
  };

  const flushWord = () => {
    flushUnit();
    if (currentWordUnits.length > 0) {
      groups.push({ kind: "word", units: currentWordUnits });
      currentWordUnits = [];
    }
    currentWordId = null;
  };

  for (const char of chars) {
    if (has(char.attrs, Attr.Garbage)) {
      pendingGarbage.push(char);
      continue;
    }
    if (char.codePoint === 0x20) {
      flushWord();
      const garbageCount = pendingGarbage.length;
      pendingGarbage = [];
      const isCursor = has(char.attrs, Attr.Cursor);
      const space: SpaceToken = {
        cursor: isCursor,
        attrs: char.attrs,
        hasGarbage: garbageCount > 0,
        garbageCount,
        errorCount: resolveErrorCount(
          garbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
      };
      const prev = groups[groups.length - 1];
      if (prev != null && prev.kind === "word" && prev.trailingSpace == null) {
        groups[groups.length - 1] = { ...prev, trailingSpace: space };
      } else {
        groups.push({ kind: "space", ...space });
      }
      continue;
    }
    if (isPunctuation(char.codePoint)) {
      flushUnit();
      const garbageCount = pendingGarbage.length;
      pendingGarbage = [];
      const code = String.fromCodePoint(char.codePoint);
      const isCursor = has(char.attrs, Attr.Cursor);
      const punctUnit: Unit = {
        code,
        chars: [char],
        hanzi: char.zhHanzi ?? mapPunctuation(code) ?? code,
        hasGarbage: garbageCount > 0,
        garbageCount,
        errorCount: resolveErrorCount(
          garbageCount,
          isCursor ? (char.errorCount ?? 0) : 0,
        ),
        cursor: isCursor,
      };
      if (currentWordUnits.length > 0) {
        currentWordUnits.push(punctUnit);
      } else {
        const prev = groups[groups.length - 1];
        if (
          prev != null &&
          prev.kind === "word" &&
          prev.trailingSpace == null
        ) {
          groups[groups.length - 1] = {
            kind: "word",
            units: [...prev.units, punctUnit],
          };
        } else {
          groups.push({ kind: "word", units: [punctUnit] });
        }
      }
      continue;
    }

    if (
      currentUnitId != null &&
      (char.zhUnit == null || char.zhUnit !== currentUnitId)
    ) {
      flushUnit();
    }
    if (
      currentWordId != null &&
      (char.zhWord == null || char.zhWord !== currentWordId)
    ) {
      flushWord();
    }
    if (unitChars.length === 0) {
      currentUnitId = char.zhUnit ?? null;
      currentWordId = char.zhWord ?? null;
      unitHanzi = char.zhHanzi ?? "";
    } else if (unitHanzi === "" && char.zhHanzi != null) {
      unitHanzi = char.zhHanzi;
    }
    if (pendingGarbage.length > 0) {
      unitGarbageCount += pendingGarbage.length;
      pendingGarbage = [];
    }
    unitChars.push(char);
  }

  flushWord();

  if (pendingGarbage.length > 0) {
    groups.push({
      kind: "word",
      units: [
        {
          code: pendingGarbage
            .map((c) => String.fromCodePoint(c.codePoint))
            .join(""),
          chars: pendingGarbage,
          hanzi: "",
          hasGarbage: true,
          garbageCount: pendingGarbage.length,
          errorCount: resolveErrorCount(
            pendingGarbage.length,
            getCursorErrorCount(pendingGarbage),
          ),
          isPureGarbage: true,
          cursor: pendingGarbage.some((c) => has(c.attrs, Attr.Cursor)),
        },
      ],
    });
  }

  return groups;
}

function toGroups(chars: readonly Char[], scheme: ZhInputScheme): Group[] {
  if (chars.some((char) => char.zhUnit != null)) {
    return toGroupsAnnotated(chars);
  }
  return scheme === "zh-qp" ? toGroupsQuanpin(chars) : toGroupsShuangpin(chars);
}

function pickCharShuangpin(code: string, scheme: ZhInputScheme): string {
  const punct = mapPunctuation(code);
  if (punct != null) {
    return punct;
  }
  if (scheme !== "zh-sp" && isZhShuangpinSchemeId(scheme)) {
    return resolveShuangpinChar(code, scheme) ?? code;
  }
  const chars = ZH_CODE_TO_CHARS[code];
  if (chars == null || chars.length === 0) {
    return code;
  }
  // 同一音节不再按位置轮换——轮换会让同一个词每次重画都换字，看起来在跳
  return chars[0];
}

function pickCharQuanpin(code: string): string {
  const punct = mapPunctuation(code);
  if (punct != null) {
    return punct;
  }
  const char = pickQuanpinSyllableChar(code);
  return char !== "" ? char : code;
}

// 整词取汉字（双拼）：把一个 group 里的音节码拼回完整的词码，查表拿到真词。
// 词尾可能跟着一个 ASCII 标点（, . ? !），它也是独立的一个 unit，要先剥掉。
// 返回与 units 等长的数组，值是空串表示"这个词没查到，调用方自己退回 pickCharShuangpin"。
function resolveWordCharsShuangpin(
  units: readonly Unit[],
  scheme: ZhInputScheme,
): readonly string[] {
  const usesSemicolon = scheme === "zh-sp-ms" || scheme === "zh-sp-sg";
  const isCode = usesSemicolon
    ? (u: Unit) => /^[a-z][a-z;]$/.test(u.code)
    : (u: Unit) => /^[a-z]{2}$/.test(u.code);
  let end = units.length;
  while (end > 0 && !isCode(units[end - 1])) {
    end--;
  }
  const code = units
    .slice(0, end)
    .map((u) => u.code)
    .join("");
  const word =
    scheme !== "zh-sp" && isZhShuangpinSchemeId(scheme)
      ? resolveShuangpinWord(code, scheme)
      : ZH_CODE_TO_WORD[code];
  const empty = units.map(() => "");
  // 用 Array.from 而不是 word[i]：生僻字是代理对，按下标取会被拆成半个字符
  const chars = word == null ? [] : Array.from(word);
  if (chars.length !== end) {
    return empty;
  }
  return units.map((_, i) => (i < end ? chars[i] : ""));
}

function formatPercent(index: number, total: number): string {
  if (index === 0) {
    return "0%";
  }
  if (index === total) {
    return "100%";
  }
  const pct = (index * 100) / total;
  return Number.isInteger(pct) ? `${pct}%` : `${Number(pct.toFixed(4))}%`;
}

function buildHanziGradient(colors: readonly string[]): string | null {
  const n = colors.length;
  if (n <= 1) {
    return null;
  }
  const first = colors[0];
  if (colors.every((c) => c === first)) {
    return null;
  }
  const stops: string[] = [];
  let start = 0;
  while (start < n) {
    const color = colors[start];
    let end = start + 1;
    while (end < n && colors[end] === color) {
      end++;
    }
    stops.push(`${color} ${formatPercent(start, n)} ${formatPercent(end, n)}`);
    start = end;
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

// 累加 offsetLeft/offsetTop 直到 board，得到纯布局坐标（不受 scale 影响）
function offsetIn(
  el: HTMLElement,
  board: HTMLElement,
): { x: number; y: number } {
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
  readonly segments: readonly string[];
  readonly activeIndex: number;
  readonly hasError: boolean;
};

function findCursorMeta(groupsByLine: readonly Group[][]): CursorMeta | null {
  for (const groups of groupsByLine) {
    for (const group of groups) {
      if (group.kind === "space") {
        if (group.cursor) {
          const hasError = Boolean(
            group.hasGarbage ||
            (group.errorCount ?? 0) > 0 ||
            has(group.attrs, Attr.Miss),
          );
          return {
            segments: [hasError ? COLOR.miss : COLOR.current],
            activeIndex: 0,
            hasError,
          };
        }
        continue;
      }
      for (const unit of group.units) {
        if (unit.cursor) {
          const activeIndex = Math.max(
            0,
            unit.chars.findIndex((c) => has(c.attrs, Attr.Cursor)),
          );
          const hasActiveError = Boolean(
            unit.hasGarbage || (unit.errorCount ?? 0) > 0,
          );
          const segments = unit.chars.map((c, idx) => {
            const color = stateColor(c.attrs);
            if (color != null) {
              return color;
            }
            if (hasActiveError && idx === activeIndex) {
              return COLOR.miss;
            }
            return COLOR.current;
          });
          const resolvedSegments =
            segments.length > 0 ? segments : [COLOR.current];
          const hasError = Boolean(
            hasActiveError ||
            unit.isPureGarbage ||
            resolvedSegments[activeIndex] === COLOR.miss,
          );
          return {
            segments: resolvedSegments,
            activeIndex,
            hasError,
          };
        }
      }
      if (group.trailingSpace?.cursor) {
        const hasError = Boolean(
          group.trailingSpace.hasGarbage ||
          (group.trailingSpace.errorCount ?? 0) > 0 ||
          has(group.trailingSpace.attrs, Attr.Miss),
        );
        return {
          segments: [hasError ? COLOR.miss : COLOR.current],
          activeIndex: 0,
          hasError,
        };
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
  activeIndex: number,
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
      if (target.dataset.inflow === "1") {
        x = targetOffset.x + QUANPIN_UNIT_PAD_X;
        width = Math.max(14, target.offsetWidth - QUANPIN_UNIT_PAD_X * 2);
      }
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
      const segmentCount = Math.max(
        1,
        Number(target.dataset.segments ?? (target.dataset.two === "1" ? 2 : 1)),
      );
      const clampedIndex = Math.min(activeIndex, segmentCount - 1);
      x =
        bodyOffset.x +
        (segmentCount > 1
          ? Math.round((bodyWidth * clampedIndex) / segmentCount)
          : 0);
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

function getCursorLayerStyle(
  caretShapeStyle: CaretShapeStyle,
  isQuanpin: boolean,
  segmentCount: number,
  hasError: boolean,
): CSSProperties {
  const defaultCursorColor =
    "var(--textinput-cursor__background-color, #a8a29a)";
  const activeColor = hasError ? COLOR.miss : defaultCursorColor;
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
        border: `1.5px solid ${activeColor}`,
        borderRadius: "2px",
        background: "transparent",
        opacity: 0,
      };
    case CaretShapeStyle.Line:
      return {
        ...styles.cursorLayer,
        zIndex: 2,
        borderRadius: "1px",
        backgroundColor: activeColor,
        opacity: 0,
      };
    case CaretShapeStyle.Underline:
      return {
        ...styles.cursorLayer,
        zIndex: 2,
        gap: isQuanpin && segmentCount > 1 ? "1.5px" : "0px",
        borderRadius: "1.5px",
        overflow: "hidden",
        opacity: 0,
      };
  }
}

export function ZhLines({
  settings,
  scheme,
  lines,
  focus,
  cursor = true,
  showToggle = true,
}: {
  readonly settings?: TextDisplaySettings;
  readonly scheme?: ZhInputScheme;
  readonly lines: LineList;
  readonly focus: boolean;
  readonly cursor?: boolean;
  readonly showToggle?: boolean;
}): ReactNode {
  const effectiveSettings = settings ?? textDisplaySettings;
  const resolvedScheme: ZhInputScheme =
    scheme ??
    (settings?.layout != null
      ? getZhSchemeFromLayout(settings.layout)
      : null) ??
    (settings?.language != null && isZhQuanpin(settings.language)
      ? "zh-qp"
      : "zh-sp");
  const isQuanpin = resolvedScheme === "zh-qp";

  const { caretShapeStyle, caretMovementStyle, whitespaceStyle, font } =
    effectiveSettings;
  const hanziFontCss = font.scripts.includes("han")
    ? font.cssProperties
    : DEFAULT_ZH_FONT_CSS;

  const [showCodeByScheme, setShowCodeByScheme] = useState<
    Record<string, boolean>
  >(() => ({
    "zh-sp": readShowCode(getShowCodeStorageKey("zh-sp")),
    "zh-sp-zrm": readShowCode(getShowCodeStorageKey("zh-sp-zrm")),
    "zh-sp-ms": readShowCode(getShowCodeStorageKey("zh-sp-ms")),
    "zh-sp-sg": readShowCode(getShowCodeStorageKey("zh-sp-sg")),
    "zh-qp": readShowCode(getShowCodeStorageKey("zh-qp")),
  }));
  const showCode = showCodeByScheme[resolvedScheme] ?? true;

  const handleToggle = useCallback(() => {
    setShowCodeByScheme((prev) => {
      const next = !(prev[resolvedScheme] ?? true);
      writeShowCode(getShowCodeStorageKey(resolvedScheme), next);
      return { ...prev, [resolvedScheme]: next };
    });
  }, [resolvedScheme]);

  const toggleInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  const handleToggleMouseDown = useCallback(
    (event: MouseEvent<HTMLLabelElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleToggleLabelClick = useCallback(
    (event: MouseEvent<HTMLLabelElement>) => {
      if (event.target !== toggleInputRef.current) {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );
  const mountedRef = useRef(false);
  const prevLayoutModeRef = useRef({
    caretShapeStyle,
    showCode,
    resolvedScheme,
  });

  const groupsByLine = lines.lines.map((line: Line) =>
    toGroups(line.chars, resolvedScheme),
  );
  const cursorMeta = findCursorMeta(groupsByLine);
  const segments = cursorMeta?.segments ?? [COLOR.current];
  const activeIndex = cursorMeta?.activeIndex ?? 0;
  const hasCursorError = cursorMeta?.hasError ?? false;

  const cursorLayoutRef = useRef({ cursor, caretShapeStyle, activeIndex });

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
          current.activeIndex,
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

  // 每次渲染后把光标挪到当前字或空格处。首次渲染、切换光标形状、开关拼音或切换方案不做过渡。
  useIsomorphicLayoutEffect(() => {
    cursorLayoutRef.current = { cursor, caretShapeStyle, activeIndex };
    const board = boardRef.current;
    if (board == null) {
      return;
    }
    const prevMode = prevLayoutModeRef.current;
    const layoutModeChanged =
      prevMode.caretShapeStyle !== caretShapeStyle ||
      prevMode.showCode !== showCode ||
      prevMode.resolvedScheme !== resolvedScheme;
    prevLayoutModeRef.current = { caretShapeStyle, showCode, resolvedScheme };
    const cursorEl = cursorRef.current;
    if (cursor && cursorEl != null) {
      const smooth =
        caretMovementStyle === CaretMovementStyle.Smooth &&
        mountedRef.current &&
        !layoutModeChanged;
      placeCursor(board, cursorEl, caretShapeStyle, activeIndex, smooth);
      mountedRef.current = true;
    } else {
      mountedRef.current = false;
    }
  });

  const boardPaddingTop = showCode ? (isQuanpin ? "4px" : "22px") : "2px";
  const lineRowGap = showCode ? (isQuanpin ? "16px" : "30px") : "12px";

  return (
    <div style={styles.root} data-scheme={resolvedScheme}>
      {showToggle ? (
        <label
          style={styles.toggleRow}
          onMouseDown={handleToggleMouseDown}
          onClick={handleToggleLabelClick}
        >
          <input
            ref={toggleInputRef}
            type="checkbox"
            checked={showCode}
            onChange={handleToggle}
          />
          {isQuanpin ? (
            <FormattedMessage
              id="practice.zh.showPinyin"
              defaultMessage="Show Pinyin"
            />
          ) : (
            <FormattedMessage
              id="practice.zh.showCode"
              defaultMessage="Show Shuangpin code"
            />
          )}
        </label>
      ) : null}

      <div
        ref={boardRef}
        data-zh-board="1"
        style={{
          ...styles.board,
          paddingTop: boardPaddingTop,
          filter: focus ? "none" : "blur(3px)",
        }}
      >
        {groupsByLine.map((groups, lineIndex) => {
          return (
            <div
              key={lineIndex}
              style={{
                ...styles.line,
                rowGap: lineRowGap,
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
                const hasExplicitHanzi = group.units.some(
                  (u) => u.hanzi != null && u.hanzi !== "",
                );
                const chars =
                  isQuanpin || hasExplicitHanzi
                    ? group.units.map((u) => u.hanzi ?? "")
                    : resolveWordCharsShuangpin(group.units, resolvedScheme);
                return (
                  <span key={groupIndex} data-word="1" style={styles.word}>
                    {group.units.map((unit, i) => (
                      <UnitView
                        key={i}
                        unit={unit}
                        char={chars[i]}
                        scheme={resolvedScheme}
                        isQuanpin={isQuanpin}
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
            data-cursor-segments={String(segments.length)}
            data-cursor-active-index={String(activeIndex)}
            data-cursor-error={hasCursorError ? "1" : undefined}
            style={getCursorLayerStyle(
              caretShapeStyle,
              isQuanpin,
              segments.length,
              hasCursorError,
            )}
          >
            {caretShapeStyle === CaretShapeStyle.Underline
              ? segments.map((bg, i) => (
                  <span
                    key={i}
                    data-cursor-segment={String(i)}
                    data-cursor-active={i === activeIndex ? "1" : undefined}
                    style={{
                      ...styles.cursorSegment,
                      background: bg,
                      opacity:
                        isQuanpin && segments.length > 1 && i > activeIndex
                          ? 0.35
                          : 1,
                      borderRadius:
                        isQuanpin && segments.length > 1 ? "1px" : undefined,
                    }}
                  />
                ))
              : caretShapeStyle === CaretShapeStyle.Block
                ? segments.map((_, i) => (
                    <span
                      key={i}
                      data-cursor-segment={String(i)}
                      data-cursor-active={i === activeIndex ? "1" : undefined}
                      style={{
                        ...styles.cursorSegment,
                        background:
                          i === activeIndex && hasCursorError
                            ? COLOR.miss
                            : "var(--textinput-cursor__background-color, #a8a29a)",
                        opacity:
                          segments.length > 1
                            ? i === activeIndex
                              ? 0.34
                              : 0.16
                            : 0.34,
                      }}
                    />
                  ))
                : null}
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
  const garbageCount = space.garbageCount ?? 0;
  const errorCount = space.errorCount ?? garbageCount;
  const hasError = Boolean(space.hasGarbage || errorCount > 0);
  return (
    <span
      data-space="1"
      data-whitespace={whitespaceStyle}
      data-cursor={showCursor && space.cursor ? "1" : undefined}
      data-garbage={garbageCount > 0 ? String(garbageCount) : undefined}
      data-error-count={errorCount > 0 ? String(errorCount) : undefined}
      style={{
        ...styles.space,
        color: stateColor(space.attrs) ?? (hasError ? COLOR.miss : COLOR.todo),
      }}
    >
      {whitespaceStyle === WhitespaceStyle.Bullet ? (
        <span data-dot="1">{"\u00b7"}</span>
      ) : whitespaceStyle === WhitespaceStyle.Bar ? (
        <span data-bar="1" style={styles.spaceBar} />
      ) : (
        "\u00a0"
      )}
      {errorCount >= 2 ? (
        <span data-garbage-badge="1" style={styles.garbageBadge}>
          {String(errorCount)}
        </span>
      ) : null}
    </span>
  );
}

function UnitView({
  unit,
  char,
  scheme,
  isQuanpin,
  hanziFontCss,
  showCode,
  showCursor,
}: {
  readonly unit: Unit;
  /** 整词查表得到的汉字；空串表示查不到，退回按音节取字 */
  readonly char: string;
  readonly scheme: ZhInputScheme;
  readonly isQuanpin: boolean;
  readonly hanziFontCss: CSSProperties;
  readonly showCode: boolean;
  readonly showCursor: boolean;
}): ReactNode {
  const segmentCount = unit.chars.length;
  const two = segmentCount === 2;
  const activeIdx = unit.cursor
    ? Math.max(
        0,
        unit.chars.findIndex((c) => has(c.attrs, Attr.Cursor)),
      )
    : -1;

  const garbageCount = unit.garbageCount ?? 0;
  const errorCount = unit.errorCount ?? garbageCount;
  const hasActiveError = Boolean(unit.hasGarbage || errorCount > 0);

  // 每个键的状态色（绿/红），未打为 null
  const keyColors = unit.chars.map((c, idx) => {
    const color = stateColor(c.attrs);
    if (color != null) {
      return color;
    }
    if (hasActiveError && idx === activeIdx) {
      return COLOR.miss;
    }
    return null;
  });

  // 汉字：按音节长度 N 等分跟着每个键走；全部同色时用实色，避免多余渐变层。
  const hanziColors = keyColors.map((c) => c ?? COLOR.todo);
  const gradient = buildHanziGradient(hanziColors);
  const hanziStyle: CSSProperties = { ...styles.hanzi, ...hanziFontCss };
  if (gradient != null) {
    hanziStyle.backgroundImage = gradient;
    hanziStyle.WebkitBackgroundClip = "text";
    hanziStyle.backgroundClip = "text";
    hanziStyle.color = "transparent";
  } else {
    hanziStyle.color = hanziColors[0] ?? COLOR.todo;
  }

  // 拼音/双拼码按字符分别上色
  const codeChars = Array.from(unit.code);
  const inFlowCode = isQuanpin && showCode;
  const displayChar = unit.isPureGarbage
    ? unit.code
    : char !== ""
      ? char
      : isQuanpin
        ? pickCharQuanpin(unit.code)
        : pickCharShuangpin(unit.code, scheme);

  return (
    <span
      style={inFlowCode ? styles.unitQuanpinCode : styles.unit}
      data-unit="1"
      data-two={two ? "1" : undefined}
      data-segments={String(segmentCount)}
      data-inflow={inFlowCode ? "1" : undefined}
      data-cursor={showCursor && unit.cursor ? "1" : undefined}
      data-garbage={garbageCount > 0 ? String(garbageCount) : undefined}
      data-error-count={errorCount > 0 ? String(errorCount) : undefined}
    >
      {showCode ? (
        <span
          data-code="1"
          style={isQuanpin ? styles.codeQuanpin : styles.code}
        >
          {codeChars.map((ch, i) => {
            const keyColor = keyColors[i] ?? null;
            const isCurrentKey =
              isQuanpin &&
              showCursor &&
              unit.cursor &&
              i === activeIdx &&
              keyColor == null;
            return (
              <span
                key={i}
                data-code-active={isCurrentKey ? "1" : undefined}
                style={{
                  color:
                    keyColor ?? (isCurrentKey ? COLOR.activeCode : COLOR.code),
                }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ) : null}
      <span data-hanzi="1" style={hanziStyle}>
        {displayChar}
      </span>
      {errorCount >= 2 ? (
        <span data-garbage-badge="1" style={styles.garbageBadge}>
          {String(errorCount)}
        </span>
      ) : null}
    </span>
  );
}
