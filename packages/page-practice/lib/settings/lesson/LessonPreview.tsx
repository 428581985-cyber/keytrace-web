import {
  getZhSchemeFromLayout,
  isZhLayout,
  keyboardProps,
} from "@keybr/keyboard";
import {
  GuidedLesson,
  type Lesson,
  resolvePracticeMode,
} from "@keybr/lesson";
import { CurrentKeyRow, KeySetRow } from "@keybr/lesson-ui";
import { PageDataContext } from "@keybr/pages-shared";
import { LCG } from "@keybr/rand";
import {
  hasKeyTraceResults,
  makeKeyStatsMap,
  TextType,
  useResults,
} from "@keybr/result";
import { useSettings } from "@keybr/settings";
import {
  TextInput,
  toTextDisplaySettings,
  toTextInputSettings,
} from "@keybr/textinput";
import { StaticText } from "@keybr/textinput-ui";
import { FieldSet } from "@keybr/widget";
import { type ReactNode, useContext, useMemo } from "react";
import { useIntl } from "react-intl";
import * as styles from "./LessonPreview.module.less";

export function LessonPreview({
  lesson,
}: {
  readonly lesson: Lesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings } = useSettings();
  const { results } = useResults();
  const pageData = useContext(PageDataContext);
  const layout = settings.get(keyboardProps.layout);
  const zh = isZhLayout(layout);
  const scheme = getZhSchemeFromLayout(layout) ?? "zh-sp";
  const practiceMode = resolvePracticeMode({
    settings,
    keytraceAvailable: pageData?.keytraceAvailable,
    hasKeyTraceData: hasKeyTraceResults(results),
  });
  const isKeytraceMode =
    lesson instanceof GuidedLesson
      ? lesson.unlockAllKeys
      : practiceMode === "keytrace";
  const { lessonKeys, textInput } = useMemo(() => {
    const effectiveResults =
      practiceMode === "standalone"
        ? results.filter((result) => result.textType !== TextType.KEYTRACE)
        : results;
    const filteredResults = lesson
      .filter(effectiveResults)
      .filter((result) => result.layout.xid === layout.xid);
    const lessonKeys = lesson.update(
      makeKeyStatsMap(lesson.letters, filteredResults),
      { persistFocus: false },
    );
    const textInput = new TextInput(
      lesson.generate(lessonKeys, LCG(123)),
      toTextInputSettings(settings),
    );
    return { lessonKeys, textInput };
  }, [settings, lesson, results, layout.xid, practiceMode]);
  return (
    <FieldSet
      legend={formatMessage({
        id: "t_Lesson_preview:",
        defaultMessage: "Practice preview",
      })}
    >
      <div className={styles.root}>
        <KeySetRow lessonKeys={lessonKeys} />
        <CurrentKeyRow
          lessonKeys={lessonKeys}
          allUnlockedMode={isKeytraceMode}
        />
        <div className={styles.text}>
          <StaticText
            settings={toTextDisplaySettings(settings)}
            lines={textInput.lines}
            zh={zh}
            scheme={zh ? scheme : undefined}
          />
        </div>
      </div>
    </FieldSet>
  );
}
