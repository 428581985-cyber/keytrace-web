import { lessonProps } from "@keybr/lesson";
import { PageDataContext } from "@keybr/pages-shared";
import { type Result, ResultContext } from "@keybr/result";
import { SettingsContext } from "@keybr/settings";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { catchError } from "./debug.tsx";
import { syncKeyTraceResults } from "./keytrace-sync.ts";
import { type ResultStorage } from "./types.ts";

export function ResultProvider({
  storage,
  initialResults,
  children,
}: {
  readonly storage: ResultStorage;
  readonly initialResults: readonly Result[];
  readonly children: ReactNode;
}): ReactNode {
  const [results, setResults] = useState(initialResults);
  const pageData = useContext(PageDataContext);
  const settingsContext = useContext(SettingsContext);
  const keytraceAvailable = pageData?.keytraceAvailable ?? false;
  const keytraceMode =
    settingsContext?.settings.get(lessonProps.keytraceMode) ?? "auto";
  const shouldSyncKeyTrace =
    keytraceAvailable && keytraceMode !== "standalone";

  const appendResults = useCallback(
    (newResults: readonly Result[]) => {
      setResults((prev) => [...prev, ...newResults]);
      storage.append(newResults).catch(catchError);
    },
    [storage],
  );
  const replaceResults = useCallback(
    (newResults: readonly Result[]) => {
      const next = [...newResults];
      setResults(next);
      storage
        .clear()
        .then(() => (next.length > 0 ? storage.append(next) : undefined))
        .catch(catchError);
    },
    [storage],
  );
  const clearResults = useCallback(() => {
    setResults([]);
    storage.clear().catch(catchError);
  }, [storage]);

  const syncedRef = useRef(false);
  const resultsRef = useRef(results);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    if (!shouldSyncKeyTrace || syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    syncKeyTraceResults(
      resultsRef.current,
      appendResults,
      replaceResults,
    ).catch(() => {});
  }, [shouldSyncKeyTrace, appendResults, replaceResults]);

  const value = useMemo(
    () => ({
      results,
      appendResults,
      replaceResults,
      clearResults,
    }),
    [results, appendResults, replaceResults, clearResults],
  );

  return (
    <ResultContext.Provider value={value}>{children}</ResultContext.Provider>
  );
}
