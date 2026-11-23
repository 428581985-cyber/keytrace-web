import { isZhLanguage, isZhQuanpin, type ZhInputScheme } from "@keybr/keyboard";
import { type LineList, type TextDisplaySettings } from "@keybr/textinput";
import { type ReactNode } from "react";
import { TextLines, type TextLineSize } from "./TextLines.tsx";
import { ZhLines } from "./ZhLines.tsx";

export function StaticText({
  settings,
  lines,
  wrap,
  size,
  cursor = false,
  focus = true,
  zh,
  scheme,
}: {
  readonly settings?: TextDisplaySettings;
  readonly lines: LineList;
  readonly wrap?: boolean;
  readonly size?: TextLineSize;
  readonly cursor?: boolean;
  readonly focus?: boolean;
  readonly zh?: boolean;
  readonly scheme?: ZhInputScheme;
}): ReactNode {
  const isZh =
    zh ?? (settings?.language != null && isZhLanguage(settings.language));
  if (isZh) {
    const resolvedScheme: ZhInputScheme | undefined =
      scheme ??
      (settings?.language != null
        ? isZhQuanpin(settings.language)
          ? "zh-qp"
          : "zh-sp"
        : undefined);
    return (
      <ZhLines
        settings={settings}
        scheme={resolvedScheme}
        lines={lines}
        focus={focus}
        cursor={cursor}
        showToggle={false}
      />
    );
  }
  return (
    <TextLines
      settings={settings}
      lines={lines}
      wrap={wrap}
      size={size}
      cursor={cursor}
      focus={focus}
    />
  );
}
