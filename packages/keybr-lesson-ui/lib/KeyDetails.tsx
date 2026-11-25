import { LearningRate, type LessonKey } from "@keybr/lesson";
import { timeToSpeed } from "@keybr/result";
import { Name, NameValue, Value } from "@keybr/widget";
import { clsx } from "clsx";
import { useIntl } from "react-intl";
import { useFormatter } from "./format.ts";
import { Happiness } from "./Happiness.tsx";
import * as styles from "./styles.module.less";
import { useTarget } from "./use-target.ts";

export const KeyDetails = ({ lessonKey }: { lessonKey: LessonKey }) => {
  const { formatMessage } = useIntl();
  const { formatSpeed, formatConfidence, formatLearningRate, speedUnitName } =
    useFormatter();
  const target = useTarget();
  const { timeToType, bestTimeToType, confidence, bestConfidence } = lessonKey;
  if (
    timeToType != null &&
    bestTimeToType != null &&
    confidence != null &&
    bestConfidence != null
  ) {
    const learningRate =
      LearningRate.from(
        lessonKey.samples, //
        target,
      )?.learningRate ?? null;
    return (
      <span className={clsx(styles.keyDetails, styles.keyDetails_calibrated)}>
        <NameValue
          name={
            <Name
              name={formatMessage({
                id: "t_Last_speed",
                defaultMessage: "Last speed",
              })}
            />
          }
          value={
            <Value>
              {`${formatSpeed(timeToSpeed(timeToType))}`}
              {` (${formatConfidence(confidence)})`}
            </Value>
          }
        />
        <NameValue
          name={
            <Name
              name={formatMessage({
                id: "t_Top_speed",
                defaultMessage: "Top speed",
              })}
            />
          }
          value={
            <Value>
              {`${formatSpeed(timeToSpeed(bestTimeToType))}`}
              {` (${formatConfidence(bestConfidence)})`}
            </Value>
          }
        />
        <NameValue
          name={
            <Name
              name={formatMessage({
                id: "t_Learning_rate",
                defaultMessage: "Learning rate",
              })}
            />
          }
          value={
            <Value
              value={
                <>
                  {formatLearningRate(learningRate)}
                  {"\u00A0"}
                  <Happiness learningRate={learningRate ?? 0} />
                </>
              }
              delta={learningRate ?? 0}
            />
          }
        />
      </span>
    );
  } else {
    return (
      <span className={clsx(styles.keyDetails, styles.keyDetails_uncalibrated)}>
        {formatMessage({
          id: "t_Not_calibrated_",
          defaultMessage: "Not calibrated, need more samples.",
        })}
      </span>
    );
  }
};
