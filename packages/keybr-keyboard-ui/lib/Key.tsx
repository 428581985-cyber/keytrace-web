import {
  type DeadCharacter,
  KeyCharacters,
  type KeyShape,
  type LabelShape,
  type Language,
  type LigatureCharacter,
  ZH_KEY_LABELS,
} from "@keybr/keyboard";
import { type CodePoint, isDiacritic } from "@keybr/unicode";
import { type ClassName, type MouseProps } from "@keybr/widget";
import { clsx } from "clsx";
import { type FunctionComponent, memo, type ReactNode } from "react";
import * as styles from "./Key.module.less";
import { keyGap, keySize } from "./shapes.tsx";

export type KeyProps = {
  readonly depressed?: boolean;
  readonly toggled?: boolean;
  readonly showColors?: boolean;
} & MouseProps;

export function makeKeyComponent(
  language: Language,
  shape: KeyShape,
): FunctionComponent<KeyProps> {
  const { letterName } = language;
  const { isCodePoint, isDead, isLigature } = KeyCharacters;
  const { id, a, b, c, d } = shape;

  // 中文双拼：键帽不显示 a-z，直接显示这个键打的音（U 是 sh，C 是 ao）
  const zh = language.id === "zh-sp" ? ZH_KEY_LABELS[id] : undefined;
  const x = shape.x * keySize;
  const y = shape.y * keySize;
  const w = shape.w * keySize - keyGap;
  const h = shape.h * keySize - keyGap;
  const children: ReactNode[] = [];
  children.push(
    shape.shape ? (
      <path className={styles.button} d={shape.shape} />
    ) : (
      <rect className={styles.button} x={0} y={0} width={w} height={h} />
    ),
  );
  // 中文双拼下键帽上已经有声母/韵母标注，F/J 那两个定位圆点只会碍眼，去掉
  if (shape.homing && zh == null) {
    children.push(
      <circle className={styles.bump} cx={w / 2} cy={h - 5} r={3} />,
    );
  }
  for (const label of shape.labels) {
    children.push(makeLabel(label));
  }
  if (zh != null) {
    children.push(...makeZhLabels(zh, isCodePoint(a) ? letterName(a) : "", w, h));
  } else {
    const ta = isCodePoint(a);
    const tb = isCodePoint(b);
    const tc = isCodePoint(c);
    const td = isCodePoint(d);
    const ab = ta && tb && letterName(a) === letterName(b);
    const cd = tc && td && letterName(c) === letterName(d);
    if (ta && !ab) {
      children.push(makeCodePointLabel(a, 10, 27, styles.secondarySymbol));
    }
    if (tb && !ab) {
      children.push(makeCodePointLabel(b, 10, 12, styles.secondarySymbol));
    }
    if (tc && !cd) {
      children.push(makeCodePointLabel(c, 25, 27, styles.secondarySymbol));
    }
    if (td && !cd) {
      children.push(makeCodePointLabel(d, 25, 12, styles.secondarySymbol));
    }
    if (ta && ab) {
      children.push(makeCodePointLabel(a, 10, 12, styles.primarySymbol));
    }
    if (tc && cd) {
      children.push(makeCodePointLabel(c, 25, 27, styles.primarySymbol));
    }
    if (isDead(a)) {
      children.push(makeDeadLabel(a, 10, 27, styles.secondarySymbol));
    }
    if (isDead(b)) {
      children.push(makeDeadLabel(b, 10, 12, styles.secondarySymbol));
    }
    if (isDead(c)) {
      children.push(makeDeadLabel(c, 25, 27, styles.secondarySymbol));
    }
    if (isDead(d)) {
      children.push(makeDeadLabel(d, 25, 12, styles.secondarySymbol));
    }
    if (isLigature(a)) {
      children.push(makeLigatureLabel(a, 10, 27, styles.secondarySymbol));
    }
    if (isLigature(b)) {
      children.push(makeLigatureLabel(b, 10, 12, styles.secondarySymbol));
    }
    if (isLigature(c)) {
      children.push(makeLigatureLabel(c, 25, 27, styles.secondarySymbol));
    }
    if (isLigature(d)) {
      children.push(makeLigatureLabel(d, 25, 12, styles.secondarySymbol));
    }
  }
  const zoneClassName = zoneClassNameOf(shape);
  function KeyComponent({
    depressed,
    toggled,
    showColors,
    ...props
  }: KeyProps): ReactNode {
    return (
      <svg
        {...props}
        className={clsx(
          styles.key,
          depressed && styles.depressedKey,
          toggled && styles.toggledKey,
          showColors && zoneClassName,
        )}
        x={x}
        y={y}
        width={w}
        height={h}
        data-key={id}
      >
        {...children}
      </svg>
    );
  }
  KeyComponent.displayName = `Key[${id}]`;
  return memo(KeyComponent);

  function makeCodePointLabel(
    codePoint: CodePoint,
    x: number,
    y: number,
    className: ClassName,
  ): ReactNode {
    switch (codePoint) {
      case /* SPACE */ 0x0020:
      case /* NO-BREAK SPACE */ 0x00a0:
      case /* NARROW NO-BREAK SPACE */ 0x202f:
        return null;
    }
    return makeLabel(
      {
        text: letterName(codePoint),
        pos: [x, y],
        align: ["m", "m"],
      },
      className,
    );
  }

  function makeZhLabels(
    labels: readonly string[],
    letter: string,
    w: number,
    h: number,
  ): ReactNode[] {
    // 原来的字母照旧，别抢它的位置
    const nodes: ReactNode[] = [
      makeLabel(
        {
          text: letter,
          pos: [10, 12],
          align: ["m", "m"],
        },
        styles.primarySymbol,
      ),
    ];
    // 一个键可能承担多个音（V = zh/ui/ü、R = uan/üan、L = iang/uang）。
    // 横着连写会顶到键帽边缘，所以一个音一行竖排——
    // 竖排只受高度约束，宽度永远够，还能保留比原来更大的字号。
    const n = labels.length;
    const step = n <= 1 ? 0 : n === 2 ? 10 : 8;
    const bottom = h - 7;
    const top = bottom - step * (n - 1);
    labels.forEach((label, i) => {
      nodes.push(
        makeLabel(
          {
            text: label,
            pos: [w / 2, top + step * i],
            align: ["m", "m"],
          },
          n === 1
            ? styles.zhSymbol
            : n === 2
              ? styles.zhSymbolSmall
              : styles.zhSymbolTiny,
        ),
      );
    });
    return nodes;
  }

  function makeDeadLabel(
    { dead }: DeadCharacter,
    x: number,
    y: number,
    className: ClassName,
  ): ReactNode {
    return makeLabel(
      {
        text: isDiacritic(dead)
          ? String.fromCodePoint(/* DOTTED CIRCLE */ 0x25cc, dead)
          : String.fromCodePoint(dead),
        pos: [x, y],
        align: ["m", "m"],
      },
      clsx(className, styles.deadSymbol),
    );
  }

  function makeLigatureLabel(
    { ligature }: LigatureCharacter,
    x: number,
    y: number,
    className: ClassName,
  ): ReactNode {
    return makeLabel(
      {
        text: ligature,
        pos: [x, y],
        align: ["m", "m"],
      },
      clsx(className, styles.ligatureSymbol),
    );
  }
}

function makeLabel(label: LabelShape, className: ClassName = null): ReactNode {
  const { text, pos = [10, 20], align = ["s", "m"] } = label;
  const [x, y] = pos;
  const [ha, va] = align;
  let textAnchor: "start" | "middle" | "end";
  switch (ha) {
    case "s":
      textAnchor = "start";
      break;
    case "m":
      textAnchor = "middle";
      break;
    case "e":
      textAnchor = "end";
      break;
  }
  let dominantBaseline: "text-after-edge" | "middle" | "text-before-edge";
  switch (va) {
    case "b":
      dominantBaseline = "text-after-edge";
      break;
    case "m":
      dominantBaseline = "middle";
      break;
    case "t":
      dominantBaseline = "text-before-edge";
      break;
  }
  return (
    <text
      className={clsx(styles.symbol, className)}
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline={dominantBaseline}
      direction="ltr"
    >
      {text}
    </text>
  );
}

function zoneClassNameOf(shape: KeyShape): string | null {
  return clsx(handClassNameOf(shape), fingerClassNameOf(shape));
}

function handClassNameOf({ hand }: KeyShape): string | null {
  switch (hand) {
    case "left":
      return styles.handLeft;
    case "right":
      return styles.handRight;
  }
  return null;
}

function fingerClassNameOf({ finger }: KeyShape): string | null {
  switch (finger) {
    case "pinky":
      return styles.fingerPinky;
    case "ring":
      return styles.fingerRing;
    case "middle":
      return styles.fingerMiddle;
    case "leftIndex":
      return styles.fingerLeftIndex;
    case "rightIndex":
      return styles.fingerRightIndex;
    case "thumb":
      return styles.fingerThumb;
    default:
      return null;
  }
}
