import { test } from "node:test";
import { lessonProps } from "@keybr/lesson";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { type Result, useResults } from "@keybr/result";
import { resultFromJson, resultToJson } from "@keybr/result-io";
import { Settings, SettingsContext } from "@keybr/settings";
import { act, render, waitFor } from "@testing-library/react";
import { equal } from "rich-assert";
import { ResultProvider } from "./ResultProvider.tsx";
import { type ResultStorage } from "./types.ts";

function makeKeyTraceResult(ts: number): Result {
  return resultFromJson({
    l: "en-us",
    m: "keytrace",
    ts,
    n: 20,
    t: 5000,
    e: 1,
    h: {
      97: { h: 10, m: 0, t: 250 },
      98: { h: 10, m: 1, t: 300 },
      99: { h: 10, m: 0, t: 220 },
    },
  })!;
}

function createMemoryStorage(): ResultStorage {
  let items: Result[] = [];
  return {
    async load() {
      return [...items];
    },
    async append(results) {
      items = [...items, ...results];
    },
    async clear() {
      items = [];
    },
  };
}

function ResultCount() {
  const { results } = useResults();
  return <span data-testid="count">{results.length}</span>;
}

test("ResultProvider skips KeyTrace sync when unavailable or standalone and syncs once when enabled", async () => {
  window.localStorage.clear();
  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        available: true,
        syncVersion: 4,
        records: [resultToJson(makeKeyTraceResult(1700000020000))],
        latestTs: 1700000020000,
        daysScanned: 1,
        commitKeys: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    // 1. Missing PageDataContext -> no sync.
    const r1 = render(
      <ResultProvider storage={createMemoryStorage()} initialResults={[]}>
        <ResultCount />
      </ResultProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(requestedUrls.length, 0);
    r1.unmount();

    // 2. keytraceAvailable: false -> no sync.
    const r2 = render(
      <PageDataContext.Provider
        value={{ keytraceAvailable: false } as PageData}
      >
        <ResultProvider storage={createMemoryStorage()} initialResults={[]}>
          <ResultCount />
        </ResultProvider>
      </PageDataContext.Provider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(requestedUrls.length, 0);
    r2.unmount();

    // 3. keytraceAvailable: true + standalone mode -> no sync; switching to auto triggers sync.
    const standaloneSettings = new Settings().set(
      lessonProps.keytraceMode,
      "standalone",
    );
    const autoSettings = new Settings().set(lessonProps.keytraceMode, "auto");
    const storage = createMemoryStorage();

    const r3 = render(
      <PageDataContext.Provider value={{ keytraceAvailable: true } as PageData}>
        <SettingsContext.Provider
          value={{ settings: standaloneSettings, updateSettings: () => {} }}
        >
          <ResultProvider storage={storage} initialResults={[]}>
            <ResultCount />
          </ResultProvider>
        </SettingsContext.Provider>
      </PageDataContext.Provider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    equal(requestedUrls.length, 0);
    equal(r3.getByTestId("count").textContent, "0");

    // Switch to auto -> sync runs once and adds synced record.
    r3.rerender(
      <PageDataContext.Provider value={{ keytraceAvailable: true } as PageData}>
        <SettingsContext.Provider
          value={{ settings: autoSettings, updateSettings: () => {} }}
        >
          <ResultProvider storage={storage} initialResults={[]}>
            <ResultCount />
          </ResultProvider>
        </SettingsContext.Provider>
      </PageDataContext.Provider>,
    );
    await waitFor(() => {
      equal(r3.getByTestId("count").textContent, "1");
    });
    equal(requestedUrls.length, 1);
    r3.unmount();

    // 4. keytraceAvailable: true without SettingsContext -> defaults to "auto" and syncs.
    window.localStorage.clear();
    const r4 = render(
      <PageDataContext.Provider value={{ keytraceAvailable: true } as PageData}>
        <ResultProvider storage={createMemoryStorage()} initialResults={[]}>
          <ResultCount />
        </ResultProvider>
      </PageDataContext.Provider>,
    );
    await waitFor(() => {
      equal(r4.getByTestId("count").textContent, "1");
    });
    equal(requestedUrls.length, 2);
    r4.unmount();
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});
