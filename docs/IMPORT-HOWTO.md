# 把 KeyTrace 统计导入本地 keybr — 操作手册

> 配套脚本：`scripts/import-keytrace.ts`
> 调研结论：`docs/IMPORT.md`（数据模型、`POST /_/sync/data`、加扰格式、非幂等风险）
> KeyTrace 字段说明：`C:\Users\<you>\keytrace\docs\stats-schema.md`
>
> **这次操作会往正在运行的服务里写数据，而且不能原样撤销。** 先读完第 5 节「回滚」再执行。

---

## 1. 这个脚本做什么

```
%USERPROFILE%\.keytrace\stats.json
   │  逐键 presses/typos/ikiP50Ms
   ▼
一条 Result（单条聚合会话）
   │  Result → formatMessage()（加扰二进制）
   ▼
POST http://localhost:3000/_/sync/data   （Cookie: session=…）
   │  服务端 parseMessage → Result.validate() → UserData.append()
   ▼
DATA_DIR\user_stats\<id 前3>\<id 中3>\<id 补零9位>
   │  浏览器打开练习页时下载这个文件，在内存里累加成 KeyStats
   ▼
/practice 的选键  +  /profile 的图表
```

要点：

- **没有导入接口。** `POST /_/sync/data` 是网页客户端自己的同步通道，也是唯一的写入方式，请求体只能是 `application/octet-stream`（其它类型 415）。
- **一条记录，不是多条。** `stats.json` 本身就是聚合结果；只导 1 条时 KeyStats 的指数平滑等于原值，导多条会让结果依赖顺序。
- **服务端会静默丢弃非法结果**：非法时仍返回 204。所以脚本发完会 `GET /_/sync/data` 把数据读回来比对，不只看状态码。

### 字段映射

| keybr `Sample` | 来自 `stats.json` | 说明 |
| --- | --- | --- |
| `codePoint` | `vk` → a-z 用 `97 + (vk - 65)`，主键盘 0-9 直接用 `vk` | 其它键（Backspace/Enter/符号/小键盘数字）跳过 |
| `hitCount` | `keys[].presses` | |
| `missCount` | `keys[].typos` | 只算"确认的纠错"；`typosUnreplaced` 不计 |
| `timeToType` | `keys[].ikiP50Ms`（或经 `--error-weight <k>` 折算） | 默认直接取 `ikiP50Ms`；传入 `--error-weight <k>`（`k > 0`）时计算 `ikiP50Ms * (1 + k * typoRate)`，随后统一夹到 `[40, 12000]`，越界会让整条记录被丢弃 |
| `length` | `Σ hitCount` | |
| `time` | `baseline.textActiveMs` | |
| `errors` | `Σ missCount` | |
| `speed` | `length / time * 60000` | `Result` 自己会算，等价 |
| `layout` / `textType` | `--layout`（默认 `en-us`，中文可用 `zh-sp` / `zh-qp`） / 固定 `keytrace`（`TextType.KEYTRACE`） | 布局族须与当前练习布局一致；`TextType.KEYTRACE` 用于区分 KeyTrace 样本与独立网页练习记录 |

本次真实数据的 dry run 结果（供对照）：

```
length 6654 / time 4410580ms / errors 34 / speed 90.5 CPM / complexity 36 键
载荷 233 字节（scramble 8 + header 8 + 记录 217），validate() = true
```

---

## 2. 前提

1. **服务已经在跑**（`http://localhost:3000`）。本流程不重启、不 kill、不改源码。
2. `DATA_DIR` **必须与服务进程一致**。当前 `keybr-server.bat` 里是：
   ```
   set DATA_DIR=%REPO%\data
   ```
   脚本自己不会去读别的进程的环境变量，所以它按 `--data-dir` → `$DATA_DIR` → `/var/lib/keybr` 的顺序解析。**如果你在 shell 里没设 `DATA_DIR`，脚本会解析到 `C:\var\lib\keybr`，那里不存在，脚本会直接报错退出** —— 这是故意的：路径错了，重复导入守卫就形同虚设。
3. **一个账号**。本地库 `user` 表现在是空的，第一次登录会创建 `id = 1`，对应的 stats 文件是：
   ```
   data\user_stats\000\000\000000001
   ```
4. **只导一次。** 见第 6 节。

---

## 3. 操作步骤

以下命令都在 `<仓库根目录>` 下、用 Git Bash 执行。

### Step 1 — dry run（默认行为，不发请求）

```bash
cd /c/Users/<you>/keytrace-web
DATA_DIR="/c/Users/<you>/keytrace-web/data" \
  node --import @keybr/tsl scripts/import-keytrace.ts
```

也可以 `npx tsnode scripts/import-keytrace.ts`（`tsnode` 就是 `node --import @keybr/tsl` 的包装）。

cmd.exe 里等价写法：

```bat
cd /d "%USERPROFILE%\keybr.com"
set DATA_DIR=%USERPROFILE%\keybr.com\data
node --import @keybr/tsl scripts\import-keytrace.ts
```

输出里要确认这几行：

```
DATA_DIR        : C:\Users\<you>\keybr.com\data      ← 与服务一致
标记文件        : ...\data\user_stats\keytrace-import.marker（不存在）
validate()      : true
字母达速        : 21/26（confidence >= 1.00，即 timeToType <= 343ms）
未达速 / 无计时 : C(505ms), V(391ms), Y(353ms), X(350ms), Q(347ms)
```

### Step 2 — 登录，拿 cookie

登录态是 `DATA_DIR/sessions/` 下的一个文件，浏览器用 `session` cookie 指过去。cookie 名由 `COOKIE_NAME` 决定，`keybr-server.bat` 没覆盖它，所以是默认的 `session`（`packages/server/lib/app/session.ts:16`）；值是一串纯字母数字的 session id（`@fastr/middleware-session` 的 `parseCookie` 只接受 `/^[a-zA-Z0-9]+$/`）。

**浏览器方式（推荐）：**

1. 打开 `http://localhost:3000/login/xyz`
   - 成功：302 跳到 `/account`，页面显示已登录。
   - 失败：403 "Invalid login link" —— 说明 `user_login_request` 里那行 token 过期了（24 小时有效）。`login()` 会先删过期行，所以重试同一个链接不会成功；需要重建 token（见 `docs/IMPORT.md` §6 的 SQL，本轮不要动数据库）。
2. F12 → Application（应用）→ Storage → Cookies → `http://localhost:3000`
3. 复制名为 `session` 的那一行的值。注意 cookie 是 `httpOnly`（默认 true），所以 **`document.cookie` 里读不到**，必须从 DevTools 或响应头里拿。

命令行方式（同样会写会话文件，但不动数据库）：

```bash
curl -s -i -c cookies.txt http://localhost:3000/login/xyz | head -20
grep -i session cookies.txt        # 第 7 列就是值
```

`curl -i` 的响应头里也能直接看到 `Set-Cookie: session=...`。

### Step 3 — 真正上传

```bash
DATA_DIR="/c/Users/<you>/keytrace-web/data" \
KEYBR_COOKIE="session=<粘贴的值>" \
  node --import @keybr/tsl scripts/import-keytrace.ts --send
```

`KEYBR_COOKIE` 两种写法都行：`session=abc123`（整段 cookie）或裸值 `abc123`（脚本自动补 `session=`）。

期望输出：

```
POST /_/sync/data -> 204
GET  校验结果     : ok（文件里共 1 条记录，最后一条就是本次导入）
写入的文件        : C:\Users\<you>\keybr.com\data\user_stats\000\000\000000001（导入前: 不存在）
标记文件已写入    : ...\data\user_stats\keytrace-import.marker
```

错误码对照：

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| 403 | cookie 无效/过期 | 回 Step 2 重新登录 |
| 400 | 服务端解不开二进制 | 格式版本不对，看 `docs/IMPORT.md` §1.2 |
| 415 | Content-Type 不对 | 正常不会出现，检查是否有代理改写请求 |
| 204 | 接受（**不代表写成功**） | 看紧随其后的 `GET 校验结果` |

注意：只要服务端返回 204，**即使回读校验不通过，标记文件也已经写下了**（这是故意的——204 之后无法确定数据是否落盘，宁可拦住第二次导入）。校验不是 `ok` 时，按第 5 节回滚、删掉标记，再排查原因后重来。

---

## 4. 怎么验证真的生效了

按可信度从高到低：

1. **脚本自己的回读**（最强）：`GET /_/sync/data` 返回的文件能被 `parseFile` 解析，最后一条记录的 `length/time/errors/complexity` 与本次载荷一致。这一条过了，就说明数据在服务端文件里，且能被客户端读懂。

2. **文件大小**：`data\user_stats\000\000\000000001` 应该存在，大小为 **225 字节**（= 8 header + 217 记录；脚本会打印"文件增长"那一行）。没登录过的话这个文件是新建的，大小正好等于载荷字节数 233 减去 scramble 的 8 字节。

   ```bash
   find /c/Users/<you>/keytrace-web/data/user_stats -type f -exec ls -l {} \;
   ```

3. **`/practice` 的选键变了**（最直观）：

   - 导入记录携带 `TextType.KEYTRACE`（xid `5`）。在默认的 `auto`（KeyTrace 联动）模式下，检测到 KeyTrace 记录后自动进入**全键解锁弱键驱动**模式（不再显示待解锁字母）；若在设置中切到 `standalone`（独立网页模式），则自动隔离 `TextType.KEYTRACE` 记录并保留原版 6 键起步渐进解锁课程。
   - 页面顶部 `CurrentKey` 区域（`keybr-lesson-ui/lib/CurrentKey.tsx`）：若存在 `confidence < 1` 的弱键，会 focus 到其中最弱（最慢）的一个；按示例数据（英文目标 175 CPM ≈ 343ms；中文默认 125 CPM ≈ 480ms），未达速的键会被优先针对训练。
   - 若全部达速，则显示 `All keys are unlocked.`。
   - **错误率折算（可选）**：keybr 原生选键只看 `timeToType`，不直接看错误率。若希望把高错误率但速度较快的键（例如高频 typo 键）也纳入弱键重点练习，可在导入时传入 `--error-weight <k>`（如 `--error-weight 3`，详见第 7 节）。

4. **`/profile` 有数据了**：`All time` 摘要出现速度/准确率，日历上出现 `2026-11-17` 这一天，`Key Speed Chart` / `Key Frequency Heatmap` 出现 26 个字母的柱子。

5. **`GET /_/sync/data` 手工核对**：

   ```bash
   curl -s -b "session=<值>" http://localhost:3000/_/sync/data | wc -c
   ```

   期望 225（同上）。服务端设了 `Content-Length`（`UserData.serve` 里 `ctx.response.length = stats.size`）且关掉了压缩，所以字节数是准的。

---

## 5. 回滚

先看标记文件，它记下了"导入前长什么样"：

```json
{
  "importedAt": "2026-11-18T...",
  "statsFile": "C:\\Users\\<you>\\.keytrace\\stats.json",
  "record": { "length": 6654, "time": 4410580, "errors": 34, "complexity": 36, "speed": 90.5 },
  "userStats": [ { "file": "C:\\...\\data\\user_stats\\000\\000\\000000001", "previousSize": null } ],
  "verification": "ok（...）"
}
```

`userStats[]` 是脚本通过"导入前后对比目录"反查出来的（文件名的数字就是内部 user id），所以不用去猜 id。`previousSize: null` 表示导入前这个文件不存在。

### 情况 A：`previousSize` 是 `null`（最常见）

删文件即可：

```bash
rm "C:/Users/<you>/keytrace-web/data/user_stats/000/000/000000001"
```

### 情况 B：`previousSize` 是数字（导入前已有练习记录）

把文件截断回导入前的大小（**停止一切练习**之后再做，否则会截掉新数据）：

```bash
node -e "require('node:fs').truncateSync(process.argv[1], Number(process.argv[2]))" \
  "C:/Users/<you>/keytrace-web/data/user_stats/000/000/000000001" 1234
```

不要直接删：那会把导入前的练习记录一起丢掉。

### 最后一定要做的

```bash
rm "C:/Users/<you>/keytrace-web/data/user_stats/keytrace-import.marker"
```

删掉标记，守卫才会放行下一次导入（**只在数据已经回滚之后删**，否则等于绕过保护）。

### 另外两件撤不掉的事

- **排行榜**：`POST /_/sync/data` 会顺带 `HighScores.append()`。本次记录 `length=6654 (>=50)`、`complexity=36 (>=10)`、时间戳在两周有效期内，会被收进 `DATA_DIR\highscores.json`，score 约 12390，很可能直接顶到本地第一名。**没有删除 API**，只能等两周自然过期，或者停服后手改 `highscores.json`（改之前先备份）。
- **服务端的 `DELETE /_/sync/data` 不是回滚工具**。它把文件改名成 `...~1` 而不是删除，效果是"该用户所有历史都没了"（不只是本次导入），并且 `~1` 文件还留在磁盘上。除非你就是要清空整个账号，否则别用。

浏览器 IndexedDB 里可能还有一份匿名历史（`storage.ts:148-161`：远端非空时本地数据被静默搁置），导入不会碰它，回滚也不会。

---

## 6. 为什么不许导第二次

KeyStats 不是累加，是指数平滑（`packages/keybr-result/lib/keystats.ts`，α=0.1）：

```
timeToType = 0.1 × 新样本 + 0.9 × 上一次的值
bestTimeToType = min(历史所有平滑值)      // 只降不升
```

实测（`docs/IMPORT.md` §1.4）：输入 200 → 300 → 1000，结果是 `timeToType=289`、`bestTimeToType=200`。所以：

- 导一次：`timeToType` 精确等于 KeyTrace 的值（n=1，平滑等于原值）。
- 导两次：变成 `0.1×新 + 0.9×旧`，和任何一次 `stats.json` 都对不上。
- 顺序还有影响，且 `bestTimeToType` 只降不升，越导越"乐观"，最终 26 个键全部解锁、练习失去针对性。

这就是脚本写标记并拒绝第二次运行的原因。

---

## 7. 技术细节与可选错误率加权

### 已验证的运行时行为

- **`DATA_DIR`**：`keybr-server.bat` 固定将 `DATA_DIR` 设为 `<仓库根目录>\data`，用户统计落在 `data\user_stats\000\000\<9位id>`；脚本会在导入前后扫描该目录并把真实写入路径记录进 `keytrace-import.marker`。
- **会话 Cookie**：服务端默认 `COOKIE_NAME = "session"`，值格式为 `[a-zA-Z0-9]+`；若自定义了 `COOKIE_NAME`，直接在 `KEYBR_COOKIE` 里传整段 `名字=值` 即可。
- **端到端写入与校验**：`POST /_/sync/data` 接受 `application/octet-stream`（`formatMessage()` 输出的加扰二进制），并在写入后立即执行 `GET /_/sync/data` 回读解析校验。
- **记录标识（`TextType.KEYTRACE`）**：导入脚本写入的记录固定标记为 `TextType.KEYTRACE`（`textType = "keytrace"`，xid `5`），以便前端在 `auto` 模式中识别为 KeyTrace 弱键数据源，在 `standalone` 模式中将其完全隔离而不污染独立网页进度。
- **加扰二进制布局**：由 `@keybr/result-io` 的 `formatMessage()` 统一生成（`packages/keybr-binary/lib/secret.ts` 从第 4 字节起 XOR 覆盖 crc32 与载荷），无需手工拼字节。
- **时间戳精度**：二进制格式 `writeResult` 以秒为单位存储（`round(timeStamp / 1000)`），`/profile` 上相差 1 秒属正常行为。

### 可选错误率加权（`--error-weight <k>`）

keybr 原生 `KeyStats` / `GuidedLesson` 选键模型只使用 `timeToType`，不直接根据 `missCount` 触发弱键练习。

- 默认 `--error-weight 0`：保持纯速度映射（`timeToType = clamp(round(ikiP50Ms), 40, 12000)`），与历史行为完全一致。
- 启用 `--error-weight <k>`（`k > 0`，推荐 `2`–`4`，对应 `docs/IMPORT.md` §1.5）：按公式

  ```
  typoRate            = missCount / hitCount
  timeToType_effective = clamp(round(ikiP50Ms * (1 + k * typoRate)), 40, 12000)
  ```

  放大高错误率键的等效耗时，使高频误触键的 `confidence` 落到 `< 1`，从而被 `/practice` 自动选为重点练习键。

示例（中文双拼 + 错误率权重 `3` 的 dry run）：

```bash
DATA_DIR="/c/Users/<you>/keytrace-web/data" \
  node --import @keybr/tsl scripts/import-keytrace.ts --layout zh-sp --error-weight 3
```

---

## 8. 命令速查

```bash
cd /c/Users/<you>/keytrace-web
export DATA_DIR="/c/Users/<you>/keytrace-web/data"

# dry run（默认 en-us，--error-weight 0）
node --import @keybr/tsl scripts/import-keytrace.ts

# dry run（中文小鹤双拼 + 错误率加权）
node --import @keybr/tsl scripts/import-keytrace.ts --layout zh-sp --error-weight 3

# 登录（拿到 cookie 后从 cookies.txt 或 DevTools 复制 session 值）
curl -s -i -c cookies.txt http://localhost:3000/login/xyz | head

# 上传
KEYBR_COOKIE="session=<值>" node --import @keybr/tsl scripts/import-keytrace.ts --send

# 核对
curl -s -b "session=<值>" http://localhost:3000/_/sync/data | wc -c

# 回滚（先确认标记文件里 previousSize 为 null）
rm "data/user_stats/000/000/000000001"
rm "data/user_stats/keytrace-import.marker"
```

参数：`--send` / `--dry-run` / `--stats <path>` / `--layout <id>` / `--error-weight <k>` / `--force` / `--data-dir <path>` / `--url <url>` / `--help`。
环境变量：`KEYBR_COOKIE`、`KEYBR_URL`、`DATA_DIR`。

---

## 9. 中文双拼词表（words-zh-sp.json）是怎么来的

`packages/keybr-content-words/lib/data/words-zh-sp.json` 不是手写的，由
`C:\Users\<you>\keytrace\tools\gen_zh_words.py` 生成。

### 一个元素对应几个汉字

小鹤双拼里一个汉字固定占两键，所以数组里每个元素的**长度 = 汉字数 × 2**：

| 码串长度 | 汉字数 | 例子 |
| --- | --- | --- |
| 4 | 2 字词 | `hcde` = 好(hc) 的(de) |
| 6 | 3 字词 | `uiuzui` = 石(ui) 首(uz) 市(ui) |
| 8 | 4 字成语 | `tokzeriu` = 脱(to) 口(kz) 而(er) 出(iu) |

界面渲染时按两键切一个汉字。所以词表里不会有单字音节，也不会有奇数长度的串。

### 数据来源

- 字形 → 读音：优先查 `mozillazg/phrase-pinyin-data` 的 `pinyin.txt`（MIT，形如
  `银行: yín háng`，四万多条词组，自带含多音字消歧的读音）。词组里查不到的词，
  再逐字回退到 `keytrace/data/zh-hanzi.tsv`（7258 个常用字，第 4 列就是小鹤双拼两键）。
- 词表与词频：jieba 的 `dict.txt`（MIT，每行 `词 词频 词性`），词性 `i` 表示成语。

### 多音字怎么处理

`zh-hanzi.tsv` 每个字只存一个「最常用读音」，逐字拼接会把多音字拼错
（「银行」→ `yin xing`、「重新」→ `zhong xin`）。所以编码顺序是：

1. 整词命中 `pinyin.txt` → 用该词自带读音（`银行` = `yín háng`、`重新` = `chóng xīn`）；
2. 没命中 → 逐字查 tsv。这条路对多音字仍可能出错，但实测常见多音字词基本都在
   词组表里（抽查 30 个多音字词，只有「中间」这类本来没有读音分歧的词走了回退）；
3. 两条路都失败 → 整词丢弃。

拼音先由 `tools/gen_zh_data.py` 的 `strip_tone()` 去声调并把 ü 系转成 v
（`lǜ`→`lv`），再由同一个文件里的 `shuangpin()` 转成小鹤双拼两键，不另写一套规则。
本次生成有 2447 / 5217 条（44.5%）走的是词组读音，其余 3053 条逐字回退。

### 生成规则

1. 普通词：2–3 个汉字、读音能查到（词组表或 tsv），按词频取前 4000 个。
2. 成语：4 个汉字且词性含 `i`，按词频取前 1500 个。
3. 过滤掉纯数字、含英文字母或标点、含生僻字的词（整词丢弃）。
4. 普通词 + 成语合并，按词频降序，**同一个双拼码串只保留最高频的那一个**
   （大量同音词会撞码，例如「公式 / 公事」）。
5. 输出全部小写、长度偶数，JSON 数组，每行一个，无结尾换行。

当前结果：普通词 3719 条（双字 3449 + 三字 270）、成语 1498 条，共 5217 条，
成语实际占比 28.7%（理论值 27.3%，去重时双字词撞码更多，比例被抬高）。
想压到 25% 左右用 `--idioms 1300`（实测 25.9%）。

### 重新生成

```bash
# 1. 拿词典（需要代理；/tmp/dict.txt 已有可跳过）
export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897
curl -sSL --ssl-no-revoke -o /tmp/dict.txt \
  https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt

# 2. 拿词组读音（同上，已有 /tmp/phrase-pinyin.txt 可跳过）
curl -sSL --ssl-no-revoke -o /tmp/phrase-pinyin.txt \
  https://raw.githubusercontent.com/mozillazg/phrase-pinyin-data/master/pinyin.txt

# 3. 生成（在 keytrace 仓库根目录）
cd /c/Users/<you>/keytrace
python tools/gen_zh_words.py \
  --hanzi data/zh-hanzi.tsv \
  --dict /tmp/dict.txt \
  --phrase-pinyin /tmp/phrase-pinyin.txt \
  --out /c/Users/<you>/keytrace-web/packages/keybr-content-words/lib/data/words-zh-sp.json \
  --words 4000 --idioms 1500
```

参数：`--hanzi` 字表 / `--dict` jieba 词典 / `--phrase-pinyin` 词组读音表
（不传则退回纯逐字，用于对比）/ `--out` 输出 json / `--words` 普通词上限 /
`--idioms` 成语上限 / `--idiom-ratio` 目标成语占比
（>0 时按比例回算普通词数，但不超过 `--words`；0 表示不限制）。

脚本会打印各类条数、实际占比与「词组表 / 逐字回退」的读音来源分布，并断言输出全为
小写字母、长度为偶数。生成后由人工重启 / 重新构建 keybr 生效。
