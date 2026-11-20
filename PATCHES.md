# keybr.com 本地 fork 补丁归档

> 本文档记录本仓库相对上游 `aradzie/keybr.com` 的全部本地改动，用于上游更新后重放。
> 生成方式：`git status --short` + `git diff`，配合阅读未跟踪文件本身。

---

## 0. 这个 fork 是什么

**一句话**：这是 keybr.com（GPL-3.0）的本地自用 fork，基于上游 `master` 分支的 tar 快照
（解压于 2026-09-29，`package.json` 的 `version` 为 `0.0.0`，上游不维护发布版本号），
唯一目的是练习**中文小鹤双拼**：新增一个 `zh-sp` 语言/键盘布局，把两键一个音节渲染成汉字。

- 上游仓库：https://github.com/aradzie/keybr.com
- 许可证：GPL-3.0（见 `LICENSE`，共 34503 字节，为完整 GPLv3 文本）
- 本地基线提交：`2c4f0f2 init`（**只有一个提交**，且没有配置 git remote，无法从仓库内反查上游 commit hash）
- 基线判定：快照文件 mtime 为 `2026-09-29 02:39`，本地编辑发生在 `2026-11-17` 之后
- 运行环境：Node `v22.22.2`（`packages/keybr-config/lib/knex/node-sqlite.ts` 依赖内置 `node:sqlite`，故必须 Node ≥ 22.5 且启动时带 `--experimental-sqlite`）
- 数据库：`sqlite`（`DATABASE_CLIENT=sqlite`），本地库文件 `data/keybr.sqlite`

### 重要：有一批改动已经「烧进」了 init 提交

`git diff` 只显示未提交改动，但有 3 处本地改动因为发生在 `git init` + `commit` 之前，
**在 diff 里完全看不到**，却真实存在。它们的 mtime 是 `2026-11-17 20:20`，而 init 提交晚于这个时间。
上游更新后重放时**必须**一并处理，详见 §2。

---

## 1. 改动总览

### 1.1 已修改文件（`git status` 显示 ` M`，共 14 个）

| 文件路径 | 性质 | 为什么 |
| --- | --- | --- |
| `webpack.config.js` | 修改 | ① Windows 路径分隔符导致 assets 规则匹配失败 ② 服务器端把 mysql/oracle/pg 等可选驱动标成 external |
| `webpack-manifest.js` | 修改 | Windows 下 `path.join` 产出反斜杠，manifest 里的资源名变成 `a\b.js`，浏览器取不到 |
| `packages/keybr-keyboard/lib/layout.ts` | 修改 | 新增 `Layout.ZH_SP` 并放进 `Layout.ALL`（紧邻 `EN_US` 之后，列表首位） |
| `packages/keybr-keyboard/lib/load.ts` | 修改 | 把 `LAYOUT_ZH_SP` 字符表注册进 `layouts` Map，否则加载布局时抛错 |
| `packages/keybr-phonetic-model-loader/lib/assets.ts` | 修改 | 为 `Language.ZH_SP` 返回 `model-zh-sp.data`，否则练习生成器没有统计模型 |
| `packages/keybr-content-words/lib/load.ts` | 修改 | 为 `Language.ZH_SP` 加载 `words-zh-sp.json`，否则没有练习词表 |
| `packages/keybr-intl/lib/displaynames.ts` | 修改 | `zh-sp` 不是标准语言标签，`Intl.DisplayNames` 原样吐出 `zh-sp`，改成「中文双拼（小鹤）」 |
| `packages/keybr-keyboard-ui/lib/Key.tsx` | 修改 | zh-sp 下键帽不显示 a–z，显示该键承担的音（U→sh、C→ao） |
| `packages/keybr-keyboard-ui/lib/Key.module.less` | 修改 | 新增 `.zhSymbol` / `.zhSymbolSmall` 两个键帽文字样式 |
| `packages/keybr-textinput-ui/lib/TextArea.tsx` | 修改 | 增加 `zh` 开关，zh-sp 时用 `ZhLines` 替代 `TextLines` 渲染 |
| `packages/page-practice/lib/practice/Presenter.tsx` | 修改 | 判断当前布局是否为 zh-sp，把 `zh` 传给 3 处 `TextArea` |
| `packages/keybr-pages-browser/lib/App.tsx` | 修改 | 删除账号/高分榜/布局库/多人对战/个人页/打字测试/服务条款/隐私政策 8 个路由（本地自用不需要） |
| `packages/keybr-pages-browser/lib/NavMenu.tsx` | 修改 | 导航只留 主题切换 / 练习 / 帮助；删掉账号头像、语言下拉、SubMenu |
| `packages/keybr-pages-browser/lib/Template.tsx` | 修改 | 删掉顶部 970×90 与右侧 160×600 广告位，统一走非 premium 布局 |

### 1.2 新增文件（`git status` 显示 `??`，共 6 项）

| 文件路径 | 性质 | 为什么 |
| --- | --- | --- |
| `packages/keybr-keyboard/lib/layout/zh_sp.ts` | 新增 | zh-sp 布局的字符表（与 en-us 一样是标准 US 键位，标了 "Generated file, do not edit."） |
| `packages/keybr-keyboard-ui/lib/zhKeyLabels.ts` | 新增 | 小鹤双拼键位图：键 id → 该键承载的声母/韵母，供键帽渲染使用 |
| `packages/keybr-textinput-ui/lib/zhMap.ts` | 新增 | 双拼两键码 → 该音节最高频汉字（约 400 条），供汉字渲染使用 |
| `packages/keybr-textinput-ui/lib/ZhLines.tsx` | 新增 | 汉字渲染组件：按词分组、画汉字、可选显示双拼码、标红/高亮 |
| `keybr-server.bat` | 新增 | 本地生产模式启动脚本（设置 sqlite / cookie / APP_URL 等环境变量后前台跑 `root/index.js`） |
| `data/keybr.sqlite` | 新增 | 本地运行产生的 57 KB SQLite 库（**运行数据，不是源码，不应归档**） |

### 1.3 已在 init 提交中、diff 不可见的改动（见 §2）

`packages/keybr-keyboard/lib/language.ts`、`packages/keybr-content-words/lib/data/words-zh-sp.json`、
`packages/keybr-phonetic-model/assets/model-zh-sp.data`、`packages/keybr-generators/dictionaries/dictionary-zh-sp.csv.gz`。

**合计**：修改 14 + 新增 4（源码）+ 2（本地运行配套）+ 4（基线内中文资源/语言定义）。

---

## 2. 基线中已包含的改动（重放时最容易漏）

### 2.1 `packages/keybr-keyboard/lib/language.ts` — 新增 `Language.ZH_SP`

改动前（截断）：`UK` / `VI` 定义之后直接是 `static readonly ALL = new Enum<Language>(...)`。

改动后（`language.ts:210-215`）：

```ts
  static readonly ZH_SP = new Language(
    /* id= */ "zh-sp",
    /* script= */ "latin",
    /* direction= */ "ltr",
    /* alphabet= */ "abcdefghijklmnopqrstuvwxyz",
  );
```

并在枚举里追加（`language.ts:252`，位于 `Language.VI` 之后、`ALL` 定义末尾）：

```ts
    Language.VI,
    Language.ZH_SP,
  );
```

> 注意：`JA`（日语）在上游是被注释掉的（`// Language.JA,`），新增项不要插在它附近被误注释。

**为什么**：没有这个枚举项，`Layout.ZH_SP`、`loadWordList`、`modelAssetPath` 里的 `case Language.ZH_SP` 全都编译不过。
`script` 用 `latin` 是因为练习文本本身就是 a–z 双拼码，输入法状态机不需要知道汉字。

**重放**：在 `language.ts` 里 `VI` 之后照抄这段；在 `ALL` 的最后追加 `Language.ZH_SP,`。

### 2.2 中文数据文件（直接拷贝，不需要重写）

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `packages/keybr-content-words/lib/data/words-zh-sp.json` | 3186 B，约 500 个小写双拼码（`"ui","le","zd","yz",…`） | 练习文本来源 |
| `packages/keybr-phonetic-model/assets/model-zh-sp.data` | 19748 B | 音素/字母统计模型（布局学习曲线的输入） |
| `packages/keybr-generators/dictionaries/dictionary-zh-sp.csv.gz` | 2061 B | 生成器输入词典，参与 `model-zh-sp.data` 的再生成 |

**重放**：从本归档的旧副本直接把这三个文件拷到对应路径。它们不是手写的，是工具产物。

> ⚠ 再生成路径已断：`zhMap.ts` 注释写「由 `data/zh-hanzi.tsv` 生成…重新生成：`python tools/gen_zh_map.py`」，
> 但仓库里既没有 `tools/` 目录，也没有 `data/zh-hanzi.tsv`。**这两个产物目前无法再生成**，见 §4 已知限制。

---

## 3. 逐条详述

### P1. Windows 路径分隔符：webpack 资源规则（2 处）

**文件**：`webpack.config.js`

(a) server 配置的 null-loader 规则，`webpack.config.js:135`

改动前：

```js
        {
          test: /\/assets\//,
          use: "null-loader",
        },
```

改动后：

```js
        {
          test: /[\\/]assets[\\/]/,
          use: "null-loader",
        },
```

(b) browser 配置的 asset 规则，`webpack.config.js:192`（`rule_less(true)` 之后那条）

改动前：

```js
        {
          test: /\/assets\//,
          type: "asset/resource",
        },
```

改动后：

```js
        {
          test: /[\\/]assets[\\/]|\.(svg|mp3|png|jpe?g|gif|webp|woff2?|ttf|eot)$/,
          type: "asset/resource",
        },
```

**为什么**：webpack 的 `test` 拿到的是**绝对路径**，Windows 上是 `C:\Users\Gordo\keybr.com\packages\keybr-phonetic-model\assets\model-zh-sp.data`。
原来只匹配正斜杠，整条规则失效 → `.data` 模型文件被当成 JS 解析，报 `Module parse failed`。
改成 `[\\/]` 双分隔符兼容；browser 侧再补一组扩展名兜底，让不在 `assets/` 目录下的 svg/音频/字体也能走 `asset/resource`。

**重放**：找到 server 配置里 `rule_less(false)` 后面那条 `test: /\/assets\//`，改成 `[\\/]` 版本；
找到 browser 配置里 `rule_less(true)` 后面那条 `test: /\/assets\//, type: "asset/resource"`（**不要**动 `use: "null-loader"` 那条），换成双条件版本。

### P2. Windows 路径分隔符：manifest（1 处）

**文件**：`webpack-manifest.js:1-2`

改动前：

```js
import { basename, extname, join } from "node:path";
```

改动后：

```js
import { basename, extname, posix } from "node:path";
const join = posix.join;
```

**为什么**：`ManifestPlugin` 用 `join()` 拼资源名写进 `manifest.json`。Windows 上 `path.join` 产出 `browser\abc123.js`，
而浏览器实际请求是 `/assets/browser/abc123.js`，两边对不上 → 页面找不到 JS/CSS。
`posix.join` 强制正斜杠。Windows 的 `fs` 本身接受正斜杠，所以不影响文件系统操作。

**重放**：改掉 import，加一行 `const join = posix.join;`（若上游已改用 `posix.join` 或 `path.posix`，则整条 patch 可跳过）。

### P3. 服务器端 externals：跳过未安装的可选数据库驱动

**文件**：`webpack.config.js:105-117`（server 配置里 `mode` 之后）

改动前：server 配置直接从 `context` 开始。

改动后：

```js
    // 只在用 mysql/oracle 等数据库时才需要的可选驱动，本地跑 sqlite 用不到，
    // 不装这些包就没法打包。标成运行时外部依赖，webpack 不再静态去找它们。
    externals: {
      mysql2: "commonjs mysql2",
      mariadb: "commonjs mariadb",
      oracledb: "commonjs oracledb",
      "pg-native": "commonjs pg-native",
      pg: "commonjs pg",
      tedious: "commonjs tedious",
      "better-sqlite3": "commonjs better-sqlite3",
    },
```

**为什么**：knex 会静态 `require` 所有方言驱动，本机只装了 sqlite 相关包，webpack 直接报 `Module not found` 打不出包。
标成 external 后打包阶段不再解析，运行时也不会被加载。

> ⚠ **这条 patch 目前是无效代码**：同一个 server 配置对象在 `webpack.config.js:149` 已有另一个 `externals`
> （`sqlite3` / `bufferutil` / `utf-8-validate`）。JS 对象字面量重复键**后者覆盖前者**，所以新加的
> mysql/pg 列表被丢掉了。若当前构建能通过，说明真正起作用的不是这条。详见 §4。

**重放**：**不要**再新增第二个 `externals` 键，而是把 `mysql2`…`better-sqlite3` 这几行**合并进**文件底部
`externals: { "sqlite3": …, "bufferutil": …, "utf-8-validate": … }` 那个对象里。

### P4. 语言与布局注册（3 个文件协同）

**文件**：`packages/keybr-keyboard/lib/layout.ts`、`packages/keybr-keyboard/lib/load.ts`、`packages/keybr-keyboard/lib/layout/zh_sp.ts`

`layout.ts:34-48` 新增（插在 `EN_US` 之后、`EN_DVORAK` 之前）：

```ts
  static readonly ZH_SP = new Layout(
    /* id= */ "zh-sp",
    /* xid= */ 0xff,
    /* name= */ "{CN}",
    /* family= */ "qwerty",
    /* language= */ Language.ZH_SP,
    /* emulate= */ false,
    /* geometries= */ new Enum(
      Geometry.ANSI_101,
      Geometry.ANSI_101_FULL,
      Geometry.ISO_102,
      Geometry.ISO_102_FULL,
      Geometry.MATRIX,
    ),
  );
```

`layout.ts:1428` 在 `Layout.ALL` 首位插入 `Layout.ZH_SP,`（原本第一位是 `Layout.EN_US`）。

`load.ts:66` 与 `load.ts:176`：

```ts
import { LAYOUT_ZH_SP } from "./layout/zh_sp.ts";
  …
  [Layout.ZH_SP, LAYOUT_ZH_SP],
```

`layout/zh_sp.ts` 是新文件，内容就是标准 US 键位的字符表（`Backquote`…`Space`，每个键两三个码位），
与 `layout/en_us.ts` 完全同构，文件头标着 `// Generated file, do not edit.`。
它只影响「这个键能打出哪些字符」，不影响汉字显示。

**为什么**：上游把「语言」和「键盘布局」拆成两层，缺任何一层都会在 `loadKeyboard()` 时抛错。
`xid=0xff` 沿用了 `Layout.custom()` 的占位值（`Layout.ALL` 内唯一，但**与内存里动态创建的 Custom 布局同值**，见 §4）。
`emulate: false` 表示不模拟别的布局。

**重放**：
1. 复制 `layout/zh_sp.ts`（直接拷 `en_us.ts` 改导出名也行）；
2. `layout.ts` 里 `EN_US` 定义后插入 `ZH_SP` 块，`ALL` 首位插入 `Layout.ZH_SP,`；
3. `load.ts` 按字母序位置插 import（`en_us.ts` 之后）和 Map 条目。

### P5. 词表与声学模型

**文件**：`packages/keybr-content-words/lib/load.ts:244-250`、`packages/keybr-phonetic-model-loader/lib/assets.ts:36,108-109`

`load.ts`：

```ts
    case Language.ZH_SP:
      return (
        await import(
          /* webpackChunkName: "words-zh-sp" */ "./data/words-zh-sp.json",
          { with: { type: "json" } }
        )
      ).default;
```

`assets.ts`：

```ts
import ZH_SP from "@keybr/phonetic-model/assets/model-zh-sp.data";
  …
    case Language.ZH_SP:
      return ZH_SP;
```

**为什么**：`loadWordList` / `modelAssetPath` 都是穷举 `switch`，末尾 `default: throw new Error();`。
不加分支，任何用到 zh-sp 的页面都会直接抛异常。

**重放**：两个 switch 都在最后一个正式 `case`（`Language.VI`）之后、`default` 之前加 `Language.ZH_SP` 分支；
`assets.ts` 的 import 追加在 `VI` 那行后面。若上游新增了语言，注意别插到 default 之后。

### P6. 语言显示名

**文件**：`packages/keybr-intl/lib/displaynames.ts:27-32, 39-42`

改动前：`formatLanguageName` / `formatLocalLanguageName` 都直接走 `Intl.DisplayNames`。

改动后（两个函数各加一段）：

```ts
  const formatLanguageName = (id: string): string => {
    // 自定义语言没有标准语言标签，Intl 只会把 id 原样吐出来，
    // 列表里就成了 "zh-sp"，没人认得出这是双拼。
    if (id === "zh-sp") {
      return locale.startsWith("zh") ? "中文双拼（小鹤）" : "Chinese Shuangpin";
    }
```

```ts
  const formatLocalLanguageName = (id: string): string => {
    if (id === "zh-sp") {
      return "中文双拼（小鹤）";
    }
```

**为什么**：`zh-sp` 不符合 BCP-47，`Intl.DisplayNames` 返回 `undefined`/原样 id，UI 上就是个 `zh-sp`。
本地自用只有小鹤一套键位，名称直接硬编码，不做 i18n 资源（也就没有 `messages/*.json` 的改动）。

**重放**：两个格式化函数开头各插一个 `if (id === "zh-sp")` 早返回。
若上游重构成别的结构，直接搜 `formatLanguageName` 和 `formatLocalLanguageName`。

### P7. 键帽显示双拼音（3 个文件）

**文件**：`packages/keybr-keyboard-ui/lib/Key.tsx`、`packages/keybr-keyboard-ui/lib/Key.module.less`、`packages/keybr-keyboard-ui/lib/zhKeyLabels.ts`

**(a) `zhKeyLabels.ts`（新文件，24 条）**

```ts
export const ZH_KEY_LABELS: Record<string, readonly string[]> = {
  KeyQ: ["iu"], KeyW: ["ei"], KeyE: ["e"], KeyR: ["uan", "üan"], KeyT: ["ue", "üe"],
  KeyY: ["un", "ün"], KeyU: ["sh", "u"], KeyI: ["ch", "i"], KeyO: ["uo", "o"], KeyP: ["ie"],
  KeyA: ["a"], KeyS: ["ong", "iong"], KeyD: ["ai"], KeyF: ["en"], KeyG: ["eng"], KeyH: ["ang"],
  KeyJ: ["an"], KeyK: ["ing", "uai"], KeyL: ["iang", "uang"], KeyZ: ["ou"], KeyX: ["ia", "ua"],
  KeyC: ["ao"], KeyV: ["zh", "ui", "ü"], KeyB: ["in"], KeyN: ["iao"], KeyM: ["ian"],
};
```

**为什么**：注释说明「数据来自 flypy.cc 的键位图，和我们算双拼码的表是同一张，只是反了个方向」——
即 `zhMap.ts` 是「码→字」，这里是「键→音」，互为转置。键帽上再显示 a–z 对练双拼毫无意义。

**(b) `Key.tsx`**：签名从解构改为整体接收语言对象，并按语言分支渲染。

```ts
export function makeKeyComponent(
-  { letterName }: Language,
+  language: Language,
  shape: KeyShape,
): FunctionComponent<KeyProps> {
+  const { letterName } = language;
   const { isCodePoint, isDead, isLigature } = KeyCharacters;
   const { id, a, b, c, d } = shape;
+
+  // 中文双拼：键帽不显示 a-z，直接显示这个键打的音（U 是 sh，C 是 ao）
+  const zh = language.id === "zh-sp" ? ZH_KEY_LABELS[id] : undefined;
```

渲染处把原来那一大串 `isCodePoint / isDead / isLigature` 判断**整体缩进包进 `else`**，前面加 `if (zh != null)`：

```ts
  if (zh != null) {
    children.push(makeZhLabels(zh, w, h));
  } else {
    … 原来的全部标签逻辑，一字未改 …
  }
```

新增绘制函数（`Key.tsx:156-170`）：

```ts
  function makeZhLabels(labels: readonly string[], w: number, h: number): ReactNode {
    const text = labels.join("/");
    return makeLabel(
      { text, pos: [w / 2, h / 2 + 1], align: ["m", "m"] },
      text.length > 2 ? styles.zhSymbolSmall : styles.zhSymbol,
    );
  }
```

**(c) `Key.module.less:112-124`**

```less
/* 中文双拼键帽：直接标这个键打的音（sh / ao …），不再显示字母 */
.zhSymbol {
  font-size: 11px;
  font-weight: 500;
  fill: var(--KeyboardKey-symbol__color, currentColor);
}

.zhSymbolSmall {
  font-size: 7.5px;
  font-weight: 500;
  letter-spacing: -0.2px;
  fill: var(--KeyboardKey-symbol__color, currentColor);
}
```

**为什么**：`R/T/Y/U/I/O/V/K/L/X` 等键有两个音（如 `V` = zh/ui/ü），拼起来是 `zh/ui/ü`（7 字符），
11px 会溢出键帽，所以超过 2 字符降级到 7.5px + 负字距。颜色沿用主题变量，暗色主题下也能看清。

**重放**：`Key.tsx` 里搜 `makeKeyComponent`，改签名 → 加 `zh` 判断 → 原逻辑整体包进 `else`（只是缩进，逻辑零改动）→
末尾加 `makeZhLabels`。`less` 追加两个类。`zhKeyLabels.ts` 直接拷贝。

> 本 patch 依赖的调用方签名没变（调用处一直传 `language` 对象），所以**不需要改其他调用点**。

### P8. 汉字渲染（4 个文件）

**文件**：`packages/keybr-textinput-ui/lib/TextArea.tsx`、`packages/keybr-textinput-ui/lib/ZhLines.tsx`（新）、`packages/keybr-textinput-ui/lib/zhMap.ts`（新）、`packages/page-practice/lib/practice/Presenter.tsx`

**(a) `TextArea.tsx`**：新增可选属性（`TextArea.tsx:37,52-53`）

```ts
   size,
   lineTemplate,
   demo,
+  zh,
   moving,
```

```ts
+  /** 中文双拼模式：按词渲染成汉字，可选显示双拼码 */
+  readonly zh?: boolean;
```

渲染切换（`TextArea.tsx:112-127`）：

```ts
-      <TextLines
-        settings={settings}
-        lines={lines}
-        …
-      />
+      {zh ? (
+        <ZhLines lines={lines} focus={demo || focus} />
+      ) : (
+        <TextLines … />
+      )}
```

**(b) `Presenter.tsx`**：判定 + 注入 3 处（`Presenter.tsx:90-92, 115, 149, 182`）

```ts
+    // 中文双拼：练习文本是两个字母一个词，交给 ZhLines 画成汉字
+    const zh = state.settings.get(keyboardProps.language).id === "zh-sp";
```

```ts
                 <TextArea
                   focusRef={this.focusRef}
                   settings={state.textDisplaySettings}
+                  zh={zh}
                   lines={lines}
```

三处分别是 `View.Normal`（size `X0`）、X1、X2 三个字号分支——**新增 TextArea 时必须补 `zh={zh}`**。

**(c) `ZhLines.tsx`（新，约 200 行）**：核心设计是「只改渲染，不动输入状态机」——

```ts
// 汉字显示：keybr 的练习文本在 zh-sp 下是两个字母一个"词"（bm = 便）。
// 这里按词分组，把 bm 画成「便」，可选在它上方显示 bm 这两个键。
// 只改渲染，不动输入状态机——字母还是一个个按，光标/统计逻辑完全不用碰。
```

分组：以空格为界，把连续非空格字符收成一个 group（练习词表里每个词正好 2 个字母），
组内任一字符 Miss 则整字标红，有 Cursor 则按光标色。`colorOf()` 按 `Attr` 位判断：

```ts
function colorOf(attrs: number): string {
  if ((attrs & 2) !== 0) return "#d4503a"; // Miss
  if ((attrs & 8) !== 0) return "#e8e6e3"; // Cursor
  if ((attrs & 1) !== 0) return "#6f9a7c"; // Hit
  return "#6b675f";                       // Normal
}
```

对应 `packages/keybr-textinput/lib/chars.ts` 的 `Attr`（`Normal=0, Hit=1, Miss=2, Garbage=4, Cursor=8`），位值正确。

样式全部写成内联对象（没有 `.module.less`），字号写死 42px，中文字体 `"Songti SC", "SimSun", serif`。

「显示双拼码」开关持久化到 `localStorage`，键名 `keytrance.zh.showCode`，默认开启，隐私模式写失败时静默降级。

**(d) `zhMap.ts`（新，约 400 条）**：`ZH_CODE_TO_CHAR`，双拼两键码 → 该音节最高频单字：

```ts
// 由 data/zh-hanzi.tsv 生成：双拼两键 -> 该音节下最高频的汉字。
// 屏幕上一个"词"就是一个音节，用它来做汉字显示。
// 重新生成：python tools/gen_zh_map.py
export const ZH_CODE_TO_CHAR: Record<string, string> = {
  aa: "啊", ai: "爱", an: "按", ao: "奥", ba: "把", bb: "滨", …
```

**为什么**：keybr 的文本模型是「字符逐个打」，天生不支持输入法。最省事又完全不破坏统计/光标逻辑的做法是：
**输入仍是 a–z**（键盘、错误率、速度统计全部照旧），**显示换成汉字**。这样改只碰渲染层。

**重放**：`TextArea.tsx` 加 1 个 prop + 1 个三元分支；`Presenter.tsx` 加 1 个 const + 3 个 `zh={zh}`；
两个新文件直接拷贝。若上游把 `TextArea` 重构成 children 模式，只需保证 `zh` 为真时走 `ZhLines`。

### P9. 页面精简（3 个文件）

**(a) `App.tsx`**：删 8 个 `lazy()` 与 8 个 `<Route>`（`account`、`highScores`、`layouts`、`multiplayer`、
`profile`（含 `:userId` 子路由）、`typingTest`、`termsOfService`、`privacyPolicy`），
只留 `practice`、`help`、根路径和 `path="*"` 兜底。

```ts
-const AccountPage = lazy(() => import("./pages/account.tsx"));
 const HelpPage = lazy(() => import("./pages/help.tsx"));
-const HighScorePage = lazy(() => import("./pages/high-scores.tsx"));
 …
 const PracticePage = lazy(() => import("./pages/practice.tsx"));
```

**(b) `NavMenu.tsx`**：删掉 `AccountLink` 组件、`SubMenu`（语言下拉 + Translate / Remove Ads）、
以及 personal/profile/highScores/multiplayer/typingTest/layouts 六个入口；`currentPath` 变成未使用参数。

```ts
+// 本地自用版：只留练习页、帮助和主题切换。
+// 原版的账号、个人页、高分榜、多人对战、打字测试、布局库，
+// 以及右下角那串界面语言 + Translate / Remove Ads，单机练字都用不到。
 export function NavMenu({ currentPath }: { readonly currentPath: string }) {
-  const { publicUser } = usePageData();
+  void currentPath;
```

**(c) `Template.tsx`**：删掉 premium 分支（`isPremiumUser` → `bodyAlt/mainAlt/navAlt`），
只保留普通布局；删掉 `topbar` / `sidebar` 两个广告容器。

```ts
-import { isPremiumUser, usePageData } from "@keybr/pages-shared";
-import { AdBanner } from "@keybr/thirdparties";
+import { usePageData } from "@keybr/pages-shared";
 …
-  const { publicUser } = usePageData();
-  return isPremiumUser(publicUser) ? (
-    … bodyAlt …
-  ) : (
+  void usePageData;
+  return (
     <div className={styles.body}>
       …
-      <div className={styles.topbar}>
-        <AdBanner name="BANNER_970X90_1" />
-      </div>
-      <div className={styles.sidebar}>
-        <AdBanner name="BANNER_160X600_1" />
-      </div>
```

**为什么**：单机自用，不需要账号、排行榜、多人对战；广告位在装了广告拦截器的环境里反而会弹
「请关闭广告拦截器」，比广告本身更碍事（见 `Template.tsx` 注释）。

**重放**：三处删除逐一对照。上游若新增页面/导航项，**保留**新增项、只继续压制上面列出的这些；
若上游改了 `Template` 的布局类名，直接取「非 premium 分支」即可。

> 注意：`pages/account.tsx` 等组件文件本身**没有删除**，只是不再被引用（不进路由 → 不打包）。
> 上游更新时这些文件会正常更新，无需处理。

### P10. 本地运行配套（2 项，不参与源码逻辑）

`keybr-server.bat`（ASCII-only，前台窗口即服务）：

```bat
cd /d "%USERPROFILE%\keybr.com"
set NODE_ENV=production
set APP_URL=http://localhost:3000/
set COOKIE_SECURE=false
set COOKIE_DOMAIN=localhost
set DATABASE_CLIENT=sqlite
set DATABASE_FILENAME=%USERPROFILE%\keybr.com\data\keybr.sqlite
title keybr server
node --experimental-sqlite root\index.js
```

`data/keybr.sqlite`：本地 SQLite 库（57 KB）。

**为什么**：`DATABASE_CLIENT` 默认是 `mysql`（`packages/keybr-config/lib/knex.ts:16`），本地没有 MySQL；
`COOKIE_SECURE=false` 是因为本地是 http，否则 session cookie 不落盘；`--experimental-sqlite` 是 Node 22 内置 sqlite 的开关。

**重放**：`.bat` 直接拷贝（确认 `USERPROFILE` 路径与 Node 版本）。`data/` **不要**归档进补丁，属于运行时数据。

---

## 4. 已知限制

### 4.1 Windows 专属（换到 Linux/macOS 就是噪音改动，但保留也无害）

| 位置 | 说明 |
| --- | --- |
| `webpack.config.js:135, 192` | `[\\/]` 双分隔符正则；上游写法在 Linux 上本来就对 |
| `webpack-manifest.js:1-2` | `posix.join` 强制正斜杠；Linux 上等价于原行为 |

> 这两处是**为了让 Windows 能构建**，不是功能需求。若以后在 WSL/Linux 上跑，可以整条回退。

### 4.2 仅本地自用需要（上游合并会被拒，也不应该提 PR）

| 位置 | 说明 |
| --- | --- |
| `App.tsx` / `NavMenu.tsx` / `Template.tsx` | 删页面、删导航、去广告；破坏账号体系和商业化路径 |
| `webpack.config.js` externals | 为「本机没装 mysql2/pg」打的补丁；上游 CI 里这些包是可选的，写法不同 |
| `keybr-server.bat`、`data/keybr.sqlite` | 个人机器路径、本地库 |
| `displaynames.ts` 硬编码中文名 | 没有走 `messages/*.json`，非中文 locale 下只有一行英文兜底 |

### 4.3 真正的功能扩展（值得保留、可考虑整理成上游友好形态）

| 能力 | 位置 |
| --- | --- |
| `zh-sp` 语言与键盘布局 | `language.ts`（基线内）、`layout.ts`、`load.ts`、`layout/zh_sp.ts` |
| 双拼练习词表与统计模型 | `content-words/lib/load.ts`、`phonetic-model-loader/lib/assets.ts` + 3 个数据文件 |
| 键帽显示声母/韵母 | `Key.tsx`、`Key.module.less`、`zhKeyLabels.ts` |
| 两键码 → 汉字渲染 | `ZhLines.tsx`、`zhMap.ts`、`TextArea.tsx`、`Presenter.tsx` |

### 4.4 硬编码与能力边界（用久了会碰到的）

1. **只有小鹤双拼**：`zhKeyLabels.ts` 与 `zhMap.ts` 都是小鹤（flypy）表，`zh-sp` 的 id 里没有方案维度。
   换自然码/微软双拼需要另建一套表 + 另建 Language。
2. **汉字是「单字」不是「词」**：`ZH_CODE_TO_CHAR` 取每个音节最高频的**一个**字，所以会出现
   「我」「的」这类孤立字拼成的无意义串，语义不通但足够练习指法。
3. **依赖「一个词 = 2 个字母 + 空格分隔」**：`ZhLines.groupChars()` 以空格切分、把整段非空格字符当一个词。
   若词表里出现 1 字母或 3 字母的条目，渲染会错位。
4. **只认小写**：`zhMap.ts` 的键全是小写，开了 CapsLock / 按 Shift 时码位变成大写，`ZH_CODE_TO_CHAR[...]` 查不到，
   会退化成显示原始码（`BM` 而不是「便」）。
5. **字号/主题写死**：`ZhLines.tsx` 内联样式固定 42px、`#e8e6e3` 等颜色，不跟随 keybr 的
   text display settings（字号 X0/X1/X2）和主题变量。`TextArea` 的 `size` 在 zh 模式下被忽略。
6. **`xid = 0xff` 与 `Layout.custom()` 同值**：`Layout.ALL` 内部唯一（`layout.test.ts` 的唯一性断言仍会通过），
   但若代码把自定义布局的 xid 拿去 `Layout.ALL.get(xid)`（如 `packages/keybr-highscores/lib/io.ts:32`），
   会解析成 `ZH_SP`。历史上 custom 不在 ALL 里，所以暂时没有实际影响。
7. **`Layout.ALL` 首位是 `ZH_SP`**：默认值仍在 `packages/keybr-keyboard/lib/settings.ts:33` 显式写死 `EN_US`，
   所以不影响默认布局；但凡是「取 `ALL` 第一个」的 UI/逻辑会拿到中文布局。
8. **数据再生成链路断裂**：`zhMap.ts` 声称由 `data/zh-hanzi.tsv` + `tools/gen_zh_map.py` 生成，
   两者在仓库中都不存在；`dictionary-zh-sp.csv.gz` 有，但生成 `model-zh-sp.data` 的完整命令没有记录。
   → **结论：这两个产物目前只能从本归档的旧文件拷贝，不能重建。**
9. **`data/` 未被 `.gitignore` 忽略**：`data/keybr.sqlite` 在 `git status` 里显示为 `??`，
   手滑 `git add .` 会把本地数据库（含练习记录/会话）提交进去。

---

## 5. 验证清单（改完必须人工过一遍）

构建/启动
- [ ] Windows 上 `npm run build` 通过，**没有** `Module parse failed` 与 `Module not found`
- [ ] `root/public/assets/manifest.json` 里的路径全部用 `/`，没有反斜杠
- [ ] `root/public/assets/` 下能看到 `model-zh-sp.data` 与 `words-zh-sp` 的 chunk
- [ ] `keybr-server.bat` 启动无报错，浏览器打开 `http://localhost:3000/` 正常出首页

中文双拼
- [ ] 键盘布局选择器里能找到「中文双拼（小鹤）」，显示为 `{CN}` 旗帜而不是 `zh-sp`
- [ ] 选中后键帽显示 `sh / ao / iu / ei …`，**不再**显示 a–z
- [ ] 练习文本区显示汉字（`bm` → 「便」），每字上方有双拼码
- [ ] 打对整字变绿、打错整字标红、当前字高亮，光标位置与输入状态机一致
- [ ] 「显示双拼码」勾选框可切换，刷新页面后状态保持（`localStorage: keytrance.zh.showCode`）
- [ ] 统计（速度/准确率/学习进度）在图表面上仍随输入正常变化
- [ ] 切回 `en-us`：键帽恢复字母，文本区恢复字母（`zh` 分支未泄漏）

页面精简
- [ ] 顶部无 970×90 横幅、右侧无 160×600 竖条，也没「请关闭广告拦截器」提示
- [ ] 导航只有 主题切换 / 练习 / 帮助 三项，无账号头像、无语言下拉
- [ ] 直接访问 `/account`、`/high-scores`、`/layouts`、`/multiplayer`、`/profile`、`/typing-test`、
      `/terms-of-service`、`/privacy-policy` → 落到 `*` 兜底页，不是白屏/报错
- [ ] 主题切换、帮助页、练习页三条主链路可用

数据
- [ ] 练习记录能落库（`data/keybr.sqlite` 大小有变化），重启后进度还在
- [ ] 控制台无 `zh-sp` 相关的 `throw new Error()`（说明 4 个 switch 分支都补上了）

---

## 6. 待复核（看似临时 hack 的改动）

阅读 diff 时发现以下 5 处值得人工确认，详见 `/PATCHES.md` 对应小节，简要列出：

| # | 位置 | 现象 | 建议 |
| --- | --- | --- | --- |
| 1 | `webpack.config.js:108` vs `:149` | server 配置有**两个 `externals` 键**，后者覆盖前者，新加的 mysql/pg 列表实际未生效 | 合并成一个对象（P3） |
| 2 | `NavMenu.tsx:14` `void currentPath;` | 参数已无用，用 `void` 消 lint 报错 | 直接去掉参数与 `useIntl` 残留 import |
| 3 | `Template.tsx:16` `void usePageData;` | 同上，import 留着但不用 | 删掉 import 和这行 |
| 4 | `ZhLines.tsx` `groupChars()` | `attrs \|= 0;` 是无操作；`else if (attrs === 0) attrs = 1;` 一旦置 1 后续命中不再更新 | 简化为「Miss > Cursor > Hit > Normal」的显式优先级合并 |
| 5 | `ZhLines.tsx` `STORAGE_KEY = "keytrance.zh.showCode"` | 键名前缀是 `keytrance`，与本项目 `keybr` 不一致（疑似从别处抄来） | 若已存在历史数据就保留，否则改成 `keybr.zh.showCode` |
