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
}: {
  readonly settings?: TextDisplaySettings;
  readonly lines: LineList;
  readonly wrap?: boolean;
  readonly size?: TextLineSize;
  readonly cursor?: boolean;
  readonly focus?: boolean;
  readonly zh?: boolean;
}): ReactNode {
  const isZh = zh ?? settings?.language?.id === "zh-sp";
  if (isZh) {
    return (
      <ZhLines
        settings={settings}
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
