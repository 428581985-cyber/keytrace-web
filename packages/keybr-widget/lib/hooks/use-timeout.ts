import { type Task } from "@keybr/lang";
import { useState } from "react";
import { useTasks } from "./use-tasks.ts";

export type TimeoutScheduler = {
  get pending(): boolean;
  cancel(): void;
  schedule(callback: () => void, timeout: number): void;
};

export const useTimeout = () => {
  const tasks = useTasks();
  const [scheduler] = useState<TimeoutScheduler>(
    () =>
      new (class implements TimeoutScheduler {
        #task: Task | null = null;

        get pending() {
          return this.#task != null;
        }

        cancel() {
          if (this.#task != null) {
            this.#task.cancel();
            this.#task = null;
          }
        }

        schedule(callback: () => void, timeout: number) {
          this.cancel();
          this.#task = tasks.delayed(timeout, callback);
        }
      })(),
  );
  return scheduler;
};
