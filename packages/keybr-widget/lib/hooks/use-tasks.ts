import { Tasks } from "@keybr/lang";
import { useEffect, useState } from "react";

export const useTasks = () => {
  const [tasks] = useState(() => new Tasks());
  useEffect(() => {
    return () => {
      tasks.cancelAll();
    };
  }, [tasks]);
  return tasks;
};
