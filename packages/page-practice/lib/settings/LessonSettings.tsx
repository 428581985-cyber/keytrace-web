import { type GuidedLesson, lessonProps, LessonType } from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { useSettings } from "@keybr/settings";
import { type ReactNode, useEffect } from "react";
import { DailyGoalSettings } from "./lesson/DailyGoalSettings.tsx";
import { GuidedLessonSettings } from "./lesson/GuidedLessonSettings.tsx";
import { LessonPreview } from "./lesson/LessonPreview.tsx";

// 这个 fork 只跑中文双拼一种练习。上游的「常用词 / 书籍 / 自定义文本 / 源码 / 数字」
// 五种类型全是英文内容，双拼练不了，Tab 一并收掉，免得点了之后看到一堆英文。
// 同时把 lesson type 强制钉在 GUIDED，防止老设置里存着别的类型导致预览取错词表。
export function LessonSettings(): ReactNode {
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    if (settings.get(lessonProps.type) !== LessonType.GUIDED) {
      updateSettings(settings.set(lessonProps.type, LessonType.GUIDED));
    }
  }, [settings, updateSettings]);

  return (
    <LessonLoader>
      {(lesson) => (
        <>
          <GuidedLessonSettings lesson={lesson as GuidedLesson} />
          <LessonPreview lesson={lesson} />
          <DailyGoalSettings />
        </>
      )}
    </LessonLoader>
  );
}
