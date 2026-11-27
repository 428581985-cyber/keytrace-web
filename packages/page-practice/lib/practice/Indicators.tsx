import { Tasks } from "@keybr/lang";
import { GuidedLesson, type LessonKey, lessonProps } from "@keybr/lesson";
import {
  CurrentKeyRow,
  DailyGoalRow,
  GaugeRow,
  KeySetRow,
  names,
  StreakListRow,
} from "@keybr/lesson-ui";
import { PageDataContext, Pages } from "@keybr/pages-shared";
import { useSettings } from "@keybr/settings";
import { Popup, Portal, type ZoomableProps } from "@keybr/widget";
import { memo, type ReactNode, useContext, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import * as styles from "./Indicators.module.less";
import { KeyExtendedDetails } from "./KeyExtendedDetails.tsx";
import { type LessonState } from "./state/index.ts";

export const Indicators = memo(function Indicators({
  state: {
    lesson,
    keyStatsMap,
    summaryStats,
    lessonKeys,
    streakList,
    dailyGoal,
  },
  moving = false,
}: {
  readonly state: LessonState;
} & ZoomableProps): ReactNode {
  const { settings } = useSettings();
  const pageData = useContext(PageDataContext);
  const keytraceAvailable = Boolean(pageData?.keytraceAvailable);
  const keytraceMode = settings.get(lessonProps.keytraceMode);
  const showKeytracePill = keytraceAvailable && keytraceMode !== "standalone";
  const isKeytraceMode = lesson instanceof GuidedLesson && lesson.unlockAllKeys;

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
      <CurrentKeyRow
        lessonKeys={lessonKeys}
        names={names}
        allUnlockedMode={isKeytraceMode}
      />
      <StreakListRow streakList={streakList} names={names} />
      {dailyGoal.goal > 0 && (
        <DailyGoalRow dailyGoal={dailyGoal} names={names} />
      )}
      {showKeytracePill && <KeyTracePracticePill />}
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
                allUnlockedMode={isKeytraceMode}
              />
            </Popup>
          </Portal>
        )}
    </div>
  );
});

type KeyTraceInfo = {
  readonly active: boolean;
  readonly todayKeys: number;
  readonly lastEventTs: number | null;
};

let cachedKeyTraceInfo: KeyTraceInfo | null = null;

export function resetKeyTraceInfoCache(): void {
  cachedKeyTraceInfo = null;
}

function KeyTracePracticePill(): ReactNode {
  const { locale } = useIntl();
  const isZh = locale.startsWith("zh");
  const [info, setInfo] = useState<KeyTraceInfo | null>(cachedKeyTraceInfo);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/_/keytrace/summary?days=1", {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const json = (await res.json()) as {
          readonly status?: {
            readonly available?: boolean;
            readonly active?: boolean;
            readonly lastEventTs?: number | null;
          };
          readonly today?: { readonly totalKeys?: number };
        };
        if (alive) {
          if (json.status?.available === false) {
            cachedKeyTraceInfo = null;
            setInfo(null);
            return;
          }
          const nextInfo: KeyTraceInfo = {
            active: Boolean(json.status?.active),
            todayKeys: json.today?.totalKeys ?? 0,
            lastEventTs: json.status?.lastEventTs ?? null,
          };
          cachedKeyTraceInfo = nextInfo;
          setInfo(nextInfo);
        }
      } catch {
        // Ignore in offline/test environments.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (info == null) {
    return <div className={styles.keytracePill} aria-hidden={true} />;
  }

  const href = Pages.intlPath(Pages.keytrace.path, locale);
  const timeStr =
    info.lastEventTs != null
      ? `${String(new Date(info.lastEventTs).getHours()).padStart(2, "0")}:${String(
          new Date(info.lastEventTs).getMinutes(),
        ).padStart(2, "0")}`
      : null;

  return (
    <div className={styles.keytracePill}>
      <span
        style={{
          display: "inline-block",
          inlineSize: "6px",
          blockSize: "6px",
          borderRadius: "999px",
          backgroundColor: info.active
            ? "var(--LessonKey--hit__color, #7fae8f)"
            : "var(--Name-color, #888)",
        }}
      />
      <span>
        {isZh
          ? info.active
            ? `日常监控录制中 · 今日已录 ${info.todayKeys.toLocaleString()} 键${timeStr ? ` (${timeStr})` : ""}`
            : `日常监控 · 今日 ${info.todayKeys.toLocaleString()} 键`
          : info.active
            ? `KeyTrace active · ${info.todayKeys.toLocaleString()} keys today${timeStr ? ` (${timeStr})` : ""}`
            : `KeyTrace · ${info.todayKeys.toLocaleString()} keys today`}
      </span>
      <a
        href={href}
        style={{
          color: "var(--Value-color)",
          textDecoration: "underline",
        }}
      >
        {isZh ? "查看监控面板 →" : "Monitor →"}
      </a>
    </div>
  );
}
