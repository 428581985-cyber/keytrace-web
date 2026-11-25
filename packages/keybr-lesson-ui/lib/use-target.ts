import { useOptionalKeyboard } from "@keybr/keyboard";
import { Target } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import { useMemo } from "react";

export function useTarget(): Target {
  const { settings } = useSettings();
  const keyboard = useOptionalKeyboard();
  return useMemo(
    () => new Target(settings, keyboard?.layout),
    [settings, keyboard?.layout],
  );
}
