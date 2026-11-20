import { Marker, SpeedChart } from "@keybr/chart";
import { type Result } from "@keybr/result";
import { Explainer, Figure } from "@keybr/widget";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { ChartWrapper } from "./ChartWrapper.tsx";
import { SmoothnessRange } from "./SmoothnessRange.tsx";

export function SpeedChartSection({
  results,
  showComplexity = true,
}: {
  results: readonly Result[];
  showComplexity?: boolean;
}) {
  const [smoothness, setSmoothness] = useState(0.5);

  return (
    <Figure>
      <Figure.Caption>
        <FormattedMessage
          id="profile.chart.speed.caption"
          defaultMessage="Typing Speed"
        />
      </Figure.Caption>

      <Explainer>
        <Figure.Description>
          <FormattedMessage
            id="profile.chart.speed.description"
            defaultMessage="This chart shows how overall typing speed changes over time."
          />
        </Figure.Description>
      </Explainer>

      <ChartWrapper>
        <SpeedChart
          results={results}
          smoothness={smoothness}
          showComplexity={showComplexity}
          width="100%"
          height="25rem"
        />
      </ChartWrapper>

      <SmoothnessRange
        disabled={results.length < 2}
        value={smoothness}
        onChange={setSmoothness}
      />

      <Figure.Legend>
        {showComplexity ? (
          <FormattedMessage
            id="profile.chart.speed.legend"
            defaultMessage="Horizontal axis: date or typing sequence. Vertical axis: {label1} – typing speed, {label2} – typing accuracy, {label3} – number of keys."
            values={{
              label1: <Marker type="speed" />,
              label2: <Marker type="accuracy" />,
              label3: <Marker type="complexity" />,
            }}
          />
        ) : (
          <FormattedMessage
            id="profile.chart.speed.legendSimple"
            defaultMessage="Horizontal axis: date or typing sequence. Vertical axis: {label1} – typing speed, {label2} – typing accuracy."
            values={{
              label1: <Marker type="speed" />,
              label2: <Marker type="accuracy" />,
            }}
          />
        )}
      </Figure.Legend>
    </Figure>
  );
}
