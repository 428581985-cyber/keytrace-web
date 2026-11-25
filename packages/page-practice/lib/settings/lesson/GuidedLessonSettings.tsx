import { getZhSchemeFromLayout, isZhLanguage } from "@keybr/keyboard";
import {
  type GuidedLesson,
  lessonProps,
  resolvePracticeMode,
} from "@keybr/lesson";
import { PageDataContext } from "@keybr/pages-shared";
import { hasKeyTraceResults, ResultContext } from "@keybr/result";
import { useSettings } from "@keybr/settings";
import { Description, Explainer, FieldSet } from "@keybr/widget";
import { type ReactNode, useContext } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { AlphabetSizeProp } from "./AlphabetSizeProp.tsx";
import { FuzzyPinyinProp } from "./FuzzyPinyinProp.tsx";
import { KeyboardOrderProp } from "./KeyboardOrderProp.tsx";
import { KeytraceModeProp } from "./KeytraceModeProp.tsx";
import { LessonLengthProp } from "./LessonLengthProp.tsx";
import { NaturalWordsProp } from "./NaturalWordsProp.tsx";
import { RecoverKeysProp } from "./RecoverKeysProp.tsx";
import { RepeatWordsProp } from "./RepeatWordsProp.tsx";
import { TargetSpeedProp } from "./TargetSpeedProp.tsx";
import { TextManglingProp } from "./TextManglingProp.tsx";
import { ZhProp } from "./ZhProp.tsx";

export function GuidedLessonSettings({
  lesson,
}: {
  readonly lesson: GuidedLesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings } = useSettings();
  const pageData = useContext(PageDataContext);
  const resultContext = useContext(ResultContext);
  const keytraceAvailable = Boolean(pageData?.keytraceAvailable);
  const hasKeyTraceData = hasKeyTraceResults(resultContext?.results ?? []);
  const practiceMode = resolvePracticeMode({
    settings,
    keytraceAvailable,
    hasKeyTraceData,
  });
  const isStandalone = practiceMode === "standalone";
  const showKeytraceModeSelector =
    keytraceAvailable ||
    hasKeyTraceData ||
    settings.get(lessonProps.keytraceMode) !== "auto";
  const { language } = lesson.model;
  const isZh = isZhLanguage(language);
  const zhScheme = getZhSchemeFromLayout(lesson.keyboard.layout) ?? "zh-sp";
  return (
    <>
      <Explainer>
        <Description>
          <FormattedMessage
            id="lessonType.guided.description"
            defaultMessage="Generate typing lessons with random words using the phonetic rules of your language. The key set is expanded dynamically based on your performance. This mode is for the beginners."
          />
        </Description>
      </Explainer>
      <FieldSet
        legend={formatMessage({
          id: "t_Lesson_options",
          defaultMessage: "Practice options",
        })}
      >
        <TargetSpeedProp />
        {showKeytraceModeSelector && <KeytraceModeProp />}
        {isStandalone && <RecoverKeysProp />}
        {isStandalone && <KeyboardOrderProp />}
        {!isZh && <NaturalWordsProp />}
        <RepeatWordsProp />
        {isStandalone && <AlphabetSizeProp />}
        <TextManglingProp showCapitals={!isZh} />
        {isZh && <ZhProp />}
        {isZh && <FuzzyPinyinProp scheme={zhScheme} />}
        <LessonLengthProp />
      </FieldSet>
    </>
  );
}
