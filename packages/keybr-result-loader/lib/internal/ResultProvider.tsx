import { type Result, ResultContext } from "@keybr/result";
import {
  type ReactNode,
  useCallback,
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
  const initialResultsRef = useRef(initialResults);
  useEffect(() => {
    if (syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    syncKeyTraceResults(
      initialResultsRef.current,
      appendResults,
      replaceResults,
    ).catch(() => {});
  }, [appendResults, replaceResults]);

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
