#!/usr/bin/env -S npx tsnode

/**
 * Imports KeyTrace per-key statistics (`%USERPROFILE%\.keytrace\stats.json`)
 * into a local keybr instance.
 *
 * There is no import endpoint in keybr. The only supported write channel is the
 * one the web client itself uses: `POST /_/sync/data` with an
 * `application/octet-stream` body produced by `formatMessage()`. The server
 * decodes it, filters with `Result.validate()` and appends the survivors to
 * `DATA_DIR/user_stats/<id 前3>/<id 中3>/<id 补零9位>`.
 * Background: `docs/IMPORT.md`. Operating manual: `docs/IMPORT-HOWTO.md`.
 *
 * Usage:
 *
 *     npx tsnode scripts/import-keytrace.ts            # dry run (default)
 *     npx tsnode scripts/import-keytrace.ts --send     # actually upload
 *
 * Environment (only needed for --send):
 *
 *     KEYBR_COOKIE   the `session` cookie of the logged in user, either
 *                    `abc123` or the whole `session=abc123` header value.
 *     KEYBR_URL      defaults to `http://localhost:3000`.
 *     DATA_DIR       must be the same directory the running server uses,
 *                    otherwise the duplicate-import guard cannot work.
 *
 * WHY IT REFUSES TO RUN TWICE: appending is not idempotent. `KeyStats` applies
 * an alpha=0.1 exponential filter to `timeToType` and keeps the minimum in
 * `bestTimeToType`, so a second append moves every key closer to the last
 * imported value and the numbers stop matching KeyTrace. A marker file is
 * written after a successful import and blocks further runs until it is
 * removed by hand (see the rollback section of `docs/IMPORT-HOWTO.md`).
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
/* eslint-disable n/no-extraneous-import -- 一次性脚本直接复用仓库内的 workspace 包 */
import { Layout } from "@keybr/keyboard";
import { Result, speedToTime, TextType } from "@keybr/result";
import { formatMessage, parseFile } from "@keybr/result-io";
import { Histogram } from "@keybr/textinput";
/* eslint-enable n/no-extraneous-import */

/**
 * Size of the scramble prefix of `formatMessage()`: u32 key + u32 crc32.
 * See `packages/keybr-binary/lib/secret.ts`. We never write these bytes by hand,
 * `formatMessage()` does it for us; the constant is only used for reporting.
 * The key is random, so the same record produces different bytes on every run
 * (the sha256 in the report is only good for identifying that one payload).
 */
const SCRAMBLE_PREFIX_SIZE = 8;

const USER_STATS_DIR = "user_stats";
const MARKER_NAME = "keytrace-import.marker";

/**
 * Bounds enforced by `validateSample()` in
 * `packages/keybr-textinput/lib/histogram.ts`. A sample outside of this range
 * makes `Histogram.validate()` fail, and the server then silently drops the
 * whole record (it still answers 204), so we clamp instead of losing data.
 */
const MIN_TIME_TO_TYPE = 40;
const MAX_TIME_TO_TYPE = 12000;

/**
 * keybr's default target speed, see `packages/keybr-lesson/lib/settings.ts`.
 * `confidence = speedToTime(175) / timeToType`, and a key is only unlocked in
 * guided mode when `confidence >= 1`.
 */
const DEFAULT_TARGET_SPEED = 175;

const USAGE = `用法: npx tsnode scripts/import-keytrace.ts [选项]

  --send            真正上传（默认只做 dry run）
  --dry-run         只打印将要发送的内容（默认行为）
  --stats <path>    KeyTrace 统计文件，默认 %USERPROFILE%\\.keytrace\\stats.json
  --layout <id>     目标键盘布局，默认 en-us（中文小鹤双拼用 zh-sp，中文全拼用 zh-qp）
  --force           忽略已导入标记，用于换布局再导一次
  --data-dir <path> 服务端 DATA_DIR，默认取 $DATA_DIR，再退回 /var/lib/keybr
  --url <url>       keybr 地址，默认 $KEYBR_URL 或 http://localhost:3000
  -h, --help        显示帮助`;

type Options = {
  readonly send: boolean;
  readonly statsFile: string;
  readonly dataDir: string;
  readonly baseUrl: string;
  /** 目标键盘布局，默认 en-us。中文小鹤双拼用 zh-sp，中文全拼用 zh-qp。 */
  readonly layout: string;
  /** 忽略「已导入」标记，用于换布局再导一次 */
  readonly force: boolean;
};

/**
 * The subset of `stats.json` this script actually reads.
 * Full schema: `docs/stats-schema.md` in the KeyTrace repository.
 */
type KeyTraceKey = {
  readonly vk: number;
  readonly name: string;
  readonly role: string;
  readonly presses: number;
  readonly typos: number;
  readonly ikiP50Ms: number;
};

type KeyTraceStats = {
  readonly v: number;
  readonly generatedAt: string;
  readonly window: {
    readonly from: string;
    readonly to: string;
    readonly days: number;
  };
  readonly baseline: {
    readonly textActiveMs: number;
    readonly ikiP50Ms: number;
    readonly cpm: number;
  };
  readonly totals: {
    readonly keystrokes: number;
    readonly typos: number;
  };
  readonly keys: readonly KeyTraceKey[];
};

/** One mapped histogram sample, kept in the KeyTrace order for reporting. */
type Row = {
  readonly name: string;
  readonly vk: number;
  readonly codePoint: number;
  readonly hitCount: number;
  readonly missCount: number;
  /** The value from `stats.json`, before clamping. */
  readonly sourceTimeToType: number;
  /** The value actually sent, always valid for keybr. */
  readonly timeToType: number;
};

type Conversion = {
  readonly result: Result;
  readonly rows: readonly Row[];
  readonly skipped: readonly KeyTraceKey[];
  readonly withoutTiming: readonly string[];
  readonly clamped: readonly string[];
};

type Snapshot = Map<string, number>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv);

  // The running server pins DATA_DIR in keybr-server.bat. This process cannot
  // read the environment of another process, so the value has to be supplied
  // again here; a wrong value would silently defeat the duplicate guard.
  // TODO: 用一次实测确认服务端真实使用的 DATA_DIR，见 docs/IMPORT-HOWTO.md
  //       的「未确认项」一节（判据：导入后 user_stats 下哪个文件变大）。
  if (!existsSync(options.dataDir)) {
    throw new Error(
      [
        `DATA_DIR 不存在: ${options.dataDir}`,
        `必须与正在运行的服务进程一致（keybr-server.bat 里设为 %USERPROFILE%\\keybr.com\\data）。`,
        `请先在同一 shell 里 set DATA_DIR=%USERPROFILE%\\keybr.com\\data，或显式传 --data-dir。`,
      ].join("\n"),
    );
  }

  const markerFile = join(options.dataDir, USER_STATS_DIR, MARKER_NAME);
  if (!options.force && existsSync(markerFile)) {
    throw new Error(
      [
        `拒绝重复导入：已存在导入标记 ${markerFile}`,
        ``,
        `keybr 的 KeyStats 用 alpha=0.1 的指数平滑，重复 append 不是幂等操作：`,
        `每导一次 timeToType 都会向新样本靠拢，bestTimeToType 只会更低。`,
        `（证据：packages/keybr-result/lib/keystats.ts，docs/IMPORT.md §1.4 与 §5）`,
        ``,
        `确实要重导，先按 docs/IMPORT-HOWTO.md 的「回滚」一节把数据撤掉，再删除该标记文件。`,
      ].join("\n"),
    );
  }

  const stats = readStats(options.statsFile);
  const conversion = convert(stats, options.layout);
  const { result } = conversion;

  if (!result.validate()) {
    throw new Error(
      `生成的记录未通过 Result.validate()，服务端会静默丢弃：\n  ${describeInvalid(result).join("\n  ")}`,
    );
  }

  const payload = formatMessage([result]);
  const sha256 = createHash("sha256").update(payload).digest("hex");

  printReport(options, markerFile, stats, conversion, payload, sha256);

  if (!options.send) {
    console.log("");
    console.log("DRY RUN 结束，没有发送任何请求。");
    console.log("确认无误后加 --send 真正上传（追加写入，不可撤销）。");
    return;
  }

  const cookie = readCookie();
  const before = snapshotUserStats(options.dataDir);
  if (before.size > 0) {
    console.log("");
    console.log(
      `注意: user_stats 里已有 ${before.size} 个统计文件，本次记录会追加到登录用户那一个。`,
    );
    console.log(
      `      已有记录不会被覆盖，但 KeyStats 的指数平滑会把展示速度向本次样本拉动（docs/IMPORT.md §1.4）。`,
    );
  }

  console.log("");
  console.log(`POST ${options.baseUrl}/_/sync/data ...`);
  const response = await fetch(`${options.baseUrl}/_/sync/data`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "cookie": cookie,
    },
    // `formatMessage()` returns a view over a plain `ArrayBuffer`, but TS 5.9
    // types it as `Uint8Array<ArrayBufferLike>`, which is not a `BodyInit`.
    body: payload as Uint8Array<ArrayBuffer>,
  });
  const status = response.status;
  if (status === 403) {
    throw new Error(
      [
        `导入失败: 403 Forbidden —— cookie 无效或已过期。`,
        `登录态存在 DATA_DIR/sessions 里，token 有 24 小时有效期。`,
        `请重新打开 http://localhost:3000/login/xyz 登录，再复制新的 session cookie。`,
      ].join("\n"),
    );
  }
  if (status === 400) {
    throw new Error(
      `导入失败: 400 Bad Request —— 服务端解不开这份二进制（多半是格式版本不匹配，见 docs/IMPORT.md §1.2）。`,
    );
  }
  if (status === 415) {
    throw new Error(
      `导入失败: 415 Unsupported Media Type —— Content-Type 必须是 application/octet-stream。`,
    );
  }
  if (status !== 204) {
    throw new Error(`导入失败: 意外的状态码 ${status}`);
  }

  const written = diffSnapshots(before, snapshotUserStats(options.dataDir));
  const verification = await verify(options.baseUrl, cookie, result);

  const marker = {
    tool: "scripts/import-keytrace.ts",
    importedAt: new Date().toISOString(),
    statsFile: options.statsFile,
    statsGeneratedAt: stats.generatedAt,
    window: stats.window,
    record: {
      layout: result.layout.id,
      textType: result.textType.id,
      timeStamp: new Date(result.timeStamp).toISOString(),
      length: result.length,
      time: result.time,
      errors: result.errors,
      complexity: result.complexity,
      speed: result.speed,
    },
    payload: {
      bytes: payload.byteLength,
      sha256,
    },
    userStats: written,
    verification,
  };
  mkdirSync(dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, `${JSON.stringify(marker, null, 2)}\n`);

  console.log("");
  console.log(`POST /_/sync/data -> ${status}`);
  console.log(`GET  校验结果     : ${verification}`);
  if (written.length === 0) {
    console.log(
      `写入的文件        : 未检测到变化 —— DATA_DIR 可能与服务进程不一致，按上一条校验结果判断。`,
    );
  } else {
    for (const { file, previousSize } of written) {
      console.log(
        `写入的文件        : ${file}（导入前: ${previousSize == null ? "不存在" : `${previousSize} 字节`}）`,
      );
    }
  }
  console.log(`标记文件已写入    : ${markerFile}`);
  console.log("");
  console.log(
    `下一步: 刷新 ${options.baseUrl}/practice 与 ${options.baseUrl}/profile 验证，`,
  );
  console.log(`       验证与回滚步骤见 docs/IMPORT-HOWTO.md。`);
}

// --------------------------------------------------------------------------
// Command line
// --------------------------------------------------------------------------

function parseOptions(argv: readonly string[]): Options {
  let mode: boolean | null = null;
  let statsFile = join(homedir(), ".keytrace", "stats.json");
  let dataDir: string | null = null;
  let baseUrl = process.env.KEYBR_URL ?? "http://localhost:3000";
  let layout = "en-us";
  let force = false;

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--send":
        if (mode === false) {
          throw new Error(`--dry-run 和 --send 不能同时使用。\n\n${USAGE}`);
        }
        mode = true;
        break;
      case "--dry-run":
        if (mode === true) {
          throw new Error(`--dry-run 和 --send 不能同时使用。\n\n${USAGE}`);
        }
        mode = false;
        break;
      case "--stats":
        statsFile = nextValue(args, ++i, arg);
        break;
      case "--layout":
        layout = nextValue(args, ++i, arg);
        break;
      case "--force":
        force = true;
        break;
      case "--data-dir":
        dataDir = nextValue(args, ++i, arg);
        break;
      case "--url":
        baseUrl = nextValue(args, ++i, arg);
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数: ${arg}\n\n${USAGE}`);
    }
  }

  return {
    send: mode ?? false,
    statsFile,
    dataDir: resolveDataDir(dataDir),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    layout,
    force,
  };
}

function nextValue(
  args: readonly string[],
  index: number,
  name: string,
): string {
  const value = args[index];
  if (value == null || value.startsWith("-")) {
    throw new Error(`参数 ${name} 缺少取值`);
  }
  return value;
}

/** Same resolution rules as `Env.getPath()` in `packages/keybr-config/lib/env.ts`. */
function resolveDataDir(explicit: string | null): string {
  const value = explicit ?? process.env.DATA_DIR ?? "/var/lib/keybr";
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return resolve(join(homedir(), value.substring(2)));
  }
  return resolve(value);
}

// --------------------------------------------------------------------------
// Reading and converting
// --------------------------------------------------------------------------

function readStats(path: string): KeyTraceStats {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err: any) {
    throw new Error(`读不到 KeyTrace 统计文件 ${path}: ${err?.message ?? err}`);
  }
  let stats: KeyTraceStats;
  try {
    stats = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`${path} 不是合法 JSON: ${err?.message ?? err}`);
  }
  if (stats.v !== 1) {
    throw new Error(
      `不支持的 stats.json 版本 v=${String(stats.v)}，本脚本只认 v=1（见 docs/stats-schema.md）。`,
    );
  }
  if (!Array.isArray(stats.keys)) {
    throw new Error(`${path} 缺少 keys[]，无法映射逐键统计。`);
  }
  if (
    !Number.isFinite(stats.baseline?.textActiveMs) ||
    stats.baseline.textActiveMs <= 0
  ) {
    throw new Error(
      `${path} 的 baseline.textActiveMs 缺失或非正数，无法作为会话时长。`,
    );
  }
  return stats;
}

/**
 * Maps a Windows virtual key code to a Unicode code point.
 * Letters use `97 + (vk - 65)`; the top row digits map to themselves.
 * Everything else (Backspace, Enter, symbols, numpad digits) is skipped,
 * because keybr's guided lesson only exercises letters and digits.
 */
function toCodePoint(vk: number): number | null {
  if (vk >= 65 && vk <= 90) {
    return 97 + (vk - 65);
  }
  if (vk >= 48 && vk <= 57) {
    return vk;
  }
  return null;
}

function convert(stats: KeyTraceStats, layoutId: string): Conversion {
  const rows: Row[] = [];
  const skipped: KeyTraceKey[] = [];
  const withoutTiming: string[] = [];
  const clamped: string[] = [];

  for (const key of stats.keys) {
    const codePoint = toCodePoint(key.vk);
    const hitCount = Math.round(key.presses);
    if (codePoint == null || !(hitCount > 0)) {
      skipped.push(key);
      continue;
    }
    // `typos` counts only confirmed corrections (`docs/stats-schema.md`),
    // which is exactly what keybr stores in `missCount`.
    const missCount = Math.min(hitCount, Math.max(0, Math.round(key.typos)));
    const sourceTimeToType = Math.round(key.ikiP50Ms);
    let timeToType = 0;
    if (sourceTimeToType > 0) {
      timeToType = Math.min(
        MAX_TIME_TO_TYPE,
        Math.max(MIN_TIME_TO_TYPE, sourceTimeToType),
      );
      if (timeToType !== sourceTimeToType) {
        clamped.push(`${key.name} ${sourceTimeToType}→${timeToType}ms`);
      }
    } else {
      // 0 is allowed by keybr and means "no timing samples for this key".
      withoutTiming.push(key.name);
    }
    rows.push({
      name: key.name,
      vk: key.vk,
      codePoint,
      hitCount,
      missCount,
      sourceTimeToType,
      timeToType,
    });
  }

  if (rows.length < 3) {
    throw new Error(
      `只映射出 ${rows.length} 个键，keybr 要求直方图至少 3 个样本（Histogram.validate）。`,
    );
  }

  const length = rows.reduce((sum, row) => sum + row.hitCount, 0);
  const errors = rows.reduce((sum, row) => sum + row.missCount, 0);
  const time = Math.round(stats.baseline.textActiveMs);

  if (length < Result.filter.minLength) {
    throw new Error(
      `length=${length} 小于 keybr 的下限 ${Result.filter.minLength}。`,
    );
  }
  if (time < Result.filter.minTime) {
    throw new Error(
      `time=${time}ms 小于 keybr 的下限 ${Result.filter.minTime}ms。`,
    );
  }

  // Single aggregated record on purpose: with one sample the exponential filter
  // is a no-op, so keybr sees exactly the KeyTrace numbers (docs/IMPORT.md §5).
  const result = new Result(
    Layout.ALL.get(layoutId),
    TextType.GENERATED,
    parseTimestamp(stats.generatedAt),
    length,
    time,
    errors,
    new Histogram(
      rows.map(({ codePoint, hitCount, missCount, timeToType }) => ({
        codePoint,
        hitCount,
        missCount,
        timeToType,
      })),
    ),
  );

  // TODO: 若要让高错误率键变成 focus 键，需要把 typoRate 折算进 timeToType
  //       （docs/IMPORT.md §1.5，`timeToType_effective = tt * (1 + k * rate)`）。
  //       本轮按约定只映射 ikiP50Ms，因此 keybr 只能看到速度，看不到错误率。

  return { result, rows, skipped, withoutTiming, clamped };
}

function parseTimestamp(value: string): number {
  const timeStamp = Date.parse(value);
  if (!Number.isFinite(timeStamp) || timeStamp <= 0) {
    throw new Error(
      `stats.json 的 generatedAt 无法解析为时间戳: ${String(value)}`,
    );
  }
  return timeStamp;
}

function describeInvalid(result: Result): string[] {
  const problems: string[] = [];
  if (result.length < Result.filter.minLength) {
    problems.push(`length=${result.length} < ${Result.filter.minLength}`);
  }
  if (result.time < Result.filter.minTime) {
    problems.push(`time=${result.time} < ${Result.filter.minTime}`);
  }
  if (result.complexity < Result.filter.minComplexity) {
    problems.push(
      `complexity=${result.complexity} < ${Result.filter.minComplexity}`,
    );
  }
  if (!(
    result.speed >= Result.filter.minSpeed &&
    result.speed <= Result.filter.maxSpeed
  )) {
    problems.push(`speed=${result.speed} 越界`);
  }
  if (!result.histogram.validate()) {
    problems.push(
      `histogram 校验失败：样本数 ${result.complexity}（需 >= 3）或有 timeToType 越界`,
    );
  }
  return problems;
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------

function printReport(
  options: Options,
  markerFile: string,
  stats: KeyTraceStats,
  conversion: Conversion,
  payload: Uint8Array,
  sha256: string,
): void {
  const { result, rows, skipped, withoutTiming, clamped } = conversion;
  const target = speedToTime(DEFAULT_TARGET_SPEED);

  console.log("=== KeyTrace → keybr 导入 ===");
  console.log(
    `模式            : ${options.send ? "SEND（会向服务端写入）" : "DRY RUN（不发任何请求）"}`,
  );
  console.log(`源文件          : ${options.statsFile}`);
  console.log(
    `统计窗口        : ${stats.window.from} .. ${stats.window.to}（${stats.window.days} 天）`,
  );
  console.log(`generatedAt     : ${stats.generatedAt}`);
  console.log(`DATA_DIR        : ${options.dataDir}`);
  console.log(`标记文件        : ${markerFile}（不存在）`);
  console.log(`目标地址        : ${options.baseUrl}/_/sync/data`);
  console.log(
    `cookie          : ${process.env.KEYBR_COOKIE ? "已设置 KEYBR_COOKIE" : "未设置（--send 前必须设置）"}`,
  );

  console.log("");
  console.log("--- 将要发送的记录 ---");
  console.log(
    `layout          : ${result.layout.id} (xid 0x${result.layout.xid.toString(16)})`,
  );
  console.log(
    `textType        : ${result.textType.id} (xid ${result.textType.xid})`,
  );
  console.log(
    `timeStamp       : ${new Date(result.timeStamp).toISOString()}（格式只存到秒）`,
  );
  console.log(`length          : ${result.length}  (ΣhitCount)`);
  console.log(`time            : ${result.time} ms  (baseline.textActiveMs)`);
  console.log(`errors          : ${result.errors}  (ΣmissCount)`);
  console.log(
    `speed           : ${result.speed.toFixed(1)} CPM  (= length / time * 60000)`,
  );
  console.log(`complexity      : ${result.complexity} 键`);
  console.log(`validate()      : ${result.validate() ? "true" : "FALSE"}`);

  console.log("");
  console.log("code  key  hit   miss  timeToType  confidence");
  for (const row of [...rows].sort((a, b) => a.codePoint - b.codePoint)) {
    const confidence = row.timeToType > 0 ? target / row.timeToType : null;
    console.log(
      [
        String(row.codePoint).padStart(4),
        ` ${row.name}`.padEnd(4),
        String(row.hitCount).padStart(5),
        String(row.missCount).padStart(6),
        `${row.timeToType}ms`.padStart(11),
        confidence == null
          ? "         n/a"
          : confidence.toFixed(2).padStart(12),
      ].join(" "),
    );
  }

  const letters = [...rows].filter(
    (row) => row.codePoint >= 97 && row.codePoint <= 122,
  );
  const confident = letters.filter(
    (row) => row.timeToType > 0 && target / row.timeToType >= 1,
  );
  const slow = letters
    .filter((row) => row.timeToType === 0 || target / row.timeToType < 1)
    .sort((a, b) => b.timeToType - a.timeToType);

  console.log("");
  console.log("--- 统计 ---");
  console.log(
    `参与映射        : ${rows.length}/${stats.keys.length} 键（只映射 a-z 与主键盘 0-9）`,
  );
  console.log(
    `跳过            : ${skipped.length} 键${summarizeSkipped(skipped)}`,
  );
  console.log(
    `无计时样本      : ${withoutTiming.length === 0 ? "无" : `${withoutTiming.length} 键 ${withoutTiming.join(",")}（timeToType=0）`}`,
  );
  console.log(
    `被夹到 40-12000 : ${clamped.length === 0 ? "无" : clamped.join(", ")}`,
  );
  console.log(
    `字母达速        : ${confident.length}/${letters.length}（confidence >= 1.00，即 timeToType <= ${target.toFixed(0)}ms）`,
  );
  if (slow.length > 0) {
    console.log(
      `未达速 / 无计时 : ${slow
        .map(
          (row) =>
            `${row.name}(${row.timeToType > 0 ? `${row.timeToType}ms` : "n/a"})`,
        )
        .join(", ")}`,
    );
  } else {
    console.log(`未达速 / 无计时 : 无，练习页会显示 "All keys are unlocked."`);
  }

  console.log("");
  console.log("--- 载荷 ---");
  console.log(
    `formatMessage   : ${payload.byteLength} 字节（scramble ${SCRAMBLE_PREFIX_SIZE} + header 8 + 记录 ${payload.byteLength - SCRAMBLE_PREFIX_SIZE - 8}）`,
  );
  // The file on disk is header + records; the scramble prefix only exists on the wire.
  const recordBytes = payload.byteLength - SCRAMBLE_PREFIX_SIZE - 8;
  console.log(
    `文件增长        : ${recordBytes} 字节（目标文件已存在时）；新建文件则为 ${recordBytes + 8} 字节（含 8 字节 header）`,
  );
  console.log(`sha256          : ${sha256}`);
}

function summarizeSkipped(skipped: readonly KeyTraceKey[]): string {
  if (skipped.length === 0) {
    return "";
  }
  const byRole = new Map<string, number>();
  for (const key of skipped) {
    byRole.set(key.role, (byRole.get(key.role) ?? 0) + 1);
  }
  const detail = [...byRole]
    .map(([role, count]) => `${role} ${count}`)
    .join(", ");
  const names = skipped
    .slice(0, 6)
    .map((key) => key.name)
    .join(",");
  return `（${detail}；例如 ${names}${skipped.length > 6 ? ",..." : ""}）`;
}

// --------------------------------------------------------------------------
// Sending
// --------------------------------------------------------------------------

function readCookie(): string {
  // TODO: cookie 名来自代码（COOKIE_NAME 默认 "session"），还没有在真实响应头里
  //       观察过。若服务端改过 COOKIE_NAME，直接传整段 "名字=值" 即可绕过这里的补全；
  //       实测方法见 docs/IMPORT-HOWTO.md 第 7 节（curl -i 看 Set-Cookie）。
  const value = (process.env.KEYBR_COOKIE ?? "").trim();
  if (value === "") {
    throw new Error(
      [
        `缺少 KEYBR_COOKIE，无法以登录用户身份写入。`,
        `取法（详见 docs/IMPORT-HOWTO.md）：`,
        `  1. 浏览器打开 ${process.env.KEYBR_URL ?? "http://localhost:3000"}/login/xyz，应跳转到 /account；`,
        `  2. DevTools > Application > Cookies > http://localhost:3000，复制名为 session 的值；`,
        `  3. KEYBR_COOKIE="session=<值>" npx tsnode scripts/import-keytrace.ts --send`,
      ].join("\n"),
    );
  }
  // `KEYBR_COOKIE` may be the bare value or the whole cookie header. The cookie
  // name comes from COOKIE_NAME, which keybr-server.bat does not override, so it
  // is the default "session" (packages/server/lib/app/session.ts).
  return value.includes("=") ? value : `session=${value}`;
}

function snapshotUserStats(dataDir: string): Snapshot {
  const snapshot: Snapshot = new Map();
  walk(join(dataDir, USER_STATS_DIR), snapshot);
  return snapshot;
}

function walk(dir: string, snapshot: Snapshot): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, snapshot);
    } else if (entry.isFile()) {
      snapshot.set(path, statSync(path).size);
    }
  }
}

/**
 * Finds the stats files that the server just touched. This is how we learn which
 * user id the login belongs to (the file name is the internal numeric id) and
 * the size to roll back to, without touching the database.
 */
function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
): readonly { readonly file: string; readonly previousSize: number | null }[] {
  const written: { file: string; previousSize: number | null }[] = [];
  for (const [file, size] of after) {
    const previousSize = before.get(file);
    if (previousSize == null || previousSize !== size) {
      written.push({ file, previousSize: previousSize ?? null });
    }
  }
  return written;
}

/**
 * Reads the data back. The server answers 204 even when every result was
 * dropped by `validate()` (packages/server/lib/app/sync/controller.ts), so the
 * status code alone proves nothing.
 */
async function verify(
  baseUrl: string,
  cookie: string,
  expected: Result,
): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/_/sync/data`, {
      headers: { cookie },
    });
    if (response.status !== 200) {
      return `GET /_/sync/data -> ${response.status}`;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    const records = [...parseFile(buffer)];
    if (records.length === 0) {
      return "GET /_/sync/data 返回 0 条记录（服务端很可能静默丢弃了这条结果）";
    }
    const last = records[records.length - 1];
    const same =
      last.layout.id === expected.layout.id &&
      last.textType.id === expected.textType.id &&
      last.length === expected.length &&
      last.time === expected.time &&
      last.errors === expected.errors &&
      last.complexity === expected.complexity;
    if (!same) {
      return `最后一条记录与本次载荷不一致: ${JSON.stringify({
        length: last.length,
        time: last.time,
        errors: last.errors,
        complexity: last.complexity,
      })}`;
    }
    return `ok（文件里共 ${records.length} 条记录，最后一条就是本次导入）`;
  } catch (err: any) {
    return `校验失败: ${err?.message ?? err}`;
  }
}

main().catch((err: any) => {
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
