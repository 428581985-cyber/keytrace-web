import { test } from "node:test";
import { type Result, ResultFaker, TextType } from "@keybr/result";
import { resultFromJson, resultToJson } from "@keybr/result-io";
import { deepEqual, equal } from "rich-assert";
import { syncKeyTraceResults } from "./keytrace-sync.ts";

function makeValidResult(
  layoutId: "zh-sp" | "zh-qp" | "en-us",
  ts: number,
  length = 20,
  textType: "generated" | "keytrace" = "generated",
): Result {
  return resultFromJson({
    l: layoutId,
    m: textType,
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

test("migrates v1/v2 KeyTrace records to v3 TextType.KEYTRACE while preserving website practice sessions", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.syncVersion", "2");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000010000");
  window.localStorage.setItem(
    "keybr.keytrace.syncedKeys",
    JSON.stringify(["zh-sp:1700000010"]),
  );

  const staleKeyTraceZh = makeValidResult("zh-sp", 1700000010000, 30);
  const leakedPinyinEn = makeValidResult("en-us", 1700000005000, 15);
  const nativeSiteResult = new ResultFaker().nextResult();
  const v3KeyTraceZh = makeValidResult(
    "zh-sp",
    1700000020000,
    22,
    "keytrace",
  );

  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        available: true,
        syncVersion: 3,
        records: [resultToJson(v3KeyTraceZh)],
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
    // Native practice result preserved; stale zh-sp & leaked pinyin removed; v3 KEYTRACE zh-sp added.
    const keptNative = replaced!.find(
      (r) => r.timeStamp === nativeSiteResult.timeStamp,
    );
    equal(keptNative?.textType, nativeSiteResult.textType);
    const migratedZh = replaced!.find((r) => r.timeStamp === 1700000020000);
    equal(migratedZh?.textType, TextType.KEYTRACE);
    equal(
      replaced!.some((r) => r.timeStamp === 1700000010000),
      false,
    );
    equal(window.localStorage.getItem("keybr.keytrace.syncVersion"), "3");
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

test("uses incremental ?since sync when already on syncVersion 3", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("keybr.keytrace.syncVersion", "3");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000020000");
  window.localStorage.setItem(
    "keybr.keytrace.syncedKeys",
    JSON.stringify(["zh-sp:1700000020"]),
  );

  const existingV3 = makeValidResult("zh-sp", 1700000020000, 22, "keytrace");
  const newerV3 = makeValidResult("zh-sp", 1700000030000, 18, "keytrace");

  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        available: true,
        syncVersion: 3,
        records: [resultToJson(newerV3)],
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
      [existingV3],
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
    equal(appended[0].textType, TextType.KEYTRACE);
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
  window.localStorage.setItem("keybr.keytrace.syncVersion", "3");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000020000");
  window.localStorage.setItem(
    "keybr.keytrace.syncedKeys",
    JSON.stringify(["zh-sp:1700000020"]),
  );

  const existingSp = makeValidResult("zh-sp", 1700000040000, 20, "keytrace");
  const incomingQpSameTs = makeValidResult(
    "zh-qp",
    1700000040000,
    26,
    "keytrace",
  );
  const incomingQpLater = makeValidResult(
    "zh-qp",
    1700000050000,
    24,
    "keytrace",
  );

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        available: true,
        syncVersion: 3,
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
        throw new Error("should not replace during v3 incremental sync");
      },
    );

    equal(summary1.added, 2);
    equal(appended.length, 2);
    equal(appended[0].layout.id, "zh-qp");
    equal(appended[0].textType, TextType.KEYTRACE);
    equal(appended[0].timeStamp, 1700000040000);
    equal(appended[1].layout.id, "zh-qp");
    equal(appended[1].textType, TextType.KEYTRACE);
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
  window.localStorage.setItem("keybr.keytrace.syncVersion", "2");
  window.localStorage.setItem("keybr.keytrace.lastSyncedTs", "1700000010000");

  const staleKeyTraceSp = makeValidResult("zh-sp", 1700000010000, 30);
  const staleKeyTraceQp = makeValidResult("zh-qp", 1700000012000, 25);
  const nativeSiteQp = makeValidResult("zh-qp", 1700000015000, 28);
  const freshKeyTraceSp = makeValidResult(
    "zh-sp",
    1700000020000,
    22,
    "keytrace",
  );
  const freshKeyTraceQp = makeValidResult(
    "zh-qp",
    1700000025000,
    25,
    "keytrace",
  );

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        available: true,
        syncVersion: 3,
        records: [
          resultToJson(freshKeyTraceSp),
          resultToJson(freshKeyTraceQp),
        ],
        latestTs: 1700000025000,
        daysScanned: 2,
        commitKeys: ["zh-sp:1700000010", "zh-qp:1700000012"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    let replaced: readonly Result[] | null = null;
    const summary = await syncKeyTraceResults(
      [staleKeyTraceSp, staleKeyTraceQp, nativeSiteQp],
      () => {},
      (items) => {
        replaced = items;
      },
    );

    equal(summary.added, 2);
    equal(replaced!.length, 3);
    const keptNative = replaced!.find(
      (r) => r.layout.id === "zh-qp" && r.timeStamp === 1700000015000,
    );
    equal(keptNative?.textType, TextType.GENERATED);
    const freshQp = replaced!.find(
      (r) => r.layout.id === "zh-qp" && r.timeStamp === 1700000025000,
    );
    equal(freshQp?.textType, TextType.KEYTRACE);
    const freshSp = replaced!.find(
      (r) => r.layout.id === "zh-sp" && r.timeStamp === 1700000020000,
    );
    equal(freshSp?.textType, TextType.KEYTRACE);
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-sp" && r.timeStamp === 1700000010000,
      ),
      false,
    );
    equal(
      replaced!.some(
        (r) => r.layout.id === "zh-qp" && r.timeStamp === 1700000012000,
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

test("does not write localStorage sync markers when KeyTrace is unavailable", async () => {
  window.localStorage.clear();

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        available: false,
        syncVersion: 3,
        records: [],
        latestTs: 0,
        daysScanned: 0,
        commitKeys: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    let appendedCalled = false;
    let replacedCalled = false;

    const migrationSummary = await syncKeyTraceResults(
      [],
      () => {
        appendedCalled = true;
      },
      () => {
        replacedCalled = true;
      },
    );
    deepEqual(migrationSummary, { added: 0, daysScanned: 0 });
    equal(appendedCalled, false);
    equal(replacedCalled, false);
    equal(window.localStorage.getItem("keybr.keytrace.syncVersion"), null);
    equal(window.localStorage.getItem("keybr.keytrace.lastSyncedTs"), null);
    equal(window.localStorage.getItem("keybr.keytrace.syncedKeys"), null);

    // Incremental path (no replaceResults callback) also leaves localStorage clean.
    const incrementalSummary = await syncKeyTraceResults([], () => {
      appendedCalled = true;
    });
    deepEqual(incrementalSummary, { added: 0, daysScanned: 0 });
    equal(appendedCalled, false);
    equal(window.localStorage.getItem("keybr.keytrace.syncVersion"), null);
    equal(window.localStorage.getItem("keybr.keytrace.lastSyncedTs"), null);
    equal(window.localStorage.getItem("keybr.keytrace.syncedKeys"), null);
  } finally {
    globalThis.fetch = origFetch;
    window.localStorage.clear();
  }
});
