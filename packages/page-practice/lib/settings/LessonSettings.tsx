import {
  CustomTextLesson,
  type GuidedLesson,
  lessonProps,
  LessonType,
} from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { useSettings } from "@keybr/settings";
import { Tab, TabList } from "@keybr/widget";
import { type ReactNode, useEffect } from "react";
import { useIntl } from "react-intl";
import { CustomTextLessonSettings } from "./lesson/CustomTextLessonSettings.tsx";
import { DailyGoalSettings } from "./lesson/DailyGoalSettings.tsx";
import { GuidedLessonSettings } from "./lesson/GuidedLessonSettings.tsx";
import { LessonPreview } from "./lesson/LessonPreview.tsx";

const SUPPORTED_LESSON_TYPES = [LessonType.GUIDED, LessonType.CUSTOM] as const;

export function LessonSettings(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const currentType = settings.get(lessonProps.type);
  const rawIndex = SUPPORTED_LESSON_TYPES.indexOf(
    currentType as (typeof SUPPORTED_LESSON_TYPES)[number],
  );
  const selectedIndex = rawIndex >= 0 ? rawIndex : 0;

  // 若老配置中残留了暂未开放的课程类型（书籍/代码/数字/常用词），自动规范回引导课程。
  useEffect(() => {
    if (rawIndex < 0) {
      updateSettings(settings.set(lessonProps.type, LessonType.GUIDED));
    }
  }, [rawIndex, settings, updateSettings]);

  const tabBody = (
    <LessonLoader>
      {(lesson) => (
        <>
          {lesson instanceof CustomTextLesson ? (
            <CustomTextLessonSettings lesson={lesson} />
          ) : (
            <GuidedLessonSettings lesson={lesson as GuidedLesson} />
          )}
          <LessonPreview lesson={lesson} />
          <DailyGoalSettings />
        </>
      )}
    </LessonLoader>
  );

  return (
    <TabList
      selectedIndex={selectedIndex}
      onSelect={(index) => {
        const nextType = SUPPORTED_LESSON_TYPES[index] ?? LessonType.GUIDED;
        updateSettings(settings.set(lessonProps.type, nextType));
      }}
    >
      <Tab
        label={formatMessage({
          id: "t_Guided_lessons",
          defaultMessage: "Guided lessons",
        })}
      >
        {tabBody}
      </Tab>
      <Tab
        label={formatMessage({
          id: "t_Custom_text",
          defaultMessage: "Custom text",
        })}
      >
        {tabBody}
      </Tab>
    </TabList>
  );
}
