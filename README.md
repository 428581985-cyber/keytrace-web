# KeyTrace Web

> [!NOTE]
> **AGPL-3.0 衍生声明 / Derivative Notice**
> 本项目基于 [aradzie/keybr.com](https://github.com/aradzie/keybr.com)（Copyright Aliaksandr Radzivanovich，GNU AGPL v3.0）进行二次开发（修改年份：2026），并继续依据 GNU Affero General Public License v3.0 开源。
> 本仓库作为 [KeyTrace](https://github.com/428581985-cyber/keytrace)（MIT）的配套 Web 打字训练前端，专注中文双拼/全拼练习与日常真实打字弱键联动。

## 主要定制与扩展

在原版 keybr.com 的基础上，新增和重构了以下能力：

- **中文小鹤双拼 & 中文全拼模式**：内置双拼/全拼词库与汉字渲染、模糊音开关、物理键直通（无需切换系统输入法即可练中文）以及顶部中/英文快捷切换。
- **与 KeyTrace 生态联动**：接入 [KeyTrace](https://github.com/428581985-cyber/keytrace) 日常真实打字数据增量同步，提供键盘监控专属页面、弱键锁定一键联动练习，以及离线导入脚本（[`scripts/import-keytrace.ts`](scripts/import-keytrace.ts)）。
- **界面与统计重构**：默认简体中文界面（保留中英双语切换）、去课程化的按日期与字数统计视图，以及支持拖拽缩放与位置持久化的顶部统计栏。
- **Windows 本地运行适配**：开箱即用的 SQLite 本地配置与一键启动脚本（[`keybr-server.bat`](keybr-server.bat)），Windows 构建与路径修复说明见 [`PATCHES.md`](PATCHES.md)。

## 本地构建与运行

环境要求：Node.js 与 npm。

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

## 测试

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
- 配套采集端项目：[428581985-cyber/keytrace](https://github.com/428581985-cyber/keytrace)（MIT License）。
