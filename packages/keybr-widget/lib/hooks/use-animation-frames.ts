import { useEffect, useState } from "react";
import { AnimationFrames } from "../utils/index.ts";

export const useAnimationFrames = () => {
  const [frames] = useState(() => new AnimationFrames());
  useEffect(() => {
    return () => {
      frames.cancel();
    };
  }, [frames]);
  return frames;
};
