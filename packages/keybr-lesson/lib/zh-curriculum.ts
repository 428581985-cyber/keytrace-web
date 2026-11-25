import {
  getZhSchemeFromLayout,
  type Layout,
  type ZhSchemeId,
} from "@keybr/keyboard";
import { Letter } from "@keybr/phonetic-model";

/**
 * Lexicon-verified progressive key-unlock sequences for standalone Chinese
 * guided lessons (starting from minSize = 6).
 *
 * - Shuangpin schemes share the 3L/3R, 4-home-row Stage-1 seed `iujdgs`
 *   (86 real common words, global min focus words >= 30 across all stages).
 * - Quanpin uses the 3L/3R, 4-home-row Stage-1 seed `inagjd`
 *   (59 real common words, global min focus words >= 24 across all stages).
 */
export const ZH_CURRICULUM_ORDER: Readonly<Record<ZhSchemeId, string>> = {
  "zh-sp": "iujdgsvyhlzcbxmkfrewqtnaop",
  "zh-sp-zrm": "iujdgsvylhbkxmfretnqzwaocp",
  "zh-sp-ms": "iujdgsvhlybkfemxrnzwotq;cap",
  "zh-sp-sg": "iujdgsvhbylkfermxnzwtoq;cap",
  "zh-qp": "inagjdxuyoeblhzscqtwmfrvkp",
};

/**
 * Home-row-prioritized variants (`keyboardOrder = true`) that retain core vowel
 * anchors (`i, u` for Shuangpin; `i, n, a` for Quanpin) so Stage 1 never
 * starves for real words (7 home-row keys in top 10, global min focus >= 24).
 */
export const ZH_KEYBOARD_ORDER: Readonly<Record<ZhSchemeId, string>> = {
  "zh-sp": "iujdgslhyfvkarwbxmezqtcnop",
  "zh-sp-zrm": "iujdgshlkvfybarexmtqnwzopc",
  "zh-sp-ms": "iujdgshlkvfybaer;xmqtwzonpc",
  "zh-sp-sg": "iujdgshlkyfvbaer;xmtqwzonpc",
  "zh-qp": "inagjdluhsoyezfxbckqwtmrvp",
};

export function orderZhLetters(
  layout: Layout,
  letters: readonly Letter[],
  keyboardOrder: boolean = false,
): Letter[] {
  const scheme = getZhSchemeFromLayout(layout);
  if (scheme == null) {
    return Letter.frequencyOrder(letters);
  }
  const sequence = keyboardOrder
    ? ZH_KEYBOARD_ORDER[scheme]
    : ZH_CURRICULUM_ORDER[scheme];
  const rank = new Map<number, number>();
  for (let i = 0; i < sequence.length; i++) {
    rank.set(sequence.codePointAt(i)!, i);
  }
  return [...letters].sort((a, b) => {
    const ra = rank.get(a.codePoint);
    const rb = rank.get(b.codePoint);
    if (ra != null && rb != null) {
      return ra - rb;
    }
    if (ra != null) {
      return -1;
    }
    if (rb != null) {
      return 1;
    }
    return b.f - a.f || a.codePoint - b.codePoint;
  });
}
