import { useIntlNumbers } from "@keybr/intl";
import { useFormatter } from "@keybr/lesson-ui";
import { type SummaryStats } from "@keybr/result";
import { formatDuration, Header, Para } from "@keybr/widget";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "./Summary.module.less";

export function AllTimeSummary({
  stats: { time, speed, accuracy },
  activeDays = 0,
  characters = 0,
}: {
  stats: SummaryStats;
  activeDays?: number;
  characters?: number;
}) {
  const { formatMessage } = useIntl();
  const { formatNumber, formatPercents } = useIntlNumbers();
  const { formatSpeed } = useFormatter();

  return (
    <>
      <Header level={2}>
        <FormattedMessage
          id="t_All_Time_Statistics"
          defaultMessage="All Time Statistics"
        />
      </Header>

      <Para className={styles.statisticList}>
        <Statistic
          name={formatMessage({
            id: "t_Time",
            defaultMessage: "Time",
          })}
          value={formatDuration(time)}
        />

        <Statistic
          name={formatMessage({
            id: "t_Active_days",
            defaultMessage: "Active days",
          })}
          value={formatNumber(activeDays)}
        />

        <Statistic
          name={formatMessage({
            id: "t_num_Characters",
            defaultMessage: "Characters",
          })}
          value={formatNumber(characters)}
        />

        <Statistic
          name={formatMessage({
            id: "t_Top_speed",
            defaultMessage: "Top speed",
          })}
          value={speed.max > 0 ? formatSpeed(speed.max) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Average_speed",
            defaultMessage: "Average speed",
          })}
          value={speed.avg > 0 ? formatSpeed(speed.avg) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Top_accuracy",
            defaultMessage: "Top accuracy",
          })}
          value={accuracy.max > 0 ? formatPercents(accuracy.max) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Average_accuracy",
            defaultMessage: "Average accuracy",
          })}
          value={accuracy.avg > 0 ? formatPercents(accuracy.avg) : "N/A"}
        />
      </Para>
    </>
  );
}

export function TodaySummary({
  stats: { time, speed, accuracy },
  characters = 0,
}: {
  stats: SummaryStats;
  characters?: number;
}) {
  const { formatMessage } = useIntl();
  const { formatNumber, formatPercents } = useIntlNumbers();
  const { formatSpeed } = useFormatter();

  return (
    <>
      <Header level={2}>
        <FormattedMessage
          id="t_Statistics_for_Today"
          defaultMessage="Statistics for Today"
        />
      </Header>

      <Para className={styles.statisticList}>
        <Statistic
          name={formatMessage({
            id: "t_Time",
            defaultMessage: "Time",
          })}
          value={formatDuration(time)}
        />

        <Statistic
          name={formatMessage({
            id: "t_num_Characters",
            defaultMessage: "Characters",
          })}
          value={formatNumber(characters)}
        />

        <Statistic
          name={formatMessage({
            id: "t_Top_speed",
            defaultMessage: "Top speed",
          })}
          value={speed.max > 0 ? formatSpeed(speed.max) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Average_speed",
            defaultMessage: "Average speed",
          })}
          value={speed.avg > 0 ? formatSpeed(speed.avg) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Top_accuracy",
            defaultMessage: "Top accuracy",
          })}
          value={accuracy.max > 0 ? formatPercents(accuracy.max) : "N/A"}
        />

        <Statistic
          name={formatMessage({
            id: "t_Average_accuracy",
            defaultMessage: "Average accuracy",
          })}
          value={accuracy.avg > 0 ? formatPercents(accuracy.avg) : "N/A"}
        />
      </Para>
    </>
  );
}

function Statistic({ name, value }: { name: unknown; value: unknown }) {
  return (
    <span className={styles.statisticListItem}>
      <span className={styles.itemName}>{String(name) + ":"}</span>
      <span className={styles.itemValue}>{String(value)}</span>
    </span>
  );
}
