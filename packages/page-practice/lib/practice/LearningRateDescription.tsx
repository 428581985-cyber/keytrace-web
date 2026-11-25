import { useIntlNumbers } from "@keybr/intl";
import { type LearningRate, type LessonKey } from "@keybr/lesson";
import { Name, Para, Value } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

export function LearningRateDescription({
  lessonKey,
  learningRate,
  allUnlockedMode = false,
}: {
  readonly lessonKey: LessonKey;
  readonly learningRate: LearningRate | null;
  readonly allUnlockedMode?: boolean;
}): ReactNode {
  const { formatNumber, formatPercents } = useIntlNumbers();
  if (allUnlockedMode) {
    if ((lessonKey.confidence ?? 0) >= 1) {
      return (
        <Para align="center">
          <Name>
            <FormattedMessage
              id="learningRate.targetReached"
              defaultMessage="This letter has reached the target speed."
            />
          </Name>
        </Para>
      );
    }
    if (
      learningRate != null &&
      learningRate.remainingLessons > 0 &&
      learningRate.certainty > 0
    ) {
      return (
        <Para align="center">
          <Name>
            <FormattedMessage
              id="learningRate.remainingSessionsToTarget"
              defaultMessage={
                "Approximately {remainingLessons} sessions remaining to " +
                "reach the target speed for this letter ({certainty} certainty)."
              }
              values={{
                remainingLessons: (
                  <Value value={formatNumber(learningRate.remainingLessons)} />
                ),
                certainty: (
                  <Value value={formatPercents(learningRate.certainty)} />
                ),
              }}
            />
          </Name>
        </Para>
      );
    }
    return (
      <Para align="center">
        <Name>
          <FormattedMessage
            id="learningRate.unknownTarget"
            defaultMessage="Need more data to compute the remaining sessions to reach the target speed for this letter."
          />
        </Name>
      </Para>
    );
  }
  if ((lessonKey.bestConfidence ?? 0) >= 1) {
    return (
      <Para align="center">
        <Name>
          <FormattedMessage
            id="learningRate.alreadyUnlocked"
            defaultMessage="This letter is already unlocked."
          />
        </Name>
      </Para>
    );
  }
  if (
    learningRate != null &&
    learningRate.remainingLessons > 0 &&
    learningRate.certainty > 0
  ) {
    return (
      <Para align="center">
        <Name>
          <FormattedMessage
            id="learningRate.remainingLessons"
            defaultMessage={
              "Approximately {remainingLessons} sessions remaining to " +
              "unlock this letter ({certainty} certainty)."
            }
            values={{
              remainingLessons: (
                <Value value={formatNumber(learningRate.remainingLessons)} />
              ),
              certainty: (
                <Value value={formatPercents(learningRate.certainty)} />
              ),
            }}
          />
        </Name>
      </Para>
    );
  }
  return (
    <Para align="center">
      <Name>
        <FormattedMessage
          id="learningRate.unknown"
          defaultMessage="Need more data to compute the remaining sessions to unlock this letter."
        />
      </Name>
    </Para>
  );
}
