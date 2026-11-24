import { catchError } from "@keybr/debug";
import { type Language } from "@keybr/keyboard";
import { LoadingProgress } from "@keybr/pages-shared";
import {
  type PhoneticModel,
  PhoneticModelContext,
} from "@keybr/phonetic-model";
import { type ReactNode, useEffect, useState } from "react";
import { loaderImpl } from "./loader.ts";

export type PhoneticModelLoaderMeta = {
  readonly language: Language;
  readonly isLoading: boolean;
};

export function PhoneticModelLoader({
  language,
  children,
  fallback = <LoadingProgress />,
}: {
  readonly language: Language;
  readonly children: (
    result: PhoneticModel,
    meta: PhoneticModelLoaderMeta,
  ) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  return (
    <Loader language={language} fallback={fallback}>
      {children}
    </Loader>
  );
}

export namespace PhoneticModelLoader {
  export let loader: PhoneticModel.Loader = loaderImpl;
}

type LoaderState = {
  readonly loader: PhoneticModel.Loader;
  readonly loaded: {
    readonly language: Language;
    readonly model: PhoneticModel;
  } | null;
  readonly cache: ReadonlyMap<Language, PhoneticModel>;
};

function Loader({
  language,
  children,
  fallback,
}: {
  readonly language: Language;
  readonly children: (
    result: PhoneticModel,
    meta: PhoneticModelLoaderMeta,
  ) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const currentLoader = PhoneticModelLoader.loader;
  const [state, setState] = useState<LoaderState>(() => ({
    loader: currentLoader,
    loaded: null,
    cache: new Map(),
  }));

  const cacheValid = state.loader === currentLoader;
  const cachedModel = cacheValid ? state.cache.get(language) : undefined;
  const active =
    cachedModel != null
      ? { language, model: cachedModel }
      : cacheValid
        ? state.loaded
        : null;
  const isLoading = active != null && cachedModel == null;

  useEffect(() => {
    if (cachedModel != null) {
      return;
    }

    let didCancel = false;

    currentLoader(language)
      .then((model) => {
        if (!didCancel) {
          setState((prev) => {
            const baseCache =
              prev.loader === currentLoader
                ? prev.cache
                : new Map<Language, PhoneticModel>();
            const nextCache = new Map(baseCache);
            nextCache.set(language, model);
            return {
              loader: currentLoader,
              loaded: { language, model },
              cache: nextCache,
            };
          });
        }
      })
      .catch(catchError);

    return () => {
      didCancel = true;
    };
  }, [language, currentLoader, cachedModel]);

  if (active == null) {
    return fallback;
  } else {
    return (
      <PhoneticModelContext.Provider value={active.model}>
        {children(active.model, { language: active.language, isLoading })}
      </PhoneticModelContext.Provider>
    );
  }
}
