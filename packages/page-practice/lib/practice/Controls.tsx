import { Dir } from "@keybr/intl";
import {
  isZhLanguage,
  KeyboardOptions,
  resolveZhScheme,
  switchPracticeLanguage,
  useFormattedNames,
} from "@keybr/keyboard";
import { names } from "@keybr/lesson-ui";
import { useSettings } from "@keybr/settings";
import { Button, Icon, IconButton, useView } from "@keybr/widget";
import {
  mdiAspectRatio,
  mdiCog,
  mdiHelpCircleOutline,
  mdiRedo,
  mdiUndo,
} from "@mdi/js";
import { clsx } from "clsx";
import { memo, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { views } from "../views.tsx";
import * as styles from "./Controls.module.less";

export const Controls = memo(function Controls({
  onChangeView,
  onResetLesson,
  onSkipLesson,
  onHelp,
}: {
  readonly onChangeView: () => void;
  readonly onResetLesson: () => void;
  readonly onSkipLesson: () => void;
  readonly onHelp: () => void;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const { setView } = useView(views);
  const { formatZhSchemeName } = useFormattedNames();
  const isZh = isZhLanguage(KeyboardOptions.from(settings).language);
  const zhScheme = resolveZhScheme(settings);
  const zhSchemeName = formatZhSchemeName(zhScheme);

  return (
    <div id={names.controls} className={styles.controls}>
      <div className={styles.langToggle} role="group">
        <button
          type="button"
          className={clsx(
            styles.langButton,
            isZh && styles.langButtonActive,
          )}
          aria-pressed={isZh}
          title={formatMessage(
            {
              id: "practice.controls.lang.switchToZh",
              defaultMessage: "Switch to Chinese ({scheme})",
            },
            { scheme: zhSchemeName },
          )}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (!isZh) {
              updateSettings(switchPracticeLanguage(settings, "zh"));
            }
          }}
        >
          {formatMessage({
            id: "practice.controls.lang.zh",
            defaultMessage: "ZH",
          })}
        </button>
        <button
          type="button"
          className={clsx(
            styles.langButton,
            !isZh && styles.langButtonActive,
          )}
          aria-pressed={!isZh}
          title={formatMessage({
            id: "practice.controls.lang.switchToEn",
            defaultMessage: "Switch to English",
          })}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (isZh) {
              updateSettings(switchPracticeLanguage(settings, "en"));
            }
          }}
        >
          {formatMessage({
            id: "practice.controls.lang.en",
            defaultMessage: "EN",
          })}
        </button>
      </div>
      <IconButton
        icon={<Icon shape={mdiHelpCircleOutline} />}
        title={formatMessage({
          id: "practice.widget.showTour.description",
          defaultMessage: "Show a guided tour with help slides.",
        })}
        onClick={onHelp}
      />
      <Dir swap="icon">
        <IconButton
          icon={<Icon shape={mdiUndo} />}
          title={formatMessage({
            id: "practice.widget.resetLesson.description",
            defaultMessage: "Reset current practice (Ctrl + Left Arrow).",
          })}
          onClick={onResetLesson}
        />
        <IconButton
          icon={<Icon shape={mdiRedo} />}
          title={formatMessage({
            id: "practice.widget.skipLesson.description",
            defaultMessage: "Skip to new words (Ctrl + Right Arrow).",
          })}
          onClick={onSkipLesson}
        />
      </Dir>
      <IconButton
        icon={<Icon shape={mdiAspectRatio} />}
        title={formatMessage({
          id: "practice.widget.switchView.description",
          defaultMessage: "Switch the current interface layout.",
        })}
        onClick={onChangeView}
      />
      {settings.isNew ? (
        <Button
          icon={<Icon shape={mdiCog} />}
          label={formatMessage({
            id: "t_Settings",
            defaultMessage: "Settings",
          })}
          title={formatMessage({
            id: "practice.widget.settings.description",
            defaultMessage:
              "Change practice settings, configure language, keyboard layout, etc.",
          })}
          onClick={() => {
            setView("settings");
          }}
        />
      ) : (
        <IconButton
          icon={<Icon shape={mdiCog} />}
          title={formatMessage({
            id: "practice.widget.settings.description",
            defaultMessage:
              "Change practice settings, configure language, keyboard layout, etc.",
          })}
          onClick={() => {
            setView("settings");
          }}
        />
      )}
    </div>
  );
});
