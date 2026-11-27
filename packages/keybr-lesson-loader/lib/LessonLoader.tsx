import { loadContent } from "@keybr/content-books";
import { loadWordList } from "@keybr/content-words";
import { catchError } from "@keybr/debug";
import {
  isZhLanguage,
  isZhShuangpinSchemeId,
  KeyboardOptions,
  type Language,
  useKeyboard,
} from "@keybr/keyboard";
import {
  BooksLesson,
  CodeLesson,
  CustomTextLesson,
  getCachedZhPinyinEngine,
  GuidedLesson,
  type Lesson,
  lessonProps,
  LessonType,
  loadZhPinyinEngine,
  NumbersLesson,
  resolvePracticeMode,
  WordListLesson,
} from "@keybr/lesson";
import { LoadingProgress, PageDataContext } from "@keybr/pages-shared";
import { type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { hasKeyTraceResults, ResultContext } from "@keybr/result";
import { useSettings } from "@keybr/settings";
import { getShuangpinWordList } from "@keybr/textinput";
import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const wordListCache = new Map<Language, ReturnType<typeof loadWordList>>();
const contentCache = new Map<
  Parameters<typeof loadContent>[0],
  ReturnType<typeof loadContent>
>();

function cachedLoadWordList(
  language: Language,
): ReturnType<typeof loadWordList> {
  const cached = wordListCache.get(language);
  if (cached != null) {
    return cached;
  }
  const promise = loadWordList(language).catch((err) => {
    wordListCache.delete(language);
    throw err;
  });
  wordListCache.set(language, promise);
  return promise;
}

function cachedLoadContent(
  book: Parameters<typeof loadContent>[0],
): ReturnType<typeof loadContent> {
  const cached = contentCache.get(book);
  if (cached != null) {
    return cached;
  }
  const promise = loadContent(book).catch((err) => {
    contentCache.delete(book);
    throw err;
  });
  contentCache.set(book, promise);
  return promise;
}

export function LessonLoader({
  children,
  fallback = <LoadingProgress />,
}: {
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const { settings } = useSettings();
  const { language } = KeyboardOptions.from(settings);
  return (
    <PhoneticModelLoader language={language} fallback={fallback}>
      {(model, meta) => (
        <Loader
          model={model}
          isModelLoading={meta.isLoading}
          fallback={fallback}
        >
          {children}
        </Loader>
      )}
    </PhoneticModelLoader>
  );
}

function Loader({
  model,
  isModelLoading,
  children,
  fallback,
}: {
  readonly model: PhoneticModel;
  readonly isModelLoading: boolean;
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const result = useLoader(model, isModelLoading);
  if (result == null) {
    return fallback;
  } else {
    return children(result);
  }
}

function useLoader(
  model: PhoneticModel,
  isModelLoading: boolean,
): Lesson | null {
  const { settings } = useSettings();
  const keyboard = useKeyboard();
  const pageData = useContext(PageDataContext);
  const resultContext = useContext(ResultContext);
  const keytraceAvailable = pageData?.keytraceAvailable ?? false;
  const results = resultContext?.results;
  const hasKeyTraceData = useMemo(
    () => (results != null ? hasKeyTraceResults(results) : false),
    [results],
  );
  const practiceMode = resolvePracticeMode({
    settings,
    keytraceAvailable,
    hasKeyTraceData,
  });
  const unlockAllKeys = practiceMode === "keytrace";
  const [result, setResult] = useState<Lesson | null>(null);

  useEffect(() => {
    if (isModelLoading) {
      return;
    }

    let didCancel = false;

    const load = async (): Promise<void> => {
      switch (settings.get(lessonProps.type)) {
        case LessonType.GUIDED: {
          const { language, layout } = KeyboardOptions.from(settings);
          const wordList =
            isZhShuangpinSchemeId(layout.id) && layout.id !== "zh-sp"
              ? getShuangpinWordList(layout.id)
              : await cachedLoadWordList(language);
          if (!didCancel) {
            setResult(
              new GuidedLesson(settings, keyboard, model, wordList, {
                unlockAllKeys,
              }),
            );
          }
          break;
        }
        case LessonType.WORDLIST: {
          const { language, layout } = KeyboardOptions.from(settings);
          const wordList =
            isZhShuangpinSchemeId(layout.id) && layout.id !== "zh-sp"
              ? getShuangpinWordList(layout.id)
              : await cachedLoadWordList(language);
          if (!didCancel) {
            setResult(new WordListLesson(settings, keyboard, model, wordList));
          }
          break;
        }
        case LessonType.BOOKS: {
          const book = settings.get(lessonProps.books.book);
          const content = await cachedLoadContent(book);
          if (!didCancel) {
            setResult(
              new BooksLesson(settings, keyboard, model, { book, content }),
            );
          }
          break;
        }
        case LessonType.CUSTOM: {
          const { language } = KeyboardOptions.from(settings);
          const zhEngine = isZhLanguage(language)
            ? (getCachedZhPinyinEngine() ?? (await loadZhPinyinEngine()))
            : null;
          if (!didCancel) {
            setResult(
              new CustomTextLesson(settings, keyboard, model, zhEngine),
            );
          }
          break;
        }
        case LessonType.CODE: {
          if (!didCancel) {
            setResult(new CodeLesson(settings, keyboard, model));
          }
          break;
        }
        case LessonType.NUMBERS: {
          if (!didCancel) {
            setResult(new NumbersLesson(settings, keyboard, model));
          }
          break;
        }
        default:
          throw new Error();
      }
    };

    load().catch(catchError);

    return () => {
      didCancel = true;
    };
  }, [settings, keyboard, model, isModelLoading, unlockAllKeys]);

  return result;
}
