import { LessonKey } from "@keybr/lesson";
import { type Letter } from "@keybr/phonetic-model";
import { computeKeyMastery, type KeyStatsMap } from "@keybr/result";
import { type FocusProps, useHotkeysHandler } from "@keybr/widget";
import { Key } from "./Key.tsx";
import * as styles from "./KeySelector.module.less";
import { useTarget } from "./use-target.ts";

export const KeySelector = ({
  current,
  disabled,
  keyStatsMap,
  tabIndex,
  title,
  onSelect,
  onFocus,
  onBlur,
}: {
  current: Letter;
  keyStatsMap: KeyStatsMap;
  title?: string;
  onSelect?: (letter: Letter) => void;
} & FocusProps) => {
  const target = useTarget();
  const { letters } = keyStatsMap;
  const handlePrev = () => {
    if (onSelect != null) {
      const currentIndex = letters.findIndex(
        (letter) => letter.codePoint === current.codePoint,
      );
      let selectedIndex;
      if (currentIndex === -1 || currentIndex === 0) {
        selectedIndex = letters.length - 1;
      } else {
        selectedIndex = currentIndex - 1;
      }
      onSelect(letters[selectedIndex]);
    }
  };
  const handleNext = () => {
    if (onSelect != null) {
      const currentIndex = letters.findIndex(
        (letter) => letter.codePoint === current.codePoint,
      );
      let selectedIndex;
      if (currentIndex === -1 || currentIndex === letters.length - 1) {
        selectedIndex = 0;
      } else {
        selectedIndex = currentIndex + 1;
      }
      onSelect(letters[selectedIndex]);
    }
  };
  return (
    <span
      className={styles.root}
      tabIndex={disabled ? undefined : (tabIndex ?? 0)}
      title={title}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={useHotkeysHandler({
        ["ArrowLeft"]: handlePrev,
        ["ArrowUp"]: handlePrev,
        ["ArrowRight"]: handleNext,
        ["ArrowDown"]: handleNext,
      })}
    >
      {letters.map((letter) => {
        const keyStats = keyStatsMap.get(letter);
        const base = LessonKey.from(keyStats, target);
        const calibrated = new LessonKey({
          letter: base.letter,
          samples: base.samples,
          timeToType: base.timeToType,
          bestTimeToType: base.bestTimeToType,
          confidence: computeKeyMastery(keyStats, target.targetSpeed, {
            useRealTime: true,
          }),
          bestConfidence: base.bestConfidence,
        }).asIncluded();
        return (
          <Key
            key={letter.codePoint}
            lessonKey={calibrated}
            isSelectable={true}
            isCurrent={current.codePoint === letter.codePoint}
            onClick={() => {
              if (onSelect != null) {
                onSelect(letter);
              }
            }}
          />
        );
      })}
    </span>
  );
};
