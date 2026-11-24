import { isZhShuangpinLayout, type Layout } from "./layout.ts";
import {
  getShuangpinScheme,
  getZhKeyLabelsForScheme,
} from "./zhPinyinSchemes.ts";

// 小鹤双拼键帽标注（保留历史导出以向后兼容）
export const ZH_KEY_LABELS: Readonly<Record<string, readonly string[]>> =
  getZhKeyLabelsForScheme("zh-sp");

export function getZhKeyLabelsForLayout(
  layout: Layout,
): Readonly<Record<string, readonly string[]>> | null {
  if (!isZhShuangpinLayout(layout)) {
    return null;
  }
  const scheme = getShuangpinScheme(layout.id);
  return getZhKeyLabelsForScheme(scheme?.id ?? "zh-sp");
}
