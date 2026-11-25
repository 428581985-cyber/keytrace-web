import {
  Attr,
  type Char,
  type TextDisplaySettings,
  WhitespaceStyle,
} from "@keybr/textinput";
import { type CodePoint } from "@keybr/unicode";
import { type ReactNode } from "react";
import * as styles from "./chars.module.less";
import { getTextStyle } from "./styles.ts";

const maxErrorBadge = 10;

type CharSpan = {
  chars: CodePoint[];
  attrs: number;
  cls: string | null;
  errorCount: number;
};

export function renderChars(
  settings: TextDisplaySettings,
  chars: readonly Char[],
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let span: CharSpan = { chars: [], attrs: 0, cls: null, errorCount: 0 };
  const pushSpan = (nextSpan: CharSpan) => {
    if (span.chars.length > 0) {
      nodes.push(
        renderCharSpan(
          nodes.length,
          span,
          /* special= */ false,
          String.fromCodePoint(...span.chars),
        ),
      );
    }
    span = nextSpan;
  };
  for (let i = 0; i < chars.length; i++) {
    const { codePoint, attrs, cls = null, errorCount = 0 } = chars[i];
    if (codePoint > 0x0020) {
      if (
        span.attrs !== attrs ||
        span.cls !== cls ||
        span.errorCount !== errorCount ||
        attrs === Attr.Cursor
      ) {
        pushSpan({ chars: [], attrs, cls, errorCount });
      }
      span.chars.push(codePoint);
    } else {
      pushSpan({ chars: [], attrs, cls, errorCount });
      nodes.push(
        renderCharSpan(
          nodes.length,
          span,
          /* special= */ true,
          specialChar(settings.whitespaceStyle, codePoint),
        ),
      );
    }
  }
  pushSpan({ chars: [], attrs: 0, cls: null, errorCount: 0 });
  return nodes;
}

function renderCharSpan(
  key: number,
  span: CharSpan,
  special: boolean,
  text: string,
): ReactNode {
  const className = getClassName(span);
  const style = getTextStyle(span, special);
  if (span.attrs === Attr.Cursor && span.errorCount > 0) {
    const count = Math.min(maxErrorBadge, span.errorCount);
    if (count >= 2) {
      return (
        <span
          key={key}
          className={className}
          style={style}
          data-error-count={String(count)}
        >
          {text}
          <span
            className={styles.errorBadge}
            data-error-badge="1"
            aria-hidden={true}
          >
            {String(count)}
          </span>
        </span>
      );
    }
    return (
      <span
        key={key}
        className={className}
        style={style}
        data-error-count={String(count)}
      >
        {text}
      </span>
    );
  }
  return (
    <span key={key} className={className} style={style}>
      {text}
    </span>
  );
}

function specialChar(whitespaceStyle: WhitespaceStyle, codePoint: CodePoint) {
  switch (codePoint) {
    case 0x0009:
      return "\uE002";
    case 0x000a:
      return "\uE003";
    case 0x0020:
      switch (whitespaceStyle) {
        case WhitespaceStyle.Bar:
          return "\uE001";
        case WhitespaceStyle.Bullet:
          return "\uE000";
        default:
          return "\u00A0";
      }
    default:
      return `U+${codePoint.toString(16).padStart(4, "0")}`;
  }
}

function getClassName({ attrs }: { readonly attrs: Attr }) {
  return attrs === Attr.Cursor ? styles.cursor : undefined;
}

const cursorSelector = `.${styles.cursor}`;

export function findCursor(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(cursorSelector) ?? null;
}
