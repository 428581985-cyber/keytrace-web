import { useCallback, useState, useSyncExternalStore } from "react";
import { querySelector } from "../utils/query.ts";
import { useDocumentEvent } from "./use-document-event.ts";

function subscribeFullscreen(onStoreChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onStoreChange);
  document.addEventListener("fullscreenerror", onStoreChange);
  return () => {
    document.removeEventListener("fullscreenchange", onStoreChange);
    document.removeEventListener("fullscreenerror", onStoreChange);
  };
}

export function useFullscreen(
  element: Element | string,
): [boolean | null, () => void] {
  const target = typeof element === "string" ? querySelector(element) : element;
  const [errorForTarget, setErrorForTarget] = useState<Element | null>(null);

  const fullscreenState = useSyncExternalStore(
    subscribeFullscreen,
    () =>
      document.fullscreenEnabled
        ? document.fullscreenElement === target
        : null,
    () => null,
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenEnabled) {
      if (document.fullscreenElement !== target) {
        target.requestFullscreen().catch(() => {
          setErrorForTarget(target);
        });
      } else {
        document.exitFullscreen().catch(() => {
          setErrorForTarget(target);
        });
      }
    }
  }, [target]);

  useDocumentEvent("fullscreenchange", () => {
    setErrorForTarget(null);
  });

  useDocumentEvent("fullscreenerror", () => {
    setErrorForTarget(target);
  });

  return [
    errorForTarget === target ? null : fullscreenState,
    toggleFullscreen,
  ];
}
