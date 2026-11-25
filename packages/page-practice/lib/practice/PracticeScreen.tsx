import { catchError } from "@keybr/debug";
import { KeyboardProvider } from "@keybr/keyboard";
import { schedule } from "@keybr/lang";
import { type Lesson, resolvePracticeMode } from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { LoadingProgress, PageDataContext } from "@keybr/pages-shared";
import {
  hasKeyTraceResults,
  type Result,
  TextType,
  useResults,
} from "@keybr/result";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller } from "./Controller.tsx";
import { displayEvent, Progress } from "./state/index.ts";

export function PracticeScreen() {
  return (
    <KeyboardProvider>
      <LessonLoader>
        {(lesson) => <ProgressUpdater lesson={lesson} />}
      </LessonLoader>
    </KeyboardProvider>
  );
}

function ProgressUpdater({ lesson }: { readonly lesson: Lesson }) {
  const { results, appendResults } = useResults();
  const pageData = useContext(PageDataContext);
  const practiceMode = resolvePracticeMode({
    settings: lesson.settings,
    keytraceAvailable: pageData?.keytraceAvailable,
    hasKeyTraceData: hasKeyTraceResults(results),
  });
  const isStandalone = practiceMode === "standalone";
  const effectiveResults = useMemo(
    () =>
      isStandalone
        ? results.filter((result) => result.textType !== TextType.KEYTRACE)
        : results,
    [isStandalone, results],
  );
  const [progress, revision, { total, current }, markLocalAppend] = useProgress(
    lesson,
    effectiveResults,
  );
  const handleResult = useCallback(
    (result: Result) => {
      if (progress != null && result.validate()) {
        progress.append(result, displayEvent);
        markLocalAppend(progress);
        appendResults([result]);
      }
    },
    [progress, markLocalAppend, appendResults],
  );
  if (progress == null) {
    return <LoadingProgress total={total} current={current} />;
  } else {
    return (
      <Controller
        progress={progress}
        revision={revision}
        onResult={handleResult}
      />
    );
  }
}

function useProgress(lesson: Lesson, results: readonly Result[]) {
  const [committed, setCommitted] = useState<{
    readonly progress: Progress | null;
    readonly revision: number;
  }>({ progress: null, revision: 0 });
  const [loading, setLoading] = useState({ total: 0, current: 0 });
  const activeProgressRef = useRef<Progress | null>(null);
  const committedVersionRef = useRef<number>(-1);

  const markLocalAppend = useCallback((progress: Progress) => {
    if (activeProgressRef.current === progress) {
      committedVersionRef.current = progress.version;
    }
  }, []);

  useEffect(() => {
    // Populating the progress object can take a long time, so we do this
    // asynchronously, interleaved with the browser event loop to avoid
    // freezing of the UI.
    const controller = new AbortController();
    const { signal } = controller;
    const filteredResults = lesson.filter(results);
    const activeProgress = activeProgressRef.current;
    const canReuse =
      activeProgress != null &&
      activeProgress.lesson === lesson &&
      activeProgress.isAppendOnlyExtension(filteredResults);
    const nextProgress = canReuse
      ? activeProgress
      : new Progress(lesson.settings, lesson);
    schedule(nextProgress.seedAsync(filteredResults, setLoading), {
      signal,
    })
      .then(() => {
        if (!signal.aborted) {
          const isNewProgress = activeProgressRef.current !== nextProgress;
          const versionChanged =
            isNewProgress ||
            nextProgress.version !== committedVersionRef.current;
          activeProgressRef.current = nextProgress;
          if (versionChanged) {
            committedVersionRef.current = nextProgress.version;
            setCommitted((prev) => ({
              progress: nextProgress,
              revision: prev.revision + 1,
            }));
          }
        }
      })
      .catch(catchError);
    return () => {
      controller.abort();
    };
  }, [lesson, results]);
  return [
    committed.progress,
    committed.revision,
    loading,
    markLocalAppend,
  ] as const;
}
