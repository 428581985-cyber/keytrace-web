import { Tasks } from "@keybr/lang";
import { type LessonKey } from "@keybr/lesson";
import {
  CurrentKeyRow,
  DailyGoalRow,
  GaugeRow,
  KeySetRow,
  names,
  StreakListRow,
} from "@keybr/lesson-ui";
import { Popup, Portal, type ZoomableProps } from "@keybr/widget";
import { memo, type ReactNode, useEffect, useState } from "react";
import * as styles from "./Indicators.module.less";
import { KeyExtendedDetails } from "./KeyExtendedDetails.tsx";
import { type LessonState } from "./state/index.ts";

export const Indicators = memo(function Indicators({
  state: { keyStatsMap, summaryStats, lessonKeys, streakList, dailyGoal },
  moving = false,
}: {
  readonly state: LessonState;
} & ZoomableProps): ReactNode {
  type State = Readonly<
    | { type: "hidden" }
    | { type: "visible-in"; key: LessonKey; elem: Element }
    | { type: "visible"; key: LessonKey; elem: Element }
    | { type: "visible-out"; key: LessonKey; elem: Element }
  >;
  const [state, setState] = useState<State>({ type: "hidden" });
  useEffect(() => {
    const tasks = new Tasks();
    if (moving) {
      if (state.type !== "hidden") {
        tasks.delayed(0, () => {
          setState({ type: "hidden" });
        });
      }
      return () => {
        tasks.cancelAll();
      };
    }
    switch (state.type) {
      case "visible-in":
        tasks.delayed(300, () => {
          setState({ ...state, type: "visible" });
        });
        break;
      case "visible-out":
        tasks.delayed(300, () => {
          setState({ type: "hidden" });
        });
        break;
    }
    return () => {
      tasks.cancelAll();
    };
  }, [state, moving]);
  return (
    <div id={names.indicators} className={styles.indicators}>
      <GaugeRow summaryStats={summaryStats} names={names} />
      <KeySetRow
        lessonKeys={lessonKeys}
        names={names}
        onKeyHoverIn={(key, elem) => {
          if (!moving) {
            setState({ type: "visible-in", key, elem });
          }
        }}
        onKeyHoverOut={() => {
          switch (state.type) {
            case "visible-in":
              setState({ type: "hidden" });
              break;
            case "visible":
              setState({ ...state, type: "visible-out" });
              break;
          }
        }}
      />
      <CurrentKeyRow lessonKeys={lessonKeys} names={names} />
      <StreakListRow streakList={streakList} names={names} />
      {dailyGoal.goal > 0 && (
        <DailyGoalRow dailyGoal={dailyGoal} names={names} />
      )}
      {!moving &&
        (state.type === "visible" || state.type === "visible-out") && (
          <Portal>
            <Popup
              anchor={state.elem}
              onMouseEnter={() => {
                setState({ ...state, type: "visible" });
              }}
              onMouseLeave={() => {
                setState({ ...state, type: "visible-out" });
              }}
            >
              <KeyExtendedDetails
                lessonKey={state.key}
                keyStats={keyStatsMap.get(state.key.letter)}
              />
            </Popup>
          </Portal>
        )}
    </div>
  );
});
