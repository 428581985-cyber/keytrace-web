import { useIntlNumbers } from "@keybr/intl";
import {
  getZhKeyLabelsForLayout,
  isZhLanguage,
  layoutUsesSemicolon,
  useKeyboard,
} from "@keybr/keyboard";
import { lessonProps, Target } from "@keybr/lesson";
import { useFormatter } from "@keybr/lesson-ui";
import {
  computeKeyMastery,
  type KeyStatsMap,
  summarizeKeySamples,
  timeToSpeed,
} from "@keybr/result";
import { useSettings } from "@keybr/settings";
import { Explainer, Figure, Para } from "@keybr/widget";
import { type CSSProperties, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

// 键位掌握度：把 26 个字母键按真实键盘排布画出来，每个键显示
//   - 键名（以及双拼模式下这个键承担的音，比如 C = ao）
//   - 掌握度条：长度和颜色都对应 confidence（目标速度 / 实际耗时）
//
// confidence 直接复用 keybr 的 Target.confidence，即 目标耗时 / 实际耗时：
//   >= 1  已经达到目标速度，不再需要专门练
//   < 1   离目标还差多少，越低越弱
// 具体取 bestTimeToType 还是 timeToType，跟随 lesson.guided.recoverKeys 设置，
// 与练习页选键的判定保持同一口径——否则两处会给出互相矛盾的「掌握」结论。

const BASE_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;
const SEMICOLON_ROWS = ["qwertyuiop", "asdfghjkl;", "zxcvbnm"] as const;

const COLORS = {
  none: "#3a3a37",
  weak: "#d4503a",
  mid: "#c98a3a",
  good: "#c4a23b",
  done: "#7fae8f",
  text: "#8a857c",
  textStrong: "#e8e6e3",
};

function colorOf(confidence: number | null): string {
  if (confidence == null) {
    return COLORS.none;
  }
  if (confidence >= 1) {
    return COLORS.done;
  }
  if (confidence >= 0.85) {
    return COLORS.good;
  }
  if (confidence >= 0.6) {
    return COLORS.mid;
  }
  return COLORS.weak;
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    alignItems: "center",
  },
  row: {
    display: "flex",
    gap: "6px",
  },
  key: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "flex-end",
    width: "58px",
    height: "58px",
    border: "1px solid #3a3a37",
    borderRadius: "6px",
    padding: "4px 3px",
    background: "#2a2a28",
    userSelect: "none" as const,
  },
  letter: {
    fontSize: "16px",
    lineHeight: 1.1,
    color: COLORS.textStrong,
    fontFamily: "ui-monospace, Consolas, monospace",
  },
  sound: {
    fontSize: "9px",
    lineHeight: 1.1,
    color: COLORS.text,
    fontFamily: "ui-monospace, Consolas, monospace",
  },
  barTrack: {
    width: "100%",
    height: "3px",
    marginTop: "4px",
    borderRadius: "2px",
    background: "#3a3a37",
    overflow: "hidden" as const,
  },
  barFill: {
    height: "100%",
    borderRadius: "2px",
  },
  legend: {
    display: "flex",
    gap: "14px",
    fontSize: "11px",
    color: COLORS.text,
    marginTop: "4px",
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
  },
  swatch: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "2px",
    marginRight: "4px",
    verticalAlign: "-1px",
  },
};

export function MasterySection({
  keyStatsMap,
}: {
  readonly keyStatsMap: KeyStatsMap;
}): ReactNode {
  const { settings } = useSettings();
  const { formatSpeed } = useFormatter();
  const { formatInteger, formatPercents } = useIntlNumbers();
  const target = new Target(settings);
  const keyboard = useKeyboard();
  const zhKeyLabels = getZhKeyLabelsForLayout(keyboard.layout);
  const rows = layoutUsesSemicolon(keyboard.layout)
    ? SEMICOLON_ROWS
    : BASE_ROWS;
  // 与 GuidedLesson 保持同一判定口径：
  // 中文布局或开启 recoverKeys 时看实时平滑速度（timeToType），
  // 英文默认关闭 recoverKeys 时看 bestTimeToType，同时计入准确率与样本量门槛。
  const isZh = isZhLanguage(keyboard.layout.language);
  const recoverKeys = settings.get(lessonProps.guided.recoverKeys);
  const useRealTime = isZh || recoverKeys;

  return (
    <Figure>
      <Figure.Caption>
        <FormattedMessage
          id="profile.mastery.caption"
          defaultMessage="Key Mastery"
        />
      </Figure.Caption>

      <div style={styles.root}>
        {rows.map((row) => (
          <div key={row} style={styles.row}>
            {[...row].map((ch) => {
              const letter = keyStatsMap.letters.find(
                (l) => String.fromCodePoint(l.codePoint) === ch,
              );
              if (letter == null) {
                return null;
              }
              const stats = keyStatsMap.get(letter);
              const confidence = computeKeyMastery(stats, target.targetSpeed, {
                useRealTime,
              });
              const rawTime = useRealTime
                ? stats.timeToType
                : stats.bestTimeToType;
              const { totalHits, accuracy } = summarizeKeySamples(stats);
              const title =
                rawTime != null && rawTime > 0
                  ? `${ch.toUpperCase()} · ${formatSpeed(timeToSpeed(rawTime))} · ${formatPercents(accuracy)}${totalHits > 0 ? ` (${formatInteger(totalHits)})` : ""}`
                  : ch.toUpperCase();
              const keyId =
                ch === ";" ? "Semicolon" : `Key${ch.toUpperCase()}`;
              const sound = zhKeyLabels?.[keyId]?.join("/");
              return (
                <div key={ch} style={styles.key} title={title}>
                  <div style={styles.letter}>{ch.toUpperCase()}</div>
                  {sound != null && <div style={styles.sound}>{sound}</div>}
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        background: colorOf(confidence),
                        width: `${Math.round(
                          Math.max(0, Math.min(1, confidence ?? 0)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div style={styles.legend}>
          <span>
            <i style={{ ...styles.swatch, background: COLORS.weak }} />
            <FormattedMessage
              id="profile.mastery.legend.weak"
              defaultMessage="Below target (<60%)"
            />
          </span>
          <span>
            <i style={{ ...styles.swatch, background: COLORS.mid }} />
            60–85%
          </span>
          <span>
            <i style={{ ...styles.swatch, background: COLORS.good }} />
            85–100%
          </span>
          <span>
            <i style={{ ...styles.swatch, background: COLORS.done }} />
            <FormattedMessage
              id="profile.mastery.legend.done"
              defaultMessage="Target reached"
            />
          </span>
          <span>
            <i style={{ ...styles.swatch, background: COLORS.none }} />
            <FormattedMessage
              id="profile.mastery.legend.none"
              defaultMessage="No data"
            />
          </span>
        </div>
      </div>

      <Explainer>
        <Para>
          <FormattedMessage
            id="profile.mastery.description"
            defaultMessage="Each bar is the ratio of your target speed to your actual typing speed for that key. A full bar means the key already meets the target. Keys with no bar have never been typed."
          />
        </Para>
      </Explainer>
    </Figure>
  );
}

// 让外层能复用它算出来的颜色规则（导出给测试/其他板块用）
export const masteryColorOf = colorOf;
export const masteryBarStyle = styles.barFill as CSSProperties;
