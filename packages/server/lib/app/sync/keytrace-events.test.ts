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
import {
  readKeyTraceDashboard,
  readKeyTraceSyncData,
  resolveZhLayoutFromIme,
} from "./keytrace-events.ts";

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
  deepEqual(data, {
    syncVersion: 2,
    records: [],
    latestTs: 0,
    daysScanned: 0,
  });
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
    equal(zhRecord.n, 12); // 'x' popped by Backspace; 12 surviving keys
    equal(zhRecord.e, 1); // 1 miss attributed to corrected 'a'
    equal(zhRecord.h[120], undefined); // wrong key 'x' discarded
    equal(zhRecord.h[97]?.m, 1); // 'a' (codePoint 97) absorbs the correction miss
    equal(zhRecord.h[97]?.t, 420); // 'a' gets elapsed 820 - 400 (from 'h')
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
      kd(81, 250, 2150, { sid: "b", sessionStartTs: 2000 }), // q
      kd(66, 250, 1150, { sid: "a", sessionStartTs: 1000 }), // b
      kd(82, 400, 2300, { sid: "b", sessionStartTs: 2000 }), // r
      kd(67, 400, 1300, { sid: "a", sessionStartTs: 1000 }), // c
      kd(83, 550, 2450, { sid: "b", sessionStartTs: 2000 }), // s
      kd(68, 550, 1450, { sid: "a", sessionStartTs: 1000 }), // d
      kd(84, 700, 2600, { sid: "b", sessionStartTs: 2000 }), // t
      kd(69, 700, 1600, { sid: "a", sessionStartTs: 1000 }), // e
      commit("pqrst", 5, 750, 2700, { sid: "b", sessionStartTs: 2000 }),
      commit("abcde", 5, 750, 1700, { sid: "a", sessionStartTs: 1000 }),
    ];

    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    equal(rec.t, 1200);
    equal(rec.ts, 2700);
    // Each session's keys had clean 150ms IKIs (no interleaved 0ms or negative monoDiff).
    equal(rec.h[98]?.t, 150); // 'b'
    equal(rec.h[113]?.t, 150); // 'q'
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
      kd(66, 220, 910),
      kd(67, 340, 920),
      kd(68, 460, 930),
      kd(69, 580, 940),
      kd(70, 700, 950),
      kd(71, 820, 960),
      kd(72, 940, 970),
      kd(73, 1060, 980),
      kd(74, 1180, 990),
      commit("abcdefghij", 10, 1250, 5000),
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
      syncVersion: number;
      records: unknown[];
      latestTs: number;
      daysScanned: number;
    }>();
    equal(body1.syncVersion, 2);
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

test("drops > 3000ms pauses instead of adding 200ms fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-pause-"));
  try {
    // 5 keys (200ms apart = 800ms) -> 5000ms pause -> 5 keys (200ms apart = 800ms)
    // Total activeMs must equal 800 + 800 = 1600ms (no 5000ms, no 200ms fallback).
    const lines = [
      kd(65, 100, 1000), // a (anchor)
      kd(66, 300, 1200), // b (+200)
      kd(67, 500, 1400), // c (+200)
      kd(68, 700, 1600), // d (+200)
      kd(69, 900, 1800), // e (+200)
      // 5000ms pause
      kd(70, 5900, 6800), // f (new burst anchor, no IKI)
      kd(71, 6100, 7000), // g (+200)
      kd(72, 6300, 7200), // h (+200)
      kd(73, 6500, 7400), // i (+200)
      kd(74, 6700, 7600), // j (+200)
      commit("abcdefghij", 10, 6750, 8000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    equal(rec.t, 1600);
    deepEqual(rec.h[97], { h: 1, m: 0, t: 0 }); // burst 1 anchor
    deepEqual(rec.h[102], { h: 1, m: 0, t: 0 }); // burst 2 anchor after pause
    equal(rec.h[98]?.t, 200);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("attributes continuous multi-step correction (> 3000ms total, each step <= 3000ms) to final key with 6000ms cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-corr-"));
  try {
    // Part 1: h(0) -> v(1800) -> BS(3600) -> c(5200): total 5200ms > 3000ms, each step <= 1800ms.
    // Part 2: 3-backspace correction exceeding 6000ms total, each step <= 2000ms -> capped at 6000ms.
    const lines = [
      // Filler word + Part 1 (total 10+ keys)
      kd(72, 1000, 1000), // h
      kd(86, 2800, 2800), // v (typo)
      kd(8, 4600, 4600), // BS
      kd(67, 6200, 6200), // c -> corrected from h(1000): 6200 - 1000 = 5200ms
      kd(32, 6400, 6400), // Space
      // Part 2: n(7000) -> x(9000) -> y(11000) -> z(13000) -> BS(13500) -> BS(14000) -> BS(14500) -> o(15000)
      // Total from n(7000) to o(15000) = 8000ms -> capped at 6000ms!
      kd(78, 7000, 7000), // n
      kd(88, 9000, 9000), // x (wrong)
      kd(89, 11000, 11000), // y (wrong)
      kd(90, 13000, 13000), // z (wrong)
      kd(8, 13500, 13500), // BS 1
      kd(8, 14000, 14000), // BS 2
      kd(8, 14500, 14500), // BS 3 -> anchor becomes n(7000)
      kd(79, 15000, 15000), // o -> 15000 - 7000 = 8000ms -> capped to 6000ms
      kd(32, 15200, 15200), // Space
      // Extra keys to exceed minLength=10
      kd(65, 15400, 15400), // a
      kd(66, 15600, 15600), // b
      kd(68, 15800, 15800), // d
      kd(69, 16000, 16000), // e
      kd(70, 16200, 16200), // f
      kd(71, 16400, 16400), // g
      commit("好呢哦了看都方个", 20, 16500, 20000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10); // h, c, n, o, a, b, d, e, f, g (wrong v,x,y,z excluded)
    equal(rec.e, 2); // c and o
    equal(rec.h[118], undefined); // 'v' popped
    equal(rec.h[120], undefined); // 'x' popped
    equal(rec.h[121], undefined); // 'y' popped
    equal(rec.h[122], undefined); // 'z' popped
    deepEqual(rec.h[99], { h: 1, m: 1, t: 5200 }); // 'c'
    deepEqual(rec.h[111], { h: 1, m: 1, t: 6000 }); // 'o' capped at 6000
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("treats > 3 consecutive backspaces as rewording without blaming replacement key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-reword-"));
  try {
    const lines = [
      kd(65, 100, 100), // a
      kd(66, 300, 300), // b
      kd(67, 500, 500), // c
      kd(68, 700, 700), // d
      kd(69, 900, 900), // e
      kd(8, 1100, 1100), // BS 1
      kd(8, 1250, 1250), // BS 2
      kd(8, 1400, 1400), // BS 3
      kd(8, 1550, 1550), // BS 4 -> >3 rewording!
      kd(75, 1750, 1750), // k (replacement after rewording, NOT blamed)
      kd(76, 1950, 1950), // l
      kd(77, 2150, 2150), // m
      kd(78, 2350, 2350), // n
      kd(79, 2550, 2550), // o
      kd(80, 2750, 2750), // p
      kd(81, 2950, 2950), // q
      kd(82, 3150, 3150), // r
      kd(83, 3350, 3350), // s
      commit("akmnopqrs", 18, 3400, 5000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.e, 1); // rewording records 1 episode error without blaming 'k'
    equal(rec.h[107]?.m, 0); // 'k' not penalized
    equal(rec.h[107]?.t, 0); // 'k' starts fresh without post-BS IKI noise
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("counts empty-stack post-space backspace as error without distorting next letter timeToType", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-emptybs-"));
  try {
    const lines = [
      kd(65, 100, 100), // a
      kd(66, 250, 250), // b
      kd(67, 400, 400), // c
      kd(32, 550, 550), // Space (flushes a,b,c -> stack now empty)
      kd(8, 900, 900), // BS on empty stack (selection error)
      kd(68, 1200, 1200), // d -> should NOT absorb BS gap as its IKI
      kd(69, 1350, 1350), // e
      kd(70, 1500, 1500), // f
      kd(71, 1650, 1650), // g
      kd(72, 1800, 1800), // h
      kd(73, 1950, 1950), // i
      kd(74, 2100, 2100), // j
      commit("好人定额风格和", 12, 2200, 5000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    equal(rec.e, 1); // empty-stack backspace recorded in overall errors
    equal(rec.h[100]?.m, 0); // 'd' not blamed
    equal(rec.h[100]?.t, 0); // 'd' has no post-selection IKI attached
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("filters leaked IME pinyin commits from en-us while keeping real English contractions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-pinyin-"));
  try {
    const leaked = ["ti'mu'bu'yan'j", "wo'xi'h", "'tu'r", "，bi'ru"];
    const lines: Record<string, unknown>[] = [];
    let mono = 100;
    let ts = 1000;
    for (const word of leaked) {
      for (let i = 0; i < 14; i++) {
        lines.push(kd(65 + (i % 10), mono, ts));
        mono += 150;
        ts += 150;
      }
      lines.push(commit(word, 14, mono + 50, ts + 50));
      mono += 500;
      ts += 500;
    }
    // Keep real English commit with standard contractions
    for (let i = 0; i < 10; i++) {
      lines.push(kd(65 + i, mono, ts));
      mono += 150;
      ts += 150;
    }
    lines.push(commit("don't it's", 10, mono + 50, ts + 50));

    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    equal(data.records[0].l, "en-us");
    equal(data.records[0].n, 10); // only "don't it's" survived
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("migrate=1 endpoint returns commitKeys covering legacy commits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-migrate-"));
  const prevEnv = process.env.KEYTRACE_EVENTS_DIR;
  process.env.KEYTRACE_EVENTS_DIR = dir;
  try {
    const lines = [
      // Leaked pinyin commit from v1 era (filtered in v2 records, still present in commitKeys!)
      kd(84, 100, 1000),
      kd(73, 250, 1150),
      kd(77, 400, 1300),
      kd(85, 550, 1450),
      kd(66, 700, 1600),
      kd(85, 850, 1750),
      kd(89, 1000, 1900),
      kd(65, 1150, 2050),
      kd(78, 1300, 2200),
      kd(74, 1450, 2350),
      commit("ti'mu'bu'y", 10, 1500, 10000),
      // Real English commit
      kd(65, 1700, 11000),
      kd(66, 1850, 11150),
      kd(67, 2000, 11300),
      kd(68, 2150, 11450),
      kd(69, 2300, 11600),
      kd(70, 2450, 11750),
      kd(71, 2600, 11900),
      kd(72, 2750, 12050),
      kd(73, 2900, 12200),
      kd(74, 3050, 12350),
      commit("abcdefghij", 10, 3100, 20000),
    ];
    await writeFile(join(dir, "2026-11-19.jsonl"), jsonl(lines), "utf8");

    const container = new Container();
    container.bind(HighScoresFactory).toValue(null!);
    container.bind(UserDataFactory).toValue(null!);
    const app = new Application(container).use(
      new Router().registerAll(allToRoutes(Controller)).middleware(),
    );
    const req = request.use(start(createTestServer(app.callback())));

    const res = await req.GET("/_/sync/keytrace?since=0&migrate=1").send();
    equal(res.status, 200);
    const body = await res.body.json<{
      syncVersion: number;
      records: unknown[];
      commitKeys: string[];
    }>();
    equal(body.syncVersion, 2);
    equal(body.records.length, 1);
    isTrue(body.commitKeys.includes("en-us:10"));
    isTrue(body.commitKeys.includes("en-us:20"));
  } finally {
    if (prevEnv === undefined) {
      delete process.env.KEYTRACE_EVENTS_DIR;
    } else {
      process.env.KEYTRACE_EVENTS_DIR = prevEnv;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("GET /_/keytrace/summary returns human-readable dashboard stats, apps, weakKeys, and corrections", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-dash-"));
  const prevEnv = process.env.KEYTRACE_EVENTS_DIR;
  process.env.KEYTRACE_EVENTS_DIR = dir;
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const baseTs = Date.now() - 2000;
    const lines = [
      { v: 1, ts: baseTs - 1000, mono: 10, ev: "meta", exe: "keytrace", text: "ime=shuangpin/xiaohe" },
      // Type 'h' (72) -> 'v' (86) -> BS (8) -> 'c' (67) -> commit "好" in msedge.exe
      { v: 1, ts: baseTs + 100, mono: 100, ev: "kd", sc: 35, vk: 72, mods: 0, exe: "msedge.exe", sid: "s1" },
      { v: 1, ts: baseTs + 250, mono: 250, ev: "kd", sc: 47, vk: 86, mods: 0, exe: "msedge.exe", sid: "s1" },
      { v: 1, ts: baseTs + 400, mono: 400, ev: "kd", sc: 14, vk: 8, mods: 0, exe: "msedge.exe", sid: "s1" },
      { v: 1, ts: baseTs + 550, mono: 550, ev: "kd", sc: 46, vk: 67, mods: 0, exe: "msedge.exe", sid: "s1" },
      { v: 1, ts: baseTs + 600, mono: 600, ev: "commit", exe: "msedge.exe", sid: "s1", text: "好", keys: 4 },
      // LockApp noise must be excluded
      { v: 1, ts: baseTs + 700, mono: 700, ev: "kd", sc: 2, vk: 49, mods: 0, exe: "LockApp.exe", sid: "s1" },
      { v: 1, ts: baseTs + 750, mono: 750, ev: "commit", exe: "LockApp.exe", sid: "s1", text: "1", keys: 1 },
    ];
    await writeFile(join(dir, `${today}.jsonl`), jsonl(lines), "utf8");

    const container = new Container();
    container.bind(HighScoresFactory).toValue(null!);
    container.bind(UserDataFactory).toValue(null!);
    const app = new Application(container).use(
      new Router().registerAll(allToRoutes(Controller)).middleware(),
    );
    const req = request.use(start(createTestServer(app.callback())));
    const res = await req.GET("/_/keytrace/summary?days=7").send();
    equal(res.status, 200);
    const body = await res.body.json<{
      status: { active: boolean; imeName: string | null; todayBytes: number };
      today: { totalKeys: number; zhKeys: number; corrections: number; commits: number };
      apps: { exe: string; totalKeys: number }[];
      weakKeys: { "zh-sp": { letter: string; misses: number }[] };
      recentCorrections: { wrongChar: string; rightChar: string; exe: string; contextText: string }[];
      recentCommits: { text: string; exe: string }[];
    }>();

    equal(body.status.active, true);
    equal(body.status.imeName, "shuangpin/xiaohe");
    isTrue(body.status.todayBytes > 0);
    equal(body.today.totalKeys, 2);
    equal(body.today.zhKeys, 2);
    equal(body.today.corrections, 1);
    equal(body.today.commits, 1);
    equal(body.apps.length, 1);
    equal(body.apps[0].exe, "msedge.exe");
    equal(body.recentCorrections.length, 1);
    equal(body.recentCorrections[0].wrongChar, "v");
    equal(body.recentCorrections[0].rightChar, "c");
    equal(body.recentCorrections[0].contextText, "好");
    equal(body.recentCommits.length, 1);
    equal(body.recentCommits[0].text, "好");
    const cMetric = body.weakKeys["zh-sp"].find((k) => k.letter === "C");
    equal(cMetric?.misses, 1);
  } finally {
    if (prevEnv === undefined) {
      delete process.env.KEYTRACE_EVENTS_DIR;
    } else {
      process.env.KEYTRACE_EVENTS_DIR = prevEnv;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveZhLayoutFromIme routes all Chinese schemes accurately and defaults others to zh-sp", () => {
  equal(resolveZhLayoutFromIme(null), "zh-sp");
  equal(resolveZhLayoutFromIme(undefined), "zh-sp");
  equal(resolveZhLayoutFromIme(""), "zh-sp");
  equal(resolveZhLayoutFromIme("shuangpin/xiaohe"), "zh-sp");
  equal(resolveZhLayoutFromIme("shuangpin/ziranma"), "zh-sp-zrm");
  equal(resolveZhLayoutFromIme("shuangpin/scheme-3"), "zh-sp-zrm");
  equal(resolveZhLayoutFromIme("shuangpin/microsoft"), "zh-sp-ms");
  equal(resolveZhLayoutFromIme("shuangpin/scheme-0"), "zh-sp-ms");
  equal(resolveZhLayoutFromIme("shuangpin/sogou"), "zh-sp-sg");
  equal(resolveZhLayoutFromIme("full-pinyin"), "zh-qp");
  equal(resolveZhLayoutFromIme("full-pinyin/ms"), "zh-qp");
  equal(resolveZhLayoutFromIme("FULL-PINYIN/rime"), "zh-qp");
  equal(resolveZhLayoutFromIme("quanpin"), "zh-qp");
  equal(resolveZhLayoutFromIme("ms-quanpin"), "zh-qp");
});

test("routes meta ime=full-pinyin commits to zh-qp and preserves IME across sinceTs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-zh-qp-"));
  try {
    const lines: Record<string, unknown>[] = [
      {
        v: 1,
        ts: 1700000000000,
        mono: 10,
        ev: "meta",
        exe: "keytrace",
        text: "ime=full-pinyin",
      },
    ];
    // Commit 1: "ni hao shi jie" (12 letters + digit '1' ignored for zh-qp)
    const firstVks = [78, 73, 72, 65, 79, 83, 72, 73, 74, 73, 69, 65, 49];
    let mono = 100;
    let ts = 1700000001000;
    for (const vk of firstVks) {
      lines.push(kd(vk, mono, ts, { sid: "s1", sessionStartTs: 1000 }));
      mono += 120;
      ts += 120;
    }
    lines.push(
      commit("你好世界", firstVks.length, mono + 50, 1700000010000, {
        sid: "s1",
        sessionStartTs: 1000,
      }),
    );

    // Commit 2 after sinceTs=1700000010000: "zhong wen quan" (11 letters)
    const secondVks = [90, 72, 79, 78, 71, 87, 69, 78, 81, 85, 65];
    mono += 500;
    ts = 1700000015000;
    for (const vk of secondVks) {
      lines.push(kd(vk, mono, ts, { sid: "s1", sessionStartTs: 1000 }));
      mono += 120;
      ts += 120;
    }
    lines.push(
      commit("中文全", secondVks.length, mono + 50, 1700000020000, {
        sid: "s1",
        sessionStartTs: 1000,
      }),
    );

    await writeFile(join(dir, "2026-11-20.jsonl"), jsonl(lines), "utf8");

    const full = await readKeyTraceSyncData({ eventsDir: dir });
    equal(full.records.length, 1);
    const fullRec = full.records[0];
    equal(fullRec.l, "zh-qp");
    equal(fullRec.n, 23); // digit '1' excluded for zh-qp
    equal(fullRec.h[49], undefined);
    const fullResult = resultFromJson(fullRec);
    isNotNull(fullResult);
    isTrue(Result.isValid(fullResult!));

    const incremental = await readKeyTraceSyncData({
      eventsDir: dir,
      sinceTs: 1700000010000,
    });
    equal(incremental.records.length, 1);
    equal(incremental.records[0].l, "zh-qp");
    equal(incremental.records[0].n, 11);
    equal(incremental.records[0].ts, 1700000020000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isolates same-day shuangpin (zh-sp), full-pinyin (zh-qp), and en-us commits into separate buckets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-mixed-day-"));
  try {
    const lines: Record<string, unknown>[] = [
      // Morning: Shuangpin (meta has no sid; commit sid "s10" sorts before "s2" lexicographically)
      {
        v: 1,
        ts: 1700000000500,
        mono: 10,
        ev: "meta",
        exe: "keytrace",
        text: "ime=shuangpin/xiaohe",
      },
    ];
    // Shuangpin keys: q w e r t y u i o p (10 letters)
    const spVks = [81, 87, 69, 82, 84, 89, 85, 73, 79, 80];
    for (let i = 0; i < spVks.length; i += 1) {
      lines.push(
        kd(spVks[i], 100 + i * 120, 1700000001000 + i * 120, { sid: "s10" }),
      );
    }
    lines.push(commit("双拼练习测试", spVks.length, 1500, 1700000005000, { sid: "s10" }));

    // Afternoon: Full Pinyin
    lines.push({
      v: 1,
      ts: 1700000010000,
      mono: 10,
      ev: "meta",
      exe: "keytrace",
      text: "ime=full-pinyin",
    });
    // Full-pinyin keys: a s d f g h j k l v z (11 letters, disjoint from spVks)
    const qpVks = [65, 83, 68, 70, 71, 72, 74, 75, 76, 86, 90];
    for (let i = 0; i < qpVks.length; i += 1) {
      lines.push(
        kd(qpVks[i], 200 + i * 130, 1700000011000 + i * 130, { sid: "s2" }),
      );
    }
    lines.push(commit("全拼练习测试", qpVks.length, 1800, 1700000015000, { sid: "s2" }));

    // Evening: English
    const enVks = [84, 89, 80, 69, 83, 67, 82, 73, 80, 84];
    for (let i = 0; i < enVks.length; i += 1) {
      lines.push(
        kd(enVks[i], 300 + i * 120, 1700000021000 + i * 120, { sid: "s3" }),
      );
    }
    lines.push(
      commit("typescript", enVks.length, 1600, 1700000025000, { sid: "s3" }),
    );

    await writeFile(join(dir, "2026-11-20.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 3);

    const spRec = data.records.find((r) => r.l === "zh-sp");
    const qpRec = data.records.find((r) => r.l === "zh-qp");
    const enRec = data.records.find((r) => r.l === "en-us");
    isNotNull(spRec ?? null);
    isNotNull(qpRec ?? null);
    isNotNull(enRec ?? null);

    equal(spRec!.n, 10);
    equal(spRec!.ts, 1700000005000);
    equal(spRec!.h[113]?.h, 1); // 'q' in zh-sp
    equal(spRec!.h[118], undefined); // 'v' not in zh-sp

    equal(qpRec!.n, 11);
    equal(qpRec!.ts, 1700000015000);
    equal(qpRec!.h[118]?.h, 1); // 'v' in zh-qp
    equal(qpRec!.h[113], undefined); // 'q' not in zh-qp

    equal(enRec!.n, 10);
    equal(enRec!.ts, 1700000025000);

    isTrue(Result.isValid(resultFromJson(spRec!)!));
    isTrue(Result.isValid(resultFromJson(qpRec!)!));
    isTrue(Result.isValid(resultFromJson(enRec!)!));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readKeyTraceDashboard aggregates zh-sp + zh-qp into zhKeys and isolates weakKeys per layout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-dash-qp-"));
  try {
    const empty = await readKeyTraceDashboard({ eventsDir: dir });
    deepEqual(empty.weakKeys, {
      "zh-sp": [],
      "zh-sp-zrm": [],
      "zh-sp-ms": [],
      "zh-sp-sg": [],
      "zh-qp": [],
      "en-us": [],
    });

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const baseTs = Date.now() - 5000;

    const lines: Record<string, unknown>[] = [
      // 1) Shuangpin: h(72) -> v(86) -> BS(8) -> c(67) => commit "好" (2 surviving keys)
      {
        v: 1,
        ts: baseTs - 2000,
        mono: 10,
        ev: "meta",
        exe: "keytrace",
        text: "ime=shuangpin/xiaohe",
      },
      { v: 1, ts: baseTs + 100, mono: 100, ev: "kd", sc: 35, vk: 72, mods: 0, exe: "code.exe", sid: "s1" },
      { v: 1, ts: baseTs + 220, mono: 220, ev: "kd", sc: 47, vk: 86, mods: 0, exe: "code.exe", sid: "s1" },
      { v: 1, ts: baseTs + 340, mono: 340, ev: "kd", sc: 14, vk: 8, mods: 0, exe: "code.exe", sid: "s1" },
      { v: 1, ts: baseTs + 460, mono: 460, ev: "kd", sc: 46, vk: 67, mods: 0, exe: "code.exe", sid: "s1" },
      { v: 1, ts: baseTs + 500, mono: 500, ev: "commit", exe: "code.exe", sid: "s1", text: "好", keys: 4 },

      // 2) Full Pinyin: l(76) -> x(88) -> BS(8) -> v(86) => commit "绿" (2 surviving keys)
      {
        v: 1,
        ts: baseTs + 1000,
        mono: 10,
        ev: "meta",
        exe: "keytrace",
        text: "ime=full-pinyin",
      },
      { v: 1, ts: baseTs + 1100, mono: 1100, ev: "kd", sc: 38, vk: 76, mods: 0, exe: "code.exe", sid: "s2" },
      { v: 1, ts: baseTs + 1220, mono: 1220, ev: "kd", sc: 45, vk: 88, mods: 0, exe: "code.exe", sid: "s2" },
      { v: 1, ts: baseTs + 1340, mono: 1340, ev: "kd", sc: 14, vk: 8, mods: 0, exe: "code.exe", sid: "s2" },
      { v: 1, ts: baseTs + 1460, mono: 1460, ev: "kd", sc: 47, vk: 86, mods: 0, exe: "code.exe", sid: "s2" },
      { v: 1, ts: baseTs + 1500, mono: 1500, ev: "commit", exe: "code.exe", sid: "s2", text: "绿", keys: 4 },

      // 3) English: a(65) -> b(66) -> d(68) => commit "abd" (3 surviving keys)
      { v: 1, ts: baseTs + 2100, mono: 2100, ev: "kd", sc: 30, vk: 65, mods: 0, exe: "code.exe", sid: "s3" },
      { v: 1, ts: baseTs + 2220, mono: 2220, ev: "kd", sc: 48, vk: 66, mods: 0, exe: "code.exe", sid: "s3" },
      { v: 1, ts: baseTs + 2340, mono: 2340, ev: "kd", sc: 32, vk: 68, mods: 0, exe: "code.exe", sid: "s3" },
      { v: 1, ts: baseTs + 2400, mono: 2400, ev: "commit", exe: "code.exe", sid: "s3", text: "abd", keys: 3 },
    ];

    await writeFile(join(dir, `${today}.jsonl`), jsonl(lines), "utf8");

    const dash = await readKeyTraceDashboard({ eventsDir: dir, days: 7 });

    equal(dash.status.imeName, "full-pinyin");
    // Both zh-sp (2) and zh-qp (2) count toward zhKeys (4); enKeys is strictly en-us (3).
    equal(dash.today.totalKeys, 7);
    equal(dash.today.zhKeys, 4);
    equal(dash.today.enKeys, 3);
    equal(dash.overall.zhKeys, 4);
    equal(dash.overall.enKeys, 3);
    equal(dash.daily.length, 1);
    equal(dash.daily[0].zhKeys, 4);
    equal(dash.daily[0].enKeys, 3);

    // App entry must also count both zh-sp and zh-qp under zhKeys.
    equal(dash.apps.length, 1);
    equal(dash.apps[0].exe, "code.exe");
    equal(dash.apps[0].totalKeys, 7);
    equal(dash.apps[0].zhKeys, 4);
    equal(dash.apps[0].enKeys, 3);

    // weakKeys are isolated across all three layouts.
    equal(dash.weakKeys["zh-sp"].find((k) => k.letter === "C")?.misses, 1);
    equal(dash.weakKeys["zh-sp"].find((k) => k.letter === "V"), undefined);
    equal(dash.weakKeys["zh-qp"].find((k) => k.letter === "V")?.misses, 1);
    equal(dash.weakKeys["zh-qp"].find((k) => k.letter === "C"), undefined);
    equal(dash.weakKeys["en-us"].length, 3);
    equal(dash.weakKeys["en-us"].find((k) => k.letter === "V"), undefined);

    const qpCorr = dash.recentCorrections.find((c) => c.layoutId === "zh-qp");
    const spCorr = dash.recentCorrections.find((c) => c.layoutId === "zh-sp");
    isNotNull(qpCorr ?? null);
    isNotNull(spCorr ?? null);
    equal(qpCorr!.wrongChar, "x");
    equal(qpCorr!.rightChar, "v");
    equal(spCorr!.wrongChar, "v");
    equal(spCorr!.rightChar, "c");

    isTrue(dash.recentCommits.some((c) => c.layoutId === "zh-qp" && c.text === "绿"));
    isTrue(dash.recentCommits.some((c) => c.layoutId === "zh-sp" && c.text === "好"));
    isTrue(dash.recentCommits.some((c) => c.layoutId === "en-us" && c.text === "abd"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("captures VK 186 (;) as 0x003b only for Microsoft/Sogou Shuangpin and ignores it for Xiaohe/Quanpin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-semi-"));
  try {
    const lines: Record<string, unknown>[] = [
      { v: 1, ts: 1700000000100, mono: 10, ev: "meta", exe: "keytrace", text: "ime=shuangpin/microsoft" },
      kd(74, 100, 1700000001000, { sid: "ms" }), // j
      kd(78, 250, 1700000001150, { sid: "ms" }), // n
      kd(88, 400, 1700000001300, { sid: "ms" }), // x
      kd(186, 550, 1700000001450, { sid: "ms" }), // ; (ing)
      kd(77, 700, 1700000001600, { sid: "ms" }), // m
      kd(90, 850, 1700000001750, { sid: "ms" }), // z
      kd(84, 1000, 1700000001900, { sid: "ms" }), // t
      kd(77, 1150, 1700000002050, { sid: "ms" }), // m
      kd(89, 1300, 1700000002200, { sid: "ms" }), // y
      kd(84, 1450, 1700000002350, { sid: "ms" }), // t
      commit("进行每天一同", 10, 1500, 1700000002400, { sid: "ms" }),

      { v: 1, ts: 1700000010100, mono: 10, ev: "meta", exe: "keytrace", text: "ime=shuangpin/xiaohe" },
      kd(74, 2000, 1700000011000, { sid: "xh" }), // j
      kd(66, 2150, 1700000011150, { sid: "xh" }), // b
      kd(88, 2300, 1700000011300, { sid: "xh" }), // x
      kd(186, 2450, 1700000011450, { sid: "xh" }), // ; -> ignored punctuation in Xiaohe
      kd(75, 2600, 1700000011600, { sid: "xh" }), // k
      kd(77, 2750, 1700000011750, { sid: "xh" }), // m
      kd(87, 2900, 1700000011900, { sid: "xh" }), // w
      kd(84, 3050, 1700000012050, { sid: "xh" }), // t
      kd(77, 3200, 1700000012200, { sid: "xh" }), // m
      kd(89, 3350, 1700000012350, { sid: "xh" }), // y
      kd(84, 3500, 1700000012500, { sid: "xh" }), // t
      commit("进行；每天一", 11, 3550, 1700000013000, { sid: "xh" }),
    ];

    await writeFile(join(dir, "2026-11-24.jsonl"), jsonl(lines), "utf8");

    const sync = await readKeyTraceSyncData({ eventsDir: dir });
    const msRec = sync.records.find((r) => r.l === "zh-sp-ms");
    const xhRec = sync.records.find((r) => r.l === "zh-sp");
    isNotNull(msRec ?? null);
    isNotNull(xhRec ?? null);
    equal(msRec!.h[0x003b]?.h, 1);
    equal(xhRec!.h[0x003b], undefined);

    const dash = await readKeyTraceDashboard({ eventsDir: dir, days: 7 });
    equal(dash.weakKeys["zh-sp-ms"].find((k) => k.codePoint === 0x003b)?.letter, ";");
    equal(dash.weakKeys["zh-sp"].find((k) => k.codePoint === 0x003b), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("carries lastMono across <=3000ms same-session commits for activeMs and k1 IKI, while dropping >3000ms pauses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-carry-"));
  try {
    const lines = [
      // Commit 1: a(65)@100 -> b(66)@250 (intra = 150ms)
      kd(65, 100, 1000, { sid: "s1", sessionStartTs: 1000 }),
      kd(66, 250, 1150, { sid: "s1", sessionStartTs: 1000 }),
      commit("好", 2, 260, 1200, { sid: "s1", sessionStartTs: 1000 }),
      // Commit 2 (400ms after b(250)): c(67)@650 -> d(68)@800 (inter=400ms, intra=150ms)
      kd(67, 650, 1650, { sid: "s1", sessionStartTs: 1000 }),
      kd(68, 800, 1800, { sid: "s1", sessionStartTs: 1000 }),
      commit("吗", 2, 810, 1850, { sid: "s1", sessionStartTs: 1000 }),
      // Commit 3 (5000ms pause after d(800)): e(69)@5800 -> f(70)@5950 -> g(71)..j(74) (intra only)
      kd(69, 5800, 6800, { sid: "s1", sessionStartTs: 1000 }),
      kd(70, 5950, 6950, { sid: "s1", sessionStartTs: 1000 }),
      kd(71, 6100, 7100, { sid: "s1", sessionStartTs: 1000 }),
      kd(72, 6250, 7250, { sid: "s1", sessionStartTs: 1000 }),
      kd(73, 6400, 7400, { sid: "s1", sessionStartTs: 1000 }),
      kd(74, 6550, 7550, { sid: "s1", sessionStartTs: 1000 }),
      commit("你我他她它啊", 6, 6560, 7600, { sid: "s1", sessionStartTs: 1000 }),
    ];
    await writeFile(join(dir, "2026-11-24.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    // Commit 1: 150ms, Commit 2: 400+150=550ms, Commit 3: 5*150=750ms (5000ms pause dropped) -> total 1450ms
    equal(rec.t, 1450);
    // Commit 2 first key 'c' (99) received inter-commit IKI 400ms
    equal(rec.h[99]?.t, 400);
    // Commit 3 first key 'e' (101) had >3000ms pause so IKI is 0
    equal(rec.h[101]?.t, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("incremental sinceTs sync preserves inter-commit lastMono from skipped earlier commits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-since-carry-"));
  try {
    const lines = [
      // Commit 1 (<= sinceTs=2000): ended at mono=250
      kd(65, 100, 1000, { sid: "s1", sessionStartTs: 1000 }),
      kd(66, 250, 1150, { sid: "s1", sessionStartTs: 1000 }),
      commit("好", 2, 260, 2000, { sid: "s1", sessionStartTs: 1000 }),
      // Commit 2 (> sinceTs=2000): starts 300ms later at mono=550, 10 keys total
      kd(67, 550, 2550, { sid: "s1", sessionStartTs: 1000 }),
      kd(68, 700, 2700, { sid: "s1", sessionStartTs: 1000 }),
      kd(69, 850, 2850, { sid: "s1", sessionStartTs: 1000 }),
      kd(70, 1000, 3000, { sid: "s1", sessionStartTs: 1000 }),
      kd(71, 1150, 3150, { sid: "s1", sessionStartTs: 1000 }),
      kd(72, 1300, 3300, { sid: "s1", sessionStartTs: 1000 }),
      kd(73, 1450, 3450, { sid: "s1", sessionStartTs: 1000 }),
      kd(74, 1600, 3600, { sid: "s1", sessionStartTs: 1000 }),
      kd(75, 1750, 3750, { sid: "s1", sessionStartTs: 1000 }),
      kd(76, 1900, 3900, { sid: "s1", sessionStartTs: 1000 }),
      commit("你我他她它", 10, 1910, 4000, { sid: "s1", sessionStartTs: 1000 }),
    ];
    await writeFile(join(dir, "2026-11-24.jsonl"), jsonl(lines), "utf8");

    const inc = await readKeyTraceSyncData({ eventsDir: dir, sinceTs: 2000 });
    equal(inc.records.length, 1);
    const rec = inc.records[0];
    equal(rec.n, 10);
    // 300ms carried gap + 9*150ms intra = 1650ms
    equal(rec.t, 1650);
    // First key 'c' (99) got 300ms IKI from Commit 1
    equal(rec.h[99]?.t, 300);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isolates inter-commit lastMono across different layouts within same session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-layout-iso-"));
  try {
    const lines = [
      // Commit 1 (zh-sp): ended at mono=250
      kd(65, 100, 1000, { sid: "s1", sessionStartTs: 1000 }),
      kd(66, 250, 1150, { sid: "s1", sessionStartTs: 1000 }),
      commit("好", 2, 260, 1200, { sid: "s1", sessionStartTs: 1000 }),
      // Commit 2 (en-us, 300ms after Commit 1): should NOT carry zh-sp lastMono
      kd(67, 550, 1550, { sid: "s1", sessionStartTs: 1000 }),
      kd(68, 700, 1700, { sid: "s1", sessionStartTs: 1000 }),
      kd(69, 850, 1850, { sid: "s1", sessionStartTs: 1000 }),
      kd(70, 1000, 2000, { sid: "s1", sessionStartTs: 1000 }),
      kd(71, 1150, 2150, { sid: "s1", sessionStartTs: 1000 }),
      kd(72, 1300, 2300, { sid: "s1", sessionStartTs: 1000 }),
      kd(73, 1450, 2450, { sid: "s1", sessionStartTs: 1000 }),
      kd(74, 1600, 2600, { sid: "s1", sessionStartTs: 1000 }),
      kd(75, 1750, 2750, { sid: "s1", sessionStartTs: 1000 }),
      kd(76, 1900, 2900, { sid: "s1", sessionStartTs: 1000 }),
      commit("cdefghijkl", 10, 1910, 3000, { sid: "s1", sessionStartTs: 1000 }),
    ];
    await writeFile(join(dir, "2026-11-24.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    const enRec = data.records.find((r) => r.l === "en-us");
    isNotNull(enRec ?? null);
    equal(enRec!.t, 9 * 150); // 1350ms only, no 300ms cross-layout carry
    equal(enRec!.h[99]?.t, 0); // 'c' has no cross-layout IKI
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("records aborted pending corrections (BS+Space, BS exhausting stack, empty-stack >3 BS) as 1 error without double counting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-abort-corr-"));
  try {
    const lines = [
      // Episode 1: a, b, c, BS, BS (corrActive=true), Space (aborts corrActive -> 1 error)
      kd(65, 100, 1000, { sid: "s1" }),
      kd(66, 250, 1150, { sid: "s1" }),
      kd(67, 400, 1300, { sid: "s1" }),
      kd(8, 550, 1450, { sid: "s1" }),
      kd(8, 700, 1600, { sid: "s1" }),
      kd(32, 850, 1750, { sid: "s1" }), // Space -> stack empty, aborted corrActive = 1 error
      // Episode 2: empty-stack 4 BS -> 1 error (no double-count at BS 4)
      kd(8, 1000, 1900, { sid: "s1" }),
      kd(8, 1150, 2050, { sid: "s1" }),
      kd(8, 1300, 2200, { sid: "s1" }),
      kd(8, 1450, 2350, { sid: "s1" }),
      // Episode 3: d, BS, BS (1st pops d, 2nd hits empty stack while corrActive=true -> 1 error)
      kd(68, 1600, 2500, { sid: "s1" }),
      kd(8, 1750, 2650, { sid: "s1" }),
      kd(8, 1900, 2800, { sid: "s1" }),
      // Remaining 9 valid keys -> total 10 surviving keys ('a' + 9)
      kd(69, 2050, 2950, { sid: "s1" }),
      kd(70, 2200, 3100, { sid: "s1" }),
      kd(71, 2350, 3250, { sid: "s1" }),
      kd(72, 2500, 3400, { sid: "s1" }),
      kd(73, 2650, 3550, { sid: "s1" }),
      kd(74, 2800, 3700, { sid: "s1" }),
      kd(75, 2950, 3850, { sid: "s1" }),
      kd(76, 3100, 4000, { sid: "s1" }),
      kd(77, 3250, 4150, { sid: "s1" }),
      commit("aefghijklm", 22, 3300, 4200, { sid: "s1" }),
    ];
    await writeFile(join(dir, "2026-11-24.jsonl"), jsonl(lines), "utf8");

    const data = await readKeyTraceSyncData({ eventsDir: dir });
    equal(data.records.length, 1);
    const rec = data.records[0];
    equal(rec.n, 10);
    equal(rec.e, 3); // Episode 1 (1) + Episode 2 (1) + Episode 3 (1)
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
