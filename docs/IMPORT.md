# 把 KeyTrace 的真实打字数据导入本地 keybr

> 调研对象：`C:\Users\Gordo\keybr.com`（当前运行中，端口 3000，Node 22 + `node:sqlite`）
> 目标：让本地 keybr 的 guided 练习直接基于 KeyTrace 的逐键数据，而不是从默认字母顺序冷启动。
> 本文只读代码 + 只读数据库；未修改任何源码、数据库或正在运行的服务。所有"运行时事实"都标注了验证方式。

---

## 0. 结论摘要

1. **KeyStats 不在 SQLite 里，也不在任何一张"汇总表"里。** 它每次打开页面时由浏览器把该用户的**全部会话记录**（一个二进制文件）读出来，在内存里逐条累加计算。SQLite 里只有 `user / user_external_id / order / user_login_request` 四张身份相关表（`packages/keybr-database/lib/schema.ts:20-23`）。
2. **打字结果存在文件里**：`DATA_DIR/user_stats/000/000/000000001`（按内部 user id 分三级目录，`packages/keybr-config/lib/datadir.ts:28-36`）。文件是追加写的二进制格式，头部 8 字节 `"KEYB"` + 版本 2（`packages/keybr-result-io/lib/header.ts:3-8`）。
3. **没有面向用户的"导入"页面或 `/import` 路由**。唯一被官方使用的写入通道是网页客户端自己同步用的 **`POST /_/sync/data`**（`packages/server/lib/app/sync/controller.ts:37-47`）。它只接受 `application/octet-stream` 的**加扰二进制**，不接受 JSON。
4. **keybr-tui 的 `typing-data.json` 服务端不能直接吃**，但它的字段和 `Result` 完全同构（`packages/keybr-result/lib/result.ts:87-98`）。写一个 ~60 行的转换脚本把它编码成二进制，就能通过上面的官方通道导入。
5. **推荐路径 A（官方 HTTP 通道）**：登录 → 转换 → `POST /_/sync/data`。不改源码、不碰 SQLite、上游升级基本不受影响。最大的风险见第 5 节：**KeyStats 用的是 α=0.1 的指数平滑而不是求和**，所以"重复导入"不是幂等的；以及 `DATA_DIR` 在当前环境下未显式设置（详见第 8 节）。

---

## 1. keybr 侧的数据模型

### 1.1 SQLite：只有身份，没有打字数据

实际读到的表（只读查询 `sqlite_master`，与源码一致）：

| 表 | 关键字段 | 用途 |
|---|---|---|
| `user` | `id`, `email`(unique), `name`(unique), `anonymized`, `created_at` | 账号主体 |
| `user_external_id` | `user_id`, `provider`, `external_id` | OAuth 绑定 |
| `order` | `id`, `user_id`, `provider` | 付费订单 |
| `user_login_request` | `id`, `email`(unique), `access_token`(unique), `created_at` | 魔法登录链接 |

证据：`packages/keybr-database/lib/schema.ts:20-23`、`packages/keybr-database/lib/model.ts:28-50`（`User`）、`:387-408`（`UserLoginRequest`）。

**没有** `result`、`stats`、`keystats`、`histogram` 之类的表。`packages/keybr-settings-database` 这个名字有误导性：它把设置写成 `DATA_DIR/user_settings/...` 的 JSON 文件，不是数据库表（`packages/keybr-settings-database/lib/index.ts:12-59`）。

类型要点（会影响第 6 节的 SQL）：

- `user_login_request.access_token` 声明是 `blob`，但当前库里实际存的是 **TEXT**（`typeof(access_token)` = `text`，值 `78797A` = `"xyz"`）。用 TEXT 绑定查询能命中，用 BLOB 绑定查不到（已只读验证）。
- `created_at` 是**毫秒整数**（当前行 = `1794918583586`），`fixTimestamps` 会把数字转成 `Date`（`packages/keybr-config/lib/knex/util.ts:1-14`）。写文本时间会破坏过期比较。

### 1.2 打字结果：每用户一个追加式二进制文件

```
DATA_DIR / user_stats / <id 前3位> / <id 中3位> / <id 补零到9位>
例：user id = 1  →  .../user_stats/000/000/000000001
```

- 路径函数：`packages/keybr-config/lib/datadir.ts:28-36`
- 文件名用的是**内部数字 id**，不是 publicId：`packages/keybr-result-userdata/lib/factory.ts:15-21`（`userStatsFile(id.id)`）
- 读：`UserData.serve` 直接把文件流给客户端（`packages/keybr-result-userdata/lib/userdata.ts:15-41`）
- 写：`UserData.append` 在文件不存在时先追加 header，再按每 100 条分块追加（`userdata.ts:56-63`）
- 删：`UserData.delete` 把文件重命名成 `...~1`、`...~2`（`userdata.ts:65-78`）——注意这不是真删除，文件还在磁盘上。

**重要区分（两条路径的差别就在这）：**

| 用途 | 函数 | 是否加扰 |
|---|---|---|
| HTTP `POST /_/sync/data` 的请求体 | `formatMessage()` | **是**：8 字节前缀(随机 key + crc32) + 整段 XOR |
| 落盘的 `.stats` 文件内容 | `formatFile()` | **否**：只有 header + records |

证据：`packages/keybr-result-io/lib/sync.ts:6-15`、`packages/keybr-result-io/lib/secret.ts:4-12`、`packages/keybr-result-io/lib/file.ts:6-25`。

### 1.3 单条记录（一次会话）的字段顺序

`packages/keybr-result-io/lib/binary.ts:8-23`：

```
u8   layout.xid        // en-us = 0x10 (16)   (keybr-keyboard/lib/layout.ts:19-33)
u8   textType.xid      // generated = 1        (keybr-result/lib/texttype.ts:4-13)
u32  timeStamp / 1000  // 秒
vlq  time              // 毫秒
vlq  length            // 字符数
vlq  errors
vlq  sampleCount
  vlq codePoint, hitCount, missCount, timeToType   × sampleCount
```

C++ 侧独立实现可交叉验证同一格式：`packages/user-data-tools/stats_data.cpp:36-80`、`stats_result.hpp:29-40`。注意 C++ 校验器把 `sampleCount` 限制在 **< 128**（`stats_data.cpp:60-62`，`SAMPLE_COUNT=128`），Web/TS 侧没有这个上限。

### 1.4 KeyStats 的聚合口径（核心）

KeyStats **不是**从表里读出来的，也没有缓存/落盘；页面加载时由 `ResultLoader` → `Progress.seedAsync` → `MutableKeyStatsMap.append` 在浏览器里现算：

- `packages/keybr-result-loader/lib/ResultLoader.tsx:26-35`（按当前用户打开存储）
- `packages/keybr-result-loader/lib/internal/storage.ts:139-170`（命名用户：先拉远端文件）
- `packages/page-practice/lib/practice/state/progress.ts:33`（构造 `MutableKeyStatsMap`）、`:52-75`（按数组顺序分块喂入）、`:89-96`（逐条 append）

每个键的算法（`packages/keybr-result/lib/keystats.ts`）：

```ts
// 对每条 result，取该 codePoint 在本次会话里的直方图样本
const { hitCount, missCount, timeToType } = histogram.get(letter.codePoint);
if (timeToType > 0) {
  const filteredTimeToType = this.#filter.add(timeToType); // α = 0.1 的指数平滑
  this.#timeToType = filteredTimeToType;                   // 覆盖为"最新平滑值"
  this.#bestTimeToType = Math.min(this.#bestTimeToType ?? Infinity, filteredTimeToType);
}
```

- 平滑器：`makeFilter(0.1)`（`keystats.ts:109`），实现见 `packages/keybr-math/lib/filter.ts:11-28`：`v = 0.1*new + 0.9*old`，第一个样本直接取原值。
- `bestTimeToType` = 历史平滑值的**最小值**（只降不升）。
- `KeyStats` 本身**不累加** `hitCount/missCount`，它只保留每个会话的 `KeySample`；要看总量得在外面求和（例如 `packages/keybr-chart/lib/keyusage.ts:10-16`）。

**所以：**
- 存的是"每次会话"（每个 Result 一份逐键直方图），不是汇总；
- 但对外呈现的 `timeToType` 是**近因加权平均**，不是全历史平均，更不是总和；
- 导入 **1 条** Result 时，平滑值就等于原始值（n=1），这是最干净的迁移方式；导入 N 条时，结果依赖**文件里的先后顺序**（没有排序，`progress.ts:89-96` 直接按数组顺序），并且最后一条权重最大。
- 依赖顺序的还有按天分组：`ResultGroups.byDate` 的日期缓存假设时间戳单调递增（`packages/keybr-result/lib/group.ts:20-31`）。乱序导入会让日历/日统计错位。

已用内存脚本验证（未写入磁盘）：

```
输入 timeToType: 200 → 300 → 1000
samples: [200,200], [300,210], [1000,289]
timeToType=289, bestTimeToType=200
```

### 1.5 KeyStats → 练习选键的逻辑（决定"导入后会发生什么"）

- guided 是默认课型（`packages/keybr-lesson/lib/settings.ts:13`），目标速度默认 175 CPM（`:60`），即 `speedToTime(175) ≈ 342.9ms`。
- `confidence = 342.9 / timeToType`（`packages/keybr-lesson/lib/target.ts:15-23`）；`>= 1` 表示达到目标。
- 选键循环 `packages/keybr-lesson/lib/guided.ts:42-107`：
  - 先按字母频率顺序（默认不是按键盘顺序，`guided.ts:131-141`）逐个处理；
  - 前 6 个无条件纳入（`minSize=6`，`:47`）；`alphabetSize` 默认 0，所以 `maxSize` 也是 6（`:48-49`）；
  - **`bestConfidence >= 1` 的键无条件纳入**（`:72`），会突破 6 个上限；
  - 其余键只有在"已纳入的键全部达标"时才逐个放开（`:78-92`）；
  - 最后把已纳入、且 confidence < 1 的键里最弱的一个设为 focus（`:95-105`）。

**这条很关键：**
- keybr 只用 **timeToType** 决定练什么；`hitCount/missCount` 只影响图表和统计展示，不参与选键。
- 如果 KeyTrace 的反映时间都换算到 343ms 以下，**26 个键会一次性全部被纳入**，反而没有"针对弱键"的效果。如果要让高错误率键被重点练，需要在转换时把错误率折算进 `timeToType`（例如按错误率放大反应时间），让它们落到 confidence < 1 的区间。
- 结果还会按**布局族**过滤：默认设置是 EN_US，family = `qwerty`（`layout.ts:19-33`），`Lesson.filter` 只取同族结果（`packages/keybr-lesson/lib/lesson.ts:32-36`）。所以导入记录的 `layout` 必须是 `en-us`，否则练习页根本看不到。

### 1.6 其它受影响的存储

| 数据 | 位置 | 何时写 |
|---|---|---|
| 设置 | `DATA_DIR/user_settings/000/000/000000001`（JSON 文件） | `PUT /_/sync/settings` |
| 排行榜 | `DATA_DIR/highscores.json` | `POST /_/sync/data` 顺带写入 |
| 会话 | `DATA_DIR/sessions/` | 登录时 |

证据：`packages/keybr-highscores/lib/factory.ts:9-27`、`packages/server/lib/app/session.ts:16-22`。

排行榜规则：只收 `length >= 50 && complexity >= 10` 的结果（`packages/keybr-highscores/lib/highscores.ts:135-139`），全局前 20、只保留两周（`:56-57`），**没有删除 API**。

---

## 2. 官方导入路径调查

### 2.1 路由清单（全量）

服务端路由都在 `packages/server/lib/app/`（`routes.ts:14-28` 注册），`packages/keybr-pages-server` 只负责 SSR 外壳，不含路由。实际枚举到的全部 `@http.*`：

```
GET  /_/sync/data/{id}     GET  /_/sync/data      POST /_/sync/data     DELETE /_/sync/data
GET  /_/sync/settings      PUT  /_/sync/settings  DELETE /_/sync/settings
GET  /_/profile/{id}       GET  /_/high-scores    GET  /_/game/*
POST /_/checkout           GET  /login/{token}    GET  /auth/logout     POST /auth/login/register-email
```

**没有** `/_/import`、`/_/upload`、`/data/import` 之类的入口；前端也没有 `<input type="file">` 或拖拽导入（全仓库 grep 过，只有主题设计器的图片上传）。

只读探测（未登录，不写任何东西）：

```
GET  /                 -> 200
GET  /_/sync/data      -> 403
GET  /_/sync/settings  -> 403
POST /_/sync/data      -> 403   (空 body，未登录被拒)
```

### 2.2 唯一的写入通道：`POST /_/sync/data`

`packages/server/lib/app/sync/controller.ts:37-47`：

```ts
@http.POST("/_/sync/data")
async postData(ctx, @body.binary(null, { maxLength: 1048576 }) value: Buffer) {
  const { id } = ctx.state.requireUser();          // 必须登录
  const results = await parseResults(value);        // parseMessage + result.validate()
  await this.userData.load(new PublicId(id!)).append(results);
  await this.highScores.append(id!, results);       // 副作用：排行榜
  ctx.response.status = 204;
}
```

对应的 service 函数是 `UserData.append()`（`userdata.ts:56-63`），格式解析是 `parseMessage()`（`sync.ts:13-15`），校验在 `controller.ts:57-71`。

三个必须知道的细节：

1. 只接受 `application/octet-stream`，其它类型 415（`controller.test.ts:122-141`）。
2. 请求体是 `formatMessage()` 的**加扰**格式，不是文件里的原始字节。
3. **非法结果被静默丢弃**：`parseResults` 只保留 `validate()` 通过的，然后仍返回 204。HTTP 204 不代表数据真的写进去了。

### 2.3 `packages/user-data-tools` 是什么

不是导入工具，是一组**离线 C++ 命令行程序**（`Makefile` 编出 `keybr-check-stats` / `keybr-build-histogram`），直接读同样的 `.stats` 文件做校验和全站速度/准确率直方图。它不连数据库、不连 HTTP，也不写用户数据。

真正对运维有用的是 **`packages/server-cli`**：

- `check-stats <user-id-range>`：逐个读用户 stats 文件，按 speed 过滤并报告损坏（`packages/server-cli/lib/command/stats/command.ts:16-45`、`check-file.ts:19-45`）。
- `check-stats --fix <id>`：重写文件、保留合法结果，旧文件改名为 `~corrupted`（`fix-file.ts:7-32`）。
- `user-info <id|email>`：查 id / publicId（`user-info/command.ts:21-39`）。

**没有 import 子命令。**

### 2.4 登录（导入的前置条件）

- 路由 `GET /login/{token}` 校验 token，建会话，302 到 `/account`（`packages/server/lib/app/auth/controller.ts:105-125`）。
- token 存在 `user_login_request`，**24 小时过期**（`model.ts:410`、`:468-472`）；`login()` 会先删除过期行（`:459-466`）。
- `devenv/initdb.ts` 固定写入 `user@localhost` / `xyz`（`packages/devenv/lib/initdb.ts:9-10`、`:21-28`）。
- 当前库里 `user` 表是**空的**，`user_login_request` 只有一行：`id=1, email=user@localhost, access_token=xyz`，`created_at=1794918583586`。
  - 换算：`2026-11-17T12:29:43Z` 创建，**2026-11-18T12:29:43Z 过期**（调研时约剩 3.8 小时）。
  - `sqlite_sequence` 里没有 `user` 的记录 → 第一次登录创建的用户 **id = 1**。
  - 按 `PublicId` 算法（`packages/keybr-publicid/lib/index.ts:119-133`）计算，id=1 的 publicId 是 `55vdtk1`（这是计算值，不是数据库里读到的）。

---

## 3. keybr-tui 的 `typing-data.json` 能不能被网页版消费？

**不能直接消费，但可以无损转换。**

- 该 JSON 的字段与 `Result.toJSON()` 完全一致：`layout/textType/timeStamp/length/time/errors/speed/histogram[{codePoint,hitCount,missCount,timeToType}]`（`packages/keybr-result/lib/result.ts:87-98`）。
- 但仓库里**没有**任何接受这种长字段 JSON 的 HTTP 接口或 UI。
- `resultFromJson()` 只认旧版短字段 `{l,m,ts,n,t,e,h:{[cp]:{h,m,t}}}`（`packages/keybr-result-io/lib/legacyjson.ts:6-22`、`:54-96`），而且只被浏览器的 IndexedDB 读取逻辑使用（`packages/keybr-result-loader/lib/internal/local.ts:19`），不在服务端链路上。
- `speed` 字段是冗余的：构造 `Result` 时会用 `length/time` 重算（`result.ts:55-67`），传什么都不影响。

已做内存往返验证（不落盘）：用示例字段构造 `Result` → `formatMessage` → `parseMessage`，布局/文本类型/直方图完全一致，42 字节，`validate() = true`。

**结论**：JSON 本身不能喂给本地服务；必须先编码成 `formatMessage` 的二进制，或写成 `.stats` 文件。

---

## 4. 三条候选路径

### 路径 A：走官方 HTTP 通道（推荐）

**做法**

1. 登录拿会话 cookie：
   ```bash
   curl -s -c cookies.txt -o /dev/null -w '%{http_code} %{redirect_url}\n' \
     http://localhost:3000/login/xyz
   # 期望 302（Location: /account）；若 403 说明 token 已过期（见 §2.4）
   ```
2. 把 `stats.json` 转成加扰二进制（脚本示意，放在 `scripts/import-keytrace.ts`，用仓库自带 loader 运行）：
   ```ts
   import { readFileSync, writeFileSync } from "node:fs";
   import { Layout } from "@keybr/keyboard";
   import { Result, TextType } from "@keybr/result";
   import { Histogram } from "@keybr/textinput";
   import { formatMessage } from "@keybr/result-io";

   const src = JSON.parse(readFileSync(process.argv[2], "utf8"));
   const clamp = (v: number) => Math.min(12000, Math.max(40, Math.round(v)));
   const samples = src.histogram.map((s: any) => ({
     codePoint: s.codePoint,
     hitCount: s.hitCount,
     missCount: s.missCount,
     timeToType: clamp(s.timeToType),
   }));

   const hit  = samples.reduce((a: number, s: any) => a + s.hitCount, 0);
   const miss = samples.reduce((a: number, s: any) => a + s.missCount, 0);
   const time = samples.reduce((a: number, s: any) => a + s.hitCount * s.timeToType, 0);
   const ts   = typeof src.timeStamp === "number" ? src.timeStamp : Date.parse(src.timeStamp);

   const result = new Result(
     Layout.ALL.get(src.layout ?? "en-us", Layout.EN_US),
     TextType.ALL.get(src.textType ?? "generated", TextType.GENERATED),
     ts,
     Math.max(10, hit),
     Math.max(1000, Math.round(time)),
     miss,
     new Histogram(samples),
   );
   if (!result.validate()) throw new Error("invalid result, check samples/timeToType");
   writeFileSync(process.argv[3], formatMessage([result]));
   ```
   ```bash
   cd C:/Users/Gordo/keybr.com
   node --import @keybr/tsl scripts/import-keytrace.ts \
     "$USERPROFILE/.keytrace/stats.json" ./keytrace.stats
   ```
   （已验证 `node --import @keybr/tsl` 可以成功 `import('@keybr/result-io')`；裸 Node 的 `--experimental-strip-types` 不行，因为 `@keybr/keyboard` 会带进 `.tsx`。）
3. 上传：
   ```bash
   curl -s -b cookies.txt -o /dev/null -w '%{http_code}\n' \
     -X POST -H 'Content-Type: application/octet-stream' \
     --data-binary @keytrace.stats http://localhost:3000/_/sync/data
   ```
4. 验证：`GET /_/sync/data` 返回字节数应等于 `8(header)+record`；然后打开练习页确认。

**改哪些文件**：源码零改动。新增一个未跟踪脚本 `scripts/import-keytrace.ts`（git pull 不会冲突）。

**工作量**：1–2 小时（含转换脚本、登录、验证、踩 40–12000ms 与 ≥3 键的校验）。

**风险**

- 必须登录；登录会在 SQLite 里创建 `user` 行、在 `DATA_DIR/sessions` 写会话文件（这是本次调研刻意没做的事）。
- token 24h 过期，过期后 `login()` 会删行并 403。重建方式：重跑 `devenv/initdb.ts`（需要 `DATABASE_*` 环境变量），或按 §6 的 SQL 覆盖。
- 会顺带写 `highscores.json`（排行榜），且没有删除 API，只能等两周自然过期或手改文件。
- 输入参数错（timeToType 越界、有效键 < 3、`layout` 不是 qwerty 族）时**静默 204**，看着成功其实没写。
- **不幂等**：POST 是 append；重复导入会在平滑器里多压一个样本，且 `bestTimeToType` 只降不升，越导越"乐观"。只适合一次性迁移，或每次只导增量。
- 浏览器本地 IndexedDB 里已有的匿名历史会被"远端非空"逻辑挡住（`storage.ts:148-161`），不会自动上传，也不会删，属于静默搁置。

**上游更新后**：这条是网页客户端自己在用的契约（`remotesync.ts:12`），只要 keybr 不改同步协议就还能用；属于三条里最稳的。

---

### 路径 B：直接写 `user_stats` 文件（最省事、副作用最小）

**做法**

1. 确认 `DATA_DIR`（见 §8）。当前环境变量未设置，默认解析为 `C:\var\lib\keybr`（`module.ts:9-11` + `env.ts:130-141`）。
2. 用户 id：第一次登录必然是 1（`user` 表空、无 `sqlite_sequence` 记录）。也可以先按 §6 预建 id=1 的用户。
3. 用同一个脚本，把 `formatMessage` 换成 **`formatFile`**，写到：
   ```
   <DATA_DIR>/user_stats/000/000/000000001
   ```
   目录不存在时 `File.append/write` 会自动 `mkdir -p`（`node_modules/@sosimple/fsx-file/lib/file.js:144-170`）。
4. 如果文件已存在：**不要覆盖**。要么在文件末尾追加 `fileChunk([result])`（不能重复加 header），要么先用 `server-cli check-stats 1` 读出全部、拼上新的再整体重写。
5. 验证：`node --import @keybr/tsl` 跑 `packages/server-cli` 的 `check-stats 1 --verbose`（它直接读文件，不经过 HTTP）。

**改哪些文件**：源码零改动；新增一个脚本。写的是 `DATA_DIR` 下的数据文件，不是仓库文件。

**工作量**：0.5–1 小时。

**风险**

- 依赖内部路径约定（`DataDir.userStatsFile`），不是公开 API；`format` 版本升级（header version）时要跟着改。
- 服务正在运行，浏览器也会 append 同一文件；并发写有交错风险（虽然每次 append 是单次 `appendFile`，但"判断是否存在 + 写 header"不是原子的）。
- 手写错 header/记录会得到"看起来有文件但页面空白"的状态；好在 `check-stats` 能查。
- 不会更新 `highscores.json`（这既是优点也是与官网行为不一致的地方）。
- 不知道 `DATA_DIR` 就可能写到一个永远不会被读取的位置。

**上游更新后**：中。文件格式和目录布局多年稳定，但属于内部实现；若上游改 header 版本或目录规则，脚本要改。

---

### 路径 C：改服务端加一个导入接口 / CLI 子命令

**做法**

- 在 `packages/server/lib/app/sync/controller.ts` 加 `POST /_/import/json`，接受长字段 JSON，内部复用 `Result`/`Histogram`/`UserData.append`；
- 或在 `packages/server-cli/lib/command/` 加 `import-stats` 子命令，直接调用 `UserDataFactory`；
- 重新构建：`npm run build`（webpack 产出 `root/lib/index.js`，当前是 9.6MB 单文件），然后**必须重启服务**。

**改哪些文件**：`packages/server/lib/app/sync/controller.ts`（或 `packages/server-cli/lib/command/...`）、可能还要改 `routes.ts`；产物 `root/lib/index.js` 被覆盖。

**工作量**：半天以上（含构建、重启、回归），而且当前约束下不能重启。

**风险**

- 上游升级时冲突概率最高；`root/lib` 是构建产物，改源码不重建等于没改。
- 新增一个无鉴权/弱鉴权的写接口有安全面。
- 收益只是"省一个外部转换脚本"，不值得。

**上游更新后**：差。补丁要跟着 rebase。

---

### 对比

| | A: HTTP 同步接口 | B: 直写 stats 文件 | C: 改源码加接口 |
|---|---|---|---|
| 改源码 | 否 | 否 | 是 |
| 需要登录 | 是 | 否（但看数据仍要登录） | 是 |
| 需要知道 DATA_DIR | 否（服务自己写） | 是 | 否 |
| 服务端校验 | 有（但静默丢弃非法） | 无（需自己 check-stats） | 有 |
| 排行榜副作用 | 有 | 无 | 有 |
| 并发安全 | 好 | 一般 | 好 |
| 上游兼容 | 最好 | 中 | 差 |
| 可重复执行 | 追加，非幂等 | 可重写，幂等 | 同 A |

---

## 5. 推荐

**一次性迁移：路径 A。** 理由：

1. 走的是网页客户端自己在用的写入契约，`UserData.append` 会正确处理 header、分块和目录创建，不需要我们手写二进制布局。
2. 不修改任何源码，也不用重启，升级 keybr 时不会被覆盖。
3. 有服务端 `validate()` 兜底（虽然它的"静默 204"需要我们自己复核字节数）。

**如果排行榜污染不可接受，或这条管道要长期反复跑：改用路径 B。** 因为 KeyStats 是 α=0.1 的指数平滑，"重复 append"在统计上会失真；只有"整体重写文件"才能保证每次导入后 `timeToType` 精确等于 KeyTrace 的最新值。代价是要自己保证文件格式正确，并且会覆盖该用户在 keybr 上的历史（如果两者共用同一个 user id）。

**不推荐 C。** 收益与维护成本不匹配。

**转换时的三个业务决策（必须显式定，否则效果不符合预期）：**

1. **错误率怎么进模型**：keybr 选键只看 `timeToType`。建议 `timeToType_effective = reactionTime * (1 + k * errorRate)`（k 例如 2–4），把高错误率键压到 343ms 以上，这样它们会变成 focus 键。
2. **单条还是多条**：只导 1 条，`timeToType` 就是精确值；导多条会让平滑和 `bestTimeToType` 产生偏差。建议 1 条聚合记录（KeyTrace 的 `stats.json` 本身也是聚合结果）。
3. **`length/time/errors` 怎么填**：它们只影响校验、图表、排行榜，不影响 KeyStats。建议 `length=Σhit`、`time=Σ(hit*timeToType)`、`errors=Σmiss`，并保证 `length>=10`、`time>=1000`。

---

## 6. 如果走 SQLite 直写：能做和不能做的

**先说结论：SQLite 里没有可以写打字统计的表。** `KeyStats` 完全由 `user_stats` 文件推导，写 `user` / `user_login_request` 不会产生任何练习数据。所谓"SQLite 直写"只能解决**归属（user id）**这一件事，不能解决数据本身。

能用的 SQL 草稿（按实际 schema；`user` 表当前为空，`sqlite_sequence` 里也没有 `user`，所以显式 `id=1` 是安全的）：

```sql
-- 可选：预建固定 id 的账号，避免依赖登录时的自增
INSERT INTO "user" (id, email, name, anonymized, created_at)
VALUES (1, 'user@localhost', 'user', 0, CURRENT_TIMESTAMP);

-- 刷新登录令牌（created_at 必须是毫秒整数，不能写 CURRENT_TIMESTAMP）
INSERT INTO user_login_request (email, access_token, created_at)
VALUES ('user@localhost', 'xyz', CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(email) DO UPDATE SET
  access_token = excluded.access_token,
  created_at   = excluded.created_at;
```

注意事项（都是实测/源码结论，不是推测）：

- `access_token` 现在实际是 **TEXT**，所以上面的字符串字面量是对的；**不要**写 `CAST('xyz' AS BLOB)`——`findByAccessToken` 用 TEXT 绑定，BLOB 行匹配不到（已只读验证：TEXT 查询命中，Buffer 查询不命中）。
- `created_at` 必须是毫秒整数。`deleteExpired` 用 `createdAt < new Date(now - 24h)` 比较（`model.ts:468-472`），写文本时间会导致永不过期或立刻过期。
- `user.name` 和 `user.email` 都有唯一约束（`model.ts:41-50`）；`name` 最长 32。
- 写入前请备份 `data/keybr.sqlite`；服务在跑时写库可能遇到 `SQLITE_BUSY`，用短事务。

验证：

```sql
SELECT id, email, name FROM "user";
SELECT id, email, access_token, datetime(created_at/1000,'unixepoch') AS created_utc
FROM user_login_request;
```

**但即使执行了这些 SQL，仍需 §4 的 A 或 B 才能让练习页读到数据。**

---

## 7. 执行清单（建议按序）

1. **先确定 `DATA_DIR`**（见 §8）。如果没有显式设置，建议在执行前给 `keybr-server.bat` 加一行 `set DATA_DIR=%USERPROFILE%\keybr.com\data` 并重启一次——这样数据、设置、会话都在仓库的 `data/` 下，路径可预测，也不会写到 `C:\var\lib\keybr`。**这一步必须在首次登录之前做**，否则已有设置/会话会"消失"。
2. 备份：`data/keybr.sqlite`、`DATA_DIR`（如果已有）。
3. 登录：浏览器打开 `http://localhost:3000/login/xyz`（或 curl 带 cookie jar）。
4. 确认 `user` 表出现 id=1；`DATA_DIR` 下出现 `sessions/`、`user_settings/`。
5. 运行转换脚本，确认 `result.validate() === true`。
6. 导入（A：POST；B：写文件）。
7. 复核：
   - `GET /_/sync/data` 的 `Content-Length` 与预期一致；
   - `GET /_/sync/data` 能被 `parseFile` 解析出 1 条；
   - 打开 `/practice`，确认 KeySelector 展示的键与 KeyTrace 的弱键一致；
   - 打开 `/profile`，确认曲线/直方图有数据；
   - 若走 A，检查 `highscores.json` 是否被写入。
8. 若需要回滚：`DELETE /_/sync/data` 会把文件改名成 `~1`（不是真删），把 `~1` 改回原名即可；排行榜行删不掉，只能等两周或手改 `highscores.json`（先停服务再改，避免竞争）。

---

## 8. 未验证 / 需要落地时确认的点

1. **`DATA_DIR` 的真实值没有读到。** 依据：`DATA_DIR` 在 Process/User/Machine 三个作用域都为空（已查），`keybr-server.bat` 也没设置，`module.ts:10` 的默认值是 `/var/lib/keybr`；Windows 下 `path.resolve("/var/lib/keybr")` = `C:\var\lib\keybr`（已用 Node 验证），而该目录当前不存在。因此**推断**服务用的是 `C:\var\lib\keybr`，但没有直接证据（进程环境读不到）。落地时以第一次登录后 `sessions/` 出现在哪为准。
2. **`C:\var` 的创建权限**：`C:\` 的 ACL 里 `Authenticated Users` 有 `AppendData`（= 可建子目录），所以大概率能建；但没有实测写入，不作保证。
3. **HTTP 端到端未测。** 为了避免写库/写文件，只验证了未登录时三个接口返回 403；登录、POST、204 后的文件内容都还没有实跑。
4. **`user` 表为空、token 未过期（约剩 3.8h）是调研时点的快照。** 执行前请重新确认；token 过期后 `login()` 会直接删掉那一行。
5. **keybr-tui 的 `--import` 具体行为没有验证**（该仓库不在本地）。它是否也是打同一个 `POST /_/sync/data`，无法确认，本文不依赖它。
6. **KeyTrace `stats.json` 的 `timeStamp` 是数字还是 ISO 字符串**没有读（按约束未访问 `C:\Users\Gordo\keytrace`）。脚本里两种都兼容；若还有额外字段，以 `packages/keybr-result/lib/result.ts:46-54` 的构造参数为准。
7. **`histogram` 的键数**：建议只保留实际参与练习的 26 个小写字母。C++ 校验器限制 `< 128` 个样本（`stats_data.cpp:60-62`）；TS 侧不限，但多余的标点/大写键只会增大 `complexity` 并影响排行榜，不会帮助选键。

---

## 附：证据索引（文件:行）

| 事实 | 位置 |
|---|---|
| SQLite 只有 4 张身份表 | `packages/keybr-database/lib/schema.ts:20-23` |
| `user` / `user_login_request` 定义 | `packages/keybr-database/lib/model.ts:28-50`, `:387-408` |
| token 24h 过期 | `packages/keybr-database/lib/model.ts:410`, `:459-472` |
| 设置存文件而非 DB | `packages/keybr-settings-database/lib/index.ts:12-59` |
| stats 文件路径 | `packages/keybr-config/lib/datadir.ts:28-36` |
| 用内部 id 而非 publicId | `packages/keybr-result-userdata/lib/factory.ts:15-21` |
| 文件追加/删除语义 | `packages/keybr-result-userdata/lib/userdata.ts:56-78` |
| 二进制 header/版本 | `packages/keybr-result-io/lib/header.ts:3-8` |
| 记录字段顺序 | `packages/keybr-result-io/lib/binary.ts:8-23` |
| 文件 vs HTTP 的加扰差异 | `packages/keybr-result-io/lib/sync.ts:6-15`, `secret.ts:4-12` |
| JSON 形状 = Result.toJSON | `packages/keybr-result/lib/result.ts:87-98` |
| 结果校验阈值 | `packages/keybr-result/lib/result.ts:13-20`, `:70-85` |
| 直方图 ≥3 键、40–12000ms | `packages/keybr-textinput/lib/histogram.ts:40-50`, `:96-105` |
| KeyStats 平滑与 best | `packages/keybr-result/lib/keystats.ts:109`, `:131-155` |
| KeyStats 构建顺序 | `packages/page-practice/lib/practice/state/progress.ts:33`, `:52-96` |
| 远端优先、本地被搁置 | `packages/keybr-result-loader/lib/internal/storage.ts:139-170` |
| 同步 URL 与 POST 格式 | `packages/keybr-result-loader/lib/internal/remotesync.ts:12`, `:62-86` |
| 唯一写入路由 | `packages/server/lib/app/sync/controller.ts:37-47`, `:57-71` |
| 路由总表 | `packages/server/lib/app/routes.ts:14-28` |
| 登录与 302 | `packages/server/lib/app/auth/controller.ts:105-125` |
| cookie 配置 | `packages/server/lib/app/session.ts:16-22` |
| EN_US xid/family | `packages/keybr-keyboard/lib/layout.ts:19-33` |
| TextType xid | `packages/keybr-result/lib/texttype.ts:4-13` |
| 选键逻辑 | `packages/keybr-lesson/lib/guided.ts:42-107` |
| confidence 公式 | `packages/keybr-lesson/lib/target.ts:15-23` |
| 默认 175 CPM / GUIDED | `packages/keybr-lesson/lib/settings.ts:13`, `:60` |
| 布局族过滤 | `packages/keybr-lesson/lib/lesson.ts:32-36` |
| 排行榜阈值/有效期 | `packages/keybr-highscores/lib/highscores.ts:56-57`, `:135-139` |
| 离线 C++ 工具（非导入） | `packages/user-data-tools/Makefile`, `stats_data.cpp:36-80` |
| `check-stats` 命令 | `packages/server-cli/lib/command/stats/command.ts:16-45` |
