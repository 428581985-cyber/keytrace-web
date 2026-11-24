import { useTheme } from "@keybr/themes";
import { Icon, IconButton } from "@keybr/widget";
import {
  mdiArrowCollapseAll,
  mdiArrowExpandAll,
  mdiThemeLightDark,
} from "@mdi/js";
import { useSyncExternalStore } from "react";
import { defineMessage, useIntl } from "react-intl";
import * as styles from "./ThemeSwitcher.module.less";

const darkColorSchemeQuery = "(prefers-color-scheme: dark)";

function subscribePrefersDark(listener: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const media = window.matchMedia(darkColorSchemeQuery);
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
  };
}

function getPrefersDarkSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(darkColorSchemeQuery).matches
    : false;
}

function getPrefersDarkServerSnapshot(): boolean {
  return false;
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getPrefersDarkServerSnapshot,
  );
}

export function ThemeSwitcher() {
  const { formatMessage } = useIntl();
  const { color, switchColor } = useTheme();
  const prefersDark = usePrefersDark();
  const isDark =
    color === "dark" ||
    color === "chocolate" ||
    (color === "system" && prefersDark);
  return (
    <div className={styles.root}>
      <IconButton
        icon={<Icon shape={mdiThemeLightDark} />}
        title={formatMessage(
          isDark
            ? defineMessage({
                id: "t_theme_Switch_to_light_",
                defaultMessage: "Switch to light theme.",
              })
            : defineMessage({
                id: "t_theme_Switch_to_dark_",
                defaultMessage: "Switch to dark theme.",
              }),
        )}
        onClick={() => {
          switchColor(isDark ? "light" : "dark");
        }}
      />
      <FullscreenButton />
    </div>
  );
}

function FullscreenButton() {
  const { formatMessage } = useIntl();
  const theme = useTheme();
  switch (theme.fullscreenState) {
    case true:
      return (
        <IconButton
          icon={<Icon shape={mdiArrowCollapseAll} />}
          title={formatMessage(
            defineMessage({
              id: "t_theme_Exit_fullscreen_",
              defaultMessage: "Exit full-screen mode.",
            }),
          )}
          onClick={() => {
            theme.toggleFullscreen();
          }}
        />
      );
    case false:
      return (
        <IconButton
          icon={<Icon shape={mdiArrowExpandAll} />}
          title={formatMessage(
            defineMessage({
              id: "t_theme_Enter_fullscreen_",
              defaultMessage: "Enter full-screen mode.",
            }),
          )}
          onClick={() => {
            theme.toggleFullscreen();
          }}
        />
      );
    default:
      return <IconButton icon={<Icon shape={mdiArrowExpandAll} />} />;
  }
}
