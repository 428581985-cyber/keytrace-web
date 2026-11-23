import { test } from "node:test";
import { type Result, ResultFaker } from "@keybr/result";
import { resultFromJson, resultToJson } from "@keybr/result-io";
import { deepEqual, equal } from "rich-assert";
import { syncKeyTraceResults } from "./keytrace-sync.ts";

function makeValidResult(
  layoutId: "zh-sp" | "zh-qp" | "en-us",
  ts: number,
  length = 20,
): Result {
  return resultFromJson({
    l: layoutId,
    m: "generated",
    ts,
    n: length,
    t: 5000,
    e: 1,
    h: {
      97: { h: 10, m: 0, t: 250 },
      98: { h: 10, m: 1, t: 300 },
      99: { h: 10, m: 0, t: 220 },
    },
  })!;
}

test("migrates v1 KeyTrace records to v2 while preserving website practice sessions", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000010000");

  const staleKeyTraceZh = makeValidResult("zh-sp", 1700000010000, 30);
  const leakedPinyinEn = makeValidResult("en-us", 1700000005000, 15);
  const nativeSiteResult = new ResultFaker().nextResult();
  const v2KeyTraceZh = makeValidResult("zh-sp", 1700000020000, 22);

  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        syncVersion: 2,
        records: [resultToJson(v2KeyTraceZh)],
        latestTs: 1700000020000,
        daysScanned: 2,
        commitKeys: ["zh-sp:1700000010", "en-us:1700000005"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    let appended: readonly Result[] = [];
    let replaced: readonly Result[] | null = null;

    const summary = await syncKeyTraceResults(
      [staleKeyTraceZh, leakedPinyinEn, nativeSiteResult],
      (items) => {
        appended = items;
      },
      (items) => {
        replaced = items;
      },
    );

    deepEqual(requestedUrls, ["/_/sync/keytrace?since=0&migrate=1"]);
    equal(summary.added, 1);
    equal(summary.daysScanned, 2);
    equal(appended.length, 0);
    equal(replaced!.length, 2);
    // Native practice result preserved; stale zh-sp & leaked pinyin removed; v2 zh-sp added.
    equal(
      replaced!.some((r) => r.timeStamp === nativeSiteResult.timeStamp),
      true,
    );
    equal(
      replaced!.some((r) => r.timeStamp === 1700000020000),
      true,
    );
    equal(
      replaced!.some((r) => r.timeStamp === 1700000010000),
      false,
    );
    equal(window.localStorage.getItem("keybr.keytrace.syncVersion"), "2");
    equal(
      window.localStorage.getItem("keybr.keytrace.lastSyncedTs"),
      "1700000020000",
    );
    deepEqual(
      JSON.parse(window.localStorage.getItem("keybr.keytrace.syncedKeys")!),
      ["zh-sp:1700000020"],
    );
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});

test("uses incremental ?since sync when already on syncVersion 2", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.syncVersion", "2");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000020000");
  window.localStorage.setItem(
    "keybr.keytrace.syncedKeys",
    JSON.stringify(["zh-sp:1700000020"]),
  );

  const existingV2 = makeValidResult("zh-sp", 1700000020000, 22);
  const newerV2 = makeValidResult("zh-sp", 1700000030000, 18);

  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        syncVersion: 2,
        records: [resultToJson(newerV2)],
        latestTs: 1700000030000,
        daysScanned: 2,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    let appended: readonly Result[] = [];
    let replaced: readonly Result[] | null = null;

    const summary = await syncKeyTraceResults(
      [existingV2],
      (items) => {
        appended = items;
      },
      (items) => {
        replaced = items;
      },
    );

    deepEqual(requestedUrls, ["/_/sync/keytrace?since=1700000020000"]);
    equal(summary.added, 1);
    equal(replaced, null);
    equal(appended.length, 1);
    equal(appended[0].timeStamp, 1700000030000);
    equal(
      window.localStorage.getItem("keybr.keytrace.lastSyncedTs"),
      "1700000030000",
    );
    deepEqual(
      JSON.parse(window.localStorage.getItem("keybr.keytrace.syncedKeys")!),
      ["zh-sp:1700000020", "zh-sp:1700000030"],
    );
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});

test("syncs zh-qp records and isolates dedup keys from zh-sp at the same timestamp", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.syncVersion", "2");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000020000");
  window.localStorage.setItem(
    "keybr.keytrace.syncedKeys",
    JSON.stringify(["zh-sp:1700000020"]),
  );

  const existingSp = makeValidResult("zh-sp", 1700000040000, 20);
  const incomingQpSameTs = makeValidResult("zh-qp", 1700000040000, 26);
  const incomingQpLater = makeValidResult("zh-qp", 1700000050000, 24);

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        syncVersion: 2,
        records: [
          resultToJson(existingSp),
          resultToJson(incomingQpSameTs),
          resultToJson(incomingQpLater),
        ],
        latestTs: 1700000050000,
        daysScanned: 2,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    let appended: readonly Result[] = [];
    const summary1 = await syncKeyTraceResults(
      [existingSp],
      (items) => {
        appended = items;
      },
      () => {
        throw new Error("should not replace during v2 incremental sync");
      },
    );

    equal(summary1.added, 2);
    equal(appended.length, 2);
    equal(appended[0].layout.id, "zh-qp");
    equal(appended[0].timeStamp, 1700000040000);
    equal(appended[1].layout.id, "zh-qp");
    equal(appended[1].timeStamp, 1700000050000);
    deepEqual(
      JSON.parse(window.localStorage.getItem("keybr.keytrace.syncedKeys")!),
      ["zh-sp:1700000020", "zh-qp:1700000040", "zh-qp:1700000050"],
    );

    // Re-syncing the same zh-qp records deduplicates cleanly.
    let appendedAgain: readonly Result[] = [];
    const summary2 = await syncKeyTraceResults(
      [existingSp, ...appended],
      (items) => {
        appendedAgain = items;
      },
    );
    equal(summary2.added, 0);
    equal(appendedAgain.length, 0);
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});

test("migration preserves native zh-qp practice results alongside synced zh-sp and zh-qp records", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000010000");

  const staleKeyTraceSp = makeValidResult("zh-sp", 1700000010000, 30);
  const nativeSiteQp = makeValidResult("zh-qp", 1700000015000, 28);
  const freshKeyTraceSp = makeValidResult("zh-sp", 1700000020000, 22);
  const freshKeyTraceQp = makeValidResult("zh-qp", 1700000025000, 25);

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        syncVersion: 2,
        records: [
          resultToJson(freshKeyTraceSp),
          resultToJson(freshKeyTraceQp),
        ],
        latestTs: 1700000025000,
        daysScanned: 2,
        commitKeys: ["zh-sp:1700000010"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    let replaced: readonly Result[] | null = null;
    const summary = await syncKeyTraceResults(
      [staleKeyTraceSp, nativeSiteQp],
      () => {},
      (items) => {
        replaced = items;
      },
    );

    equal(summary.added, 2);
    equal(replaced!.length, 3);
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-qp" && r.timeStamp === 1700000015000,
      ),
      true,
    );
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-qp" && r.timeStamp === 1700000025000,
      ),
      true,
    );
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-sp" && r.timeStamp === 1700000020000,
      ),
      true,
    );
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-sp" && r.timeStamp === 1700000010000,
      ),
      false,
    );
    deepEqual(
      JSON.parse(window.localStorage.getItem("keybr.keytrace.syncedKeys")!),
      ["zh-sp:1700000020", "zh-qp:1700000025"],
    );
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});
