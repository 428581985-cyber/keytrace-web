import { KeySpeedChart, Marker } from "@keybr/chart";
import { LessonKey } from "@keybr/lesson";
import { KeyDetails, KeySelector, useTarget } from "@keybr/lesson-ui";
import { type KeyStatsMap } from "@keybr/result";
import { Explainer, Figure, Para } from "@keybr/widget";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { ChartWrapper } from "./ChartWrapper.tsx";
import { SmoothnessRange } from "./SmoothnessRange.tsx";

export function KeySpeedChartSection({
  keyStatsMap,
  summaryKeyStatsMap,
}: {
  keyStatsMap: KeyStatsMap;
  summaryKeyStatsMap?: KeyStatsMap;
}) {
  const { letters } = keyStatsMap;
  const summaryMap = summaryKeyStatsMap ?? keyStatsMap;
  const [current, setCurrent] = useState(letters[0]);
  const [smoothness, setSmoothness] = useState(0.5);
  const target = useTarget();

  if (!letters.includes(current)) {
    setCurrent(letters[0]);
    return null;
  }

  const keyStats = keyStatsMap.get(current);
  const summaryKeyStats = summaryMap.get(current);
  const { samples } = keyStats;

  return (
    <Figure>
      <Figure.Caption>
        <FormattedMessage
          id="profile.chart.keySpeed.caption"
          defaultMessage="Key Typing Speed"
        />
      </Figure.Caption>

      <Explainer>
        <Figure.Description>
          <FormattedMessage
            id="profile.chart.keySpeed.description"
            defaultMessage="This chart shows the typing speed change for each individual key."
          />
        </Figure.Description>
      </Explainer>

      <Para align="center">
        <KeySelector
          keyStatsMap={summaryMap}
          current={current}
          onSelect={(current) => {
            setCurrent(current);
          }}
        />
      </Para>

      <Para align="center">
        <KeyDetails lessonKey={LessonKey.from(summaryKeyStats, target)} />
      </Para>

      <ChartWrapper>
        <KeySpeedChart
          samples={samples}
          smoothness={smoothness}
          width="100%"
          height="25rem"
        />
      </ChartWrapper>

      <SmoothnessRange
        disabled={samples.length < 2}
        value={smoothness}
        onChange={setSmoothness}
      />

      <Figure.Legend>
        <FormattedMessage
          id="profile.chart.keySpeed.legend"
          defaultMessage="Horizontal axis: date or typing sequence. Vertical axis: {label1} – typing speed for the currently selected key, {label2} – target typing speed."
          values={{
            label1: <Marker type="speed" />,
            label2: <Marker type="threshold" />,
          }}
        />
      </Figure.Legend>
    </Figure>
  );
}
