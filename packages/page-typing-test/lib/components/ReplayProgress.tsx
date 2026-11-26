import { useIntlNumbers } from "@keybr/intl";
import { useFormatter } from "@keybr/lesson-ui";
import {
  AnimationFrames,
  formatDuration,
  NameValue,
  Para,
} from "@keybr/widget";
import { useEffect, useState } from "react";
import { type ReplayState } from "../session/index.ts";

export function ReplayProgress({ stepper }: { stepper: ReplayState }) {
  const { formatInteger } = useIntlNumbers();
  const { formatSpeed } = useFormatter();
  const {
    progress: { progress, length, speed },
    time,
  } = useReplayProgress(stepper);
  return (
    <Para align="center">
      <NameValue
        name="Progress"
        value={`${formatInteger(progress)}/${formatInteger(length)}`}
      />
      <NameValue
        name="Time"
        value={formatDuration(time, { showMillis: true })}
      />
      <NameValue name="Speed" value={formatSpeed(speed)} />
    </Para>
  );
}

function useReplayProgress(stepper: ReplayState) {
  const { state, progress } = stepper;
  const [record, setRecord] = useState({ progress, time: 0 });
  useEffect(() => {
    const frames = new AnimationFrames();
    frames.start(() => {
      if (state === "running" || state === "finished") {
        setRecord({ progress, time: progress.time });
      }
    });
    return () => {
      frames.cancel();
    };
  }, [state, progress]);
  const time =
    record.progress === progress &&
    (state === "running" || state === "finished")
      ? record.time
      : 0;
  return { progress, time };
}
