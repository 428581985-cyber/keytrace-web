import { isZhLanguage, isZhQuanpin } from "@keybr/keyboard";
import { type GuidedLesson } from "@keybr/lesson";
import { Description, Explainer, FieldSet } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { AlphabetSizeProp } from "./AlphabetSizeProp.tsx";
import { FuzzyPinyinProp } from "./FuzzyPinyinProp.tsx";
import { KeyboardOrderProp } from "./KeyboardOrderProp.tsx";
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
  // 中文（双拼 / 全拼）是「26 个键一开始就全开」，上游那套「先解锁几个键、按成绩逐渐放」
  // 在这里既不生效也没意义，相关开关全部隐藏，免得看着像一个能调的选项。
  const { language } = lesson.model;
  const isZh = isZhLanguage(language);
  const zhScheme = isZhQuanpin(language) ? "zh-qp" : "zh-sp";
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
        {!isZh && <RecoverKeysProp />}
        {!isZh && <KeyboardOrderProp />}
        {!isZh && <NaturalWordsProp />}
        <RepeatWordsProp />
        {!isZh && <AlphabetSizeProp />}
        <TextManglingProp showCapitals={!isZh} />
        {isZh && <ZhProp />}
        {isZh && <FuzzyPinyinProp scheme={zhScheme} />}
        <LessonLengthProp />
      </FieldSet>
    </>
  );
}
