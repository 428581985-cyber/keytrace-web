# KeyTrace Web

> [!NOTE]
> **AGPL-3.0 衍生声明 / Derivative Notice**
> 本项目基于 [aradzie/keybr.com](https://github.com/aradzie/keybr.com)（Copyright Aliaksandr Radzivanovich，GNU AGPL v3.0）进行二次开发（修改年份：2026），并继续依据 GNU Affero General Public License v3.0 开源。
> 本仓库既可以作为独立的中英文打字训练 Web 应用运行，也可作为 [KeyTrace](https://github.com/428581985-cyber/keytrace)（MIT）的可选配套前端，结合日常真实打字数据开展弱键针对性训练。

![KeyTrace Web 中文双拼练习界面](assets/screenshot-zh-practice.png)

## 主要功能（v0.1）

在原版 keybr.com 的基础上，新增和重构了以下核心能力：

- **中文双拼（小鹤 / 自然码 / 微软 / 搜狗）& 中文全拼 6 键起步渐进解锁课程**：
  - 支持小鹤双拼、自然码、微软双拼（含 `;` 键位映射）、搜狗双拼及中文全拼五种中文方案。
  - 内置双拼/全拼词库与汉字 + 编码对照渲染、模糊音开关、物理键直通（无需切换系统输入法即可直接练中文），以及顶部中/英文一键切换。
  - 独立网页模式下采用 keybr 同源的 **6 键起步渐进解锁课程**，随着按键达速逐步扩展字母集。
- **KeyTrace 联动与独立网页模式强解耦**：
  - **KeyTrace 联动（默认 `auto`）**：本地存在 [KeyTrace](https://github.com/428581985-cyber/keytrace) 事件目录或导入记录（`TextType.KEYTRACE`）时，自动进入**全键解锁弱键驱动**模式（不再显示待解锁按键），并在导航栏启用「键盘监控」专属页面与弱键锁定一键练习；同时提供离线导入脚本 [`scripts/import-keytrace.ts`](scripts/import-keytrace.ts)（支持 `--error-weight <k>` 错误率加权，详见 [`docs/IMPORT-HOWTO.md`](docs/IMPORT-HOWTO.md)）。
  - **独立网页模式（`standalone` / `KEYTRACE_ENABLED=false`）**：可在练习设置中随时切换为独立模式，或在服务端配置 `KEYTRACE_ENABLED=false` 全局禁用 KeyTrace 检测；两种模式**数据严格隔离、切换不丢失任何历史记录**，独立模式下隐藏监控入口且**零后台轮询**。
- **中英文独立目标速度**：
  - 英文与中文课程各自维护独立目标速度（默认英文 **35 WPM**、中文 **25 WPM**）。
  - 设置页根据当前语言自动切换对应速度滑块，`/profile` 各图表与达标线按布局独立计算，互不串台。
- **当前练习键位变更提示**：
  - 练习过程中当前目标弱键发生变化或解锁新键位时，界面即时展示变更提示，方便聚焦肌肉记忆训练。
- **中英文光标连续错误次数角标（`2~10`）**：
  - 在中英文练习文本区中，同一位置连续误触达到 `2~10` 次时，光标旁实时显示连续错误次数角标，完整兼容 `stopOnError` 开启与关闭两种模式。
- **界面体验与本地化适配**：
  - 默认简体中文界面（保留中/英双语切换）、按日期与字数聚合的 `/profile` 统计视图、支持拖拽缩放与位置持久化的练习卡片，以及开箱即用的 SQLite 配置与 Windows 启动脚本（[`keybr-server.bat`](keybr-server.bat)，构建补丁说明见 [`PATCHES.md`](PATCHES.md)）。

## 本地构建与运行

环境要求：Node.js（建议 24+ / 26 LTS）与 npm。

```bash
npm install
npm run compile
npm run build
```

启动本地服务（默认监听 `http://localhost:3000`）：

- **Windows**：直接运行根目录下的 `keybr-server.bat`（自动使用仓库内 `data/` 目录与 SQLite）。
- **Linux / macOS**：

```bash
npm start
```

开发模式可使用 `npm run build-dev` 与 `npm run watch`。

## 独立公网 / 容器部署（无 KeyTrace 依赖）

若只需要独立提供中英文打字训练 Web 服务（不依赖桌面端 [KeyTrace](https://github.com/428581985-cyber/keytrace)），设置 `KEYTRACE_ENABLED=false` 即可完全关闭本地 KeyTrace 目录扫描、接口暴露与前端轮询：

```bash
export NODE_ENV=production
export APP_URL=https://typing.example.com/
export COOKIE_DOMAIN=typing.example.com
export COOKIE_SECURE=true
export DATABASE_CLIENT=sqlite
export DATABASE_FILENAME=/var/lib/keybr/keybr.sqlite
export DATA_DIR=/var/lib/keybr
export KEYTRACE_ENABLED=false
export MAIL_DOMAIN=localhost
export MAIL_KEY=dummy

node ./root/index.js
```

> [!TIP]
> 构建产物 `root/` 是自包含的发布目录（已打包服务端与前端静态资源），无需额外依赖仓库其余源码即可直接部署运行。

## 开发检查与测试

运行代码与样式检查：

```bash
npm run compile
npm run lint
npm run stylelint
```

运行单元测试（使用内存 SQLite，无需本地部署 MySQL）：

```bash
env DATABASE_CLIENT=sqlite npm test
```

运行 Playwright 端到端测试套件（位于 [`e2e/`](e2e/)，需先完成 `npm run compile` 与 `npm run build`，并安装 Python `playwright`）：

```bash
python e2e/run_e2e.py --isolated --all
```

## 许可与致谢

- 本项目遵循 **GNU Affero General Public License v3.0**（详见 [`LICENSE`](LICENSE)）。
- 上游项目：[aradzie/keybr.com](https://github.com/aradzie/keybr.com)（原作者：Aliaksandr Radzivanovich）。
- 可选配套桌面采集端：[428581985-cyber/keytrace](https://github.com/428581985-cyber/keytrace)（MIT License，可完全独立使用）。
