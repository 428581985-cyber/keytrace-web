import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { request } from "@fastr/client";
import { start } from "@fastr/client-testlib";
import { allToRoutes } from "@fastr/controller";
import { Application } from "@fastr/core";
import { Container } from "@fastr/invert";
import { Router } from "@fastr/middleware-router";
import { HighScoresFactory } from "@keybr/highscores";
import { Result } from "@keybr/result";
import { resultFromJson } from "@keybr/result-io";
import { UserDataFactory } from "@keybr/result-userdata";
import { deepEqual, equal, isNotNull, isTrue } from "rich-assert";
import { createTestServer } from "../test/request.ts";
import { Controller } from "./controller.ts";
import { readKeyTraceSyncData } from "./keytrace-events.ts";

function jsonl(lines: readonly Record<string, unknown>[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function kd(
  vk: number,
  mono: number,
  ts: number,
  opts?: {
    readonly sid?: string | number;
    readonly sessionStartTs?: number;
    readonly sc?: number;
    readonly mods?: number;
  },
): Record<string, unknown> {
  return {
    v: 1,
    ev: "kd",
    vk,
    sc: opts?.sc ?? 30,
    mods: opts?.mods ?? 0,
    mono,
    ts,
    ...(opts?.sid != null ? { sid: opts.sid } : {}),
    ...(opts?.sessionStartTs != null
      ? { sessionStartTs: opts.sessionStartTs }
      : {}),
  };
}

function commit(
  text: string,
  keys: number,
  mono: number,
  ts: number,
  opts?: {
    readonly sid?: string | number;
    readonly sessionStartTs?: number;
  },
): Record<string, unknown> {
  return {
    v: 1,
    ev: "commit",
    text,
    keys,
    mono,
    ts,
    ...(opts?.sid != null ? { sid: opts.sid } : {}),
    ...(opts?.sessionStartTs != null
      ? { sessionStartTs: opts.sessionStartTs }
      : {}),
  };
}

test("missing events directory returns empty result gracefully", async () => {
  const missingDir = join(tmpdir(), `keytrace-missing-${Date.now()}`);
  const data = await readKeyTraceSyncData({ eventsDir: missingDir });
  deepEqual(data, { records: [], latestTs: 0, daysScanned: 0 });
});

test("reads .jsonl and .jsonl.gz into valid zh-sp and en-us Result JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-sync-"));
  try {
    // Day 1 (.jsonl.gz): Chinese Shuangpin + Backspace miss + autocomplete paste skip + PUA strip.
    const zhLines: Record<string, unknown>[] = [];
    // Type 10 Chinese chars (~20 keystrokes) with 1 typo + backspace on 'x' (vk=88).
    // Note: digits are excluded for zh-sp.
    const zhSeq: Array<[number, number]> = [
      [78, 100], // n
      [73, 220], // i
      [72, 400], // h
      [88, 520], // x (typo)
      [8, 660], // Backspace -> miss on x
      [65, 820], // a
      [79, 940], // o
      [87, 1100], // w
      [79, 1240], // o
      [77, 1400], // m
      [78, 1520], // n
      [83, 1700], // s
      [72, 1820], // h
      [73, 1940], // i
      [50, 2050], // digit '2' (ignored in zh-sp)
    ];
    let ts = 1700000001000;
    for (const [vk, mono] of zhSeq) {
      zhLines.push(kd(vk, mono, ts, { sid: "s1", sessionStartTs: 1000 }));
      ts += 100;
    }
    // Synthetic sc=0 and Ctrl+A (mods=0b0010) should be ignored in kd buffer.
    zhLines.push(
      kd(65, 2100, ts++, { sid: "s1", sessionStartTs: 1000, sc: 0 }),
    );
    zhLines.push(
      kd(65, 2150, ts++, { sid: "s1", sessionStartTs: 1000, mods: 0b0010 }),
    );
    // Commit with PUA char \uE001 stripped; printableCount=6 <= keys=15.
    zhLines.push(
      commit("\uE001你好我们是", 15, 2200, 1700000010000, {
        sid: "s1",
        sessionStartTs: 1000,
      }),
    );
    // Autocomplete paste: printableCount=12 > keys=3 -> excluded.
    zhLines.push(
      kd(65, 2300, 1700000011000, { sid: "s1", sessionStartTs: 1000 }),
    );
    zhLines.push(
      kd(66, 2400, 1700000011100, { sid: "s1", sessionStartTs: 1000 }),
    );
    zhLines.push(
      kd(67, 2500, 1700000011200, { sid: "s1", sessionStartTs: 1000 }),
    );
    zhLines.push(
      commit("长句子自动补全粘贴文本", 3, 2550, 1700000012000, {
        sid: "s1",
        sessionStartTs: 1000,
      }),
    );

    await writeFile(
      join(dir, "2026-11-18.jsonl.gz"),
      gzipSync(Buffer.from(jsonl(zhLines), "utf8")),
    );

    // Day 2 (.jsonl): English + digits.
    const enSeq: Array<[number, number]> = [
      [84, 100], // t
      [69, 210], // e
      [83, 330], // s
      [84, 460], // t
      [49, 600], // 1
      [50, 740], // 2
      [51, 880], // 3
      [65, 1000], // a
      [66, 1120], // b
      [67, 1250], // c
    ];
    const enLines = enSeq.map(([vk, mono], idx) =>
      kd(vk, mono, 1700086400000 + idx * 100, {
        sid: "s2",
        sessionStartTs: 2000,
      }),
    );
    enLines.push(
      commit("test123abc", 10, 1300, 1700086405000, {
        sid: "s2",
        sessionStartTs: 2000,
      }),
    );
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(enLines), "utf8");

    // Non-matching file should be ignored.
    await writeFile(join(dir, "notes.txt"), "ignored", "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });

    equal(data.daysScanned, 2);
    equal(data.records.length, 2);
    equal(data.latestTs, 1700086405000);

    const zhRecord = data.records[0];
    equal(zhRecord.l, "zh-sp");
    equal(zhRecord.ts, 1700000010000);
    equal(zhRecord.e, 1); // 1 miss from Backspace after 'x'
    equal(zhRecord.h[120]?.m, 1); // 'x' (codePoint 120) has 1 miss
    equal(zhRecord.h[50], undefined); // digit '2' excluded for zh-sp
    const zhResult = resultFromJson(zhRecord);
    isNotNull(zhResult);
    isTrue(Result.isValid(zhResult!));

    const enRecord = data.records[1];
    equal(enRecord.l, "en-us");
    equal(enRecord.ts, 1700086405000);
    equal(enRecord.n, 10);
    equal(enRecord.h[49]?.h, 1); // digit '1' included for en-us
    const enResult = resultFromJson(enRecord);
    isNotNull(enResult);
    isTrue(Result.isValid(enResult!));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sorts events by (sessionStartTs, sid, mono, ts) so restarts do not interleave", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-restart-"));
  try {
    // Session 1 and Session 2 both start with mono=100, and lines are interleaved in file.
    const lines = [
      // Session 2 first in file, even with same mono=100!
      kd(80, 100, 2000, { sid: "b", sessionStartTs: 2000 }), // p
      kd(65, 100, 1000, { sid: "a", sessionStartTs: 1000 }), // a
      kd(81, 200, 2100, { sid: "b", sessionStartTs: 2000 }), // q
      kd(66, 200, 1100, { sid: "a", sessionStartTs: 1000 }), // b
      kd(82, 300, 2200, { sid: "b", sessionStartTs: 2000 }), // r
      kd(67, 300, 1200, { sid: "a", sessionStartTs: 1000 }), // c
      kd(83, 400, 2300, { sid: "b", sessionStartTs: 2000 }), // s
      kd(68, 400, 1300, { sid: "a", sessionStartTs: 1000 }), // d
      kd(84, 500, 2400, { sid: "b", sessionStartTs: 2000 }), // t
      kd(69, 500, 1400, { sid: "a", sessionStartTs: 1000 }), // e
      commit("pqrst", 5, 550, 2500, { sid: "b", sessionStartTs: 2000 }),
      commit("abcde", 5, 550, 1500, { sid: "a", sessionStartTs: 1000 }),
    ];

    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    equal(rec.ts, 2500);
    // Each session's keys had clean 100ms IKIs (no interleaved 0ms or negative monoDiff).
    equal(rec.h[98]?.t, 100); // 'b'
    equal(rec.h[113]?.t, 100); // 'q'
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sinceTs filters already-synced commits while preserving session kd buffer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-since-"));
  try {
    const lines = [
      // First commit at ts=1000 (10 keys)
      kd(65, 100, 900, { sid: "s1", sessionStartTs: 500 }),
      kd(66, 200, 910, { sid: "s1", sessionStartTs: 500 }),
      kd(67, 300, 920, { sid: "s1", sessionStartTs: 500 }),
      kd(68, 400, 930, { sid: "s1", sessionStartTs: 500 }),
      kd(69, 500, 940, { sid: "s1", sessionStartTs: 500 }),
      kd(70, 600, 950, { sid: "s1", sessionStartTs: 500 }),
      kd(71, 700, 960, { sid: "s1", sessionStartTs: 500 }),
      kd(72, 800, 970, { sid: "s1", sessionStartTs: 500 }),
      kd(73, 900, 980, { sid: "s1", sessionStartTs: 500 }),
      kd(74, 1000, 990, { sid: "s1", sessionStartTs: 500 }),
      commit("abcdefghij", 10, 1050, 1000, { sid: "s1", sessionStartTs: 500 }),

      // Second commit spans across sinceTs=1500: some kd <= 1500, commit at 2000.
      kd(75, 1200, 1400, { sid: "s1", sessionStartTs: 500 }), // k
      kd(76, 1320, 1450, { sid: "s1", sessionStartTs: 500 }), // l
      kd(77, 1440, 1490, { sid: "s1", sessionStartTs: 500 }), // m
      kd(78, 1560, 1550, { sid: "s1", sessionStartTs: 500 }), // n
      kd(79, 1680, 1600, { sid: "s1", sessionStartTs: 500 }), // o
      kd(80, 1800, 1650, { sid: "s1", sessionStartTs: 500 }), // p
      kd(81, 1920, 1700, { sid: "s1", sessionStartTs: 500 }), // q
      kd(82, 2040, 1750, { sid: "s1", sessionStartTs: 500 }), // r
      kd(83, 2160, 1800, { sid: "s1", sessionStartTs: 500 }), // s
      kd(84, 2280, 1850, { sid: "s1", sessionStartTs: 500 }), // t
      commit("klmnopqrst", 10, 2300, 2000, { sid: "s1", sessionStartTs: 500 }),
    ];

    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const incremental = await readKeyTraceSyncData({
      eventsDir: dir,
      sinceTs: 1500,
    });
    equal(incremental.daysScanned, 1);
    equal(incremental.records.length, 1);
    equal(incremental.latestTs, 2000);
    equal(incremental.records[0].n, 10);
    equal(incremental.records[0].h[107]?.h, 1); // 'k' from ts=1400 preserved in buffer
    equal(incremental.records[0].h[97], undefined); // 'a' from first commit excluded

    const caughtUp = await readKeyTraceSyncData({
      eventsDir: dir,
      sinceTs: 2000,
    });
    equal(caughtUp.daysScanned, 1);
    equal(caughtUp.records.length, 0);
    equal(caughtUp.latestTs, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("GET /_/sync/keytrace endpoint responds without auth and supports since query", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-http-"));
  const prevEnv = process.env.KEYTRACE_EVENTS_DIR;
  process.env.KEYTRACE_EVENTS_DIR = dir;
  try {
    const lines = [
      kd(65, 100, 900),
      kd(66, 200, 910),
      kd(67, 300, 920),
      kd(68, 400, 930),
      kd(69, 500, 940),
      kd(70, 600, 950),
      kd(71, 700, 960),
      kd(72, 800, 970),
      kd(73, 900, 980),
      kd(74, 1000, 990),
      commit("abcdefghij", 10, 1050, 5000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const container = new Container();
    container.bind(HighScoresFactory).toValue(null!);
    container.bind(UserDataFactory).toValue(null!);
    const app = new Application(container).use(
      new Router().registerAll(allToRoutes(Controller)).middleware(),
    );
    const req = request.use(start(createTestServer(app.callback())));

    const res1 = await req.GET("/_/sync/keytrace").send();
    equal(res1.status, 200);
    const body1 = await res1.body.json<{
      records: unknown[];
      latestTs: number;
      daysScanned: number;
    }>();
    equal(body1.records.length, 1);
    equal(body1.latestTs, 5000);
    equal(body1.daysScanned, 1);

    const res2 = await req.GET("/_/sync/keytrace?since=5000").send();
    equal(res2.status, 200);
    const body2 = await res2.body.json<{
      records: unknown[];
      latestTs: number;
      daysScanned: number;
    }>();
    equal(body2.records.length, 0);
    equal(body2.latestTs, 0);
    equal(body2.daysScanned, 1);
  } finally {
    if (prevEnv === undefined) {
      delete process.env.KEYTRACE_EVENTS_DIR;
    } else {
      process.env.KEYTRACE_EVENTS_DIR = prevEnv;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
