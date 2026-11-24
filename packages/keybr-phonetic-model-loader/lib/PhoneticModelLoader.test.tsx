import { test } from "node:test";
import { Language } from "@keybr/keyboard";
import { FakePhoneticModel, type PhoneticModel } from "@keybr/phonetic-model";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { equal, isNotNull, isNull } from "rich-assert";
import {
  PhoneticModelLoader,
  type PhoneticModelLoaderMeta,
} from "./PhoneticModelLoader.tsx";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("retains mounted child without fallback flash across language switches and caches repeat loads", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const calls: Language[] = [];
  const deferreds = new Map<
    Language,
    ReturnType<typeof createDeferred<PhoneticModel>>
  >();

  PhoneticModelLoader.loader = (language) => {
    calls.push(language);
    let deferred = deferreds.get(language);
    if (deferred == null) {
      deferred = createDeferred<PhoneticModel>();
      deferreds.set(language, deferred);
    }
    return deferred.promise;
  };

  let mountCount = 0;
  let latestModel: PhoneticModel | null = null;
  let latestMeta: PhoneticModelLoaderMeta | null = null;

  function Child({
    model,
    meta,
  }: {
    readonly model: PhoneticModel;
    readonly meta: PhoneticModelLoaderMeta;
  }) {
    useEffect(() => {
      mountCount += 1;
    }, []);
    latestModel = model;
    latestMeta = meta;
    return (
      <span data-testid="child">
        {meta.language.id}:{meta.isLoading ? "loading" : "ready"}
      </span>
    );
  }

  try {
    const r = render(
      <PhoneticModelLoader
        language={Language.EN}
        fallback={<span data-testid="fallback">loading</span>}
      >
        {(model, meta) => <Child model={model} meta={meta} />}
      </PhoneticModelLoader>,
    );

    // Cold load renders fallback once.
    isNotNull(r.queryByTestId("fallback"));
    isNull(r.queryByTestId("child"));
    equal(mountCount, 0);

    const modelEn = new FakePhoneticModel(["en1"]);
    await act(async () => {
      deferreds.get(Language.EN)!.resolve(modelEn);
    });

    isNull(r.queryByTestId("fallback"));
    equal((await r.findByTestId("child")).textContent, "en:ready");
    equal(mountCount, 1);
    equal(latestModel, modelEn);
    equal(latestMeta!.isLoading, false);

    // Switch to ZH_SP while ZH_SP is still pending: retains child & EN model, never flashes fallback.
    r.rerender(
      <PhoneticModelLoader
        language={Language.ZH_SP}
        fallback={<span data-testid="fallback">loading</span>}
      >
        {(model, meta) => <Child model={model} meta={meta} />}
      </PhoneticModelLoader>,
    );

    isNull(r.queryByTestId("fallback"));
    equal(r.getByTestId("child").textContent, "en:loading");
    equal(mountCount, 1);
    equal(latestModel, modelEn);
    equal(latestMeta!.isLoading, true);

    const modelZh = new FakePhoneticModel(["zh1"]);
    await act(async () => {
      deferreds.get(Language.ZH_SP)!.resolve(modelZh);
    });

    isNull(r.queryByTestId("fallback"));
    equal(r.getByTestId("child").textContent, "zh-sp:ready");
    equal(mountCount, 1);
    equal(latestModel, modelZh);
    equal(latestMeta!.isLoading, false);

    // Switch back to EN: hits component cache synchronously without loader re-invocation or fallback.
    r.rerender(
      <PhoneticModelLoader
        language={Language.EN}
        fallback={<span data-testid="fallback">loading</span>}
      >
        {(model, meta) => <Child model={model} meta={meta} />}
      </PhoneticModelLoader>,
    );

    isNull(r.queryByTestId("fallback"));
    equal(r.getByTestId("child").textContent, "en:ready");
    equal(mountCount, 1);
    equal(latestModel, modelEn);
    equal(latestMeta!.isLoading, false);
    equal(calls.filter((c) => c === Language.EN).length, 1);

    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});

test("rapid-toggle cancellation prevents stale slow load from overwriting newer language", async () => {
  const prevLoader = PhoneticModelLoader.loader;
  const deferreds = new Map<
    Language,
    ReturnType<typeof createDeferred<PhoneticModel>>
  >();

  PhoneticModelLoader.loader = (language) => {
    const deferred = createDeferred<PhoneticModel>();
    deferreds.set(language, deferred);
    return deferred.promise;
  };

  let latestModel: PhoneticModel | null = null;
  let latestMeta: PhoneticModelLoaderMeta | null = null;

  try {
    const r = render(
      <PhoneticModelLoader language={Language.EN}>
        {(model, meta) => {
          latestModel = model;
          latestMeta = meta;
          return (
            <span data-testid="child">
              {meta.language.id}:{meta.isLoading ? "loading" : "ready"}
            </span>
          );
        }}
      </PhoneticModelLoader>,
    );

    const modelEn = new FakePhoneticModel(["en"]);
    await act(async () => {
      deferreds.get(Language.EN)!.resolve(modelEn);
    });

    // Switch EN -> ZH_SP (slow) -> DE (fast).
    r.rerender(
      <PhoneticModelLoader language={Language.ZH_SP}>
        {(model, meta) => {
          latestModel = model;
          latestMeta = meta;
          return (
            <span data-testid="child">
              {meta.language.id}:{meta.isLoading ? "loading" : "ready"}
            </span>
          );
        }}
      </PhoneticModelLoader>,
    );

    r.rerender(
      <PhoneticModelLoader language={Language.DE}>
        {(model, meta) => {
          latestModel = model;
          latestMeta = meta;
          return (
            <span data-testid="child">
              {meta.language.id}:{meta.isLoading ? "loading" : "ready"}
            </span>
          );
        }}
      </PhoneticModelLoader>,
    );

    const modelDe = new FakePhoneticModel(["de"]);
    await act(async () => {
      deferreds.get(Language.DE)!.resolve(modelDe);
    });

    equal(r.getByTestId("child").textContent, "de:ready");
    equal(latestModel, modelDe);
    equal(latestMeta!.language, Language.DE);

    // Late resolution of ZH_SP must NOT overwrite DE.
    const modelZh = new FakePhoneticModel(["zh"]);
    await act(async () => {
      deferreds.get(Language.ZH_SP)!.resolve(modelZh);
    });

    equal(r.getByTestId("child").textContent, "de:ready");
    equal(latestModel, modelDe);
    equal(latestMeta!.language, Language.DE);

    r.unmount();
  } finally {
    PhoneticModelLoader.loader = prevLoader;
  }
});
