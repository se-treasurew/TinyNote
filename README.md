# TinyNote 小笺

<p align="center">
  <img src="desktop/src-tauri/icons/128x128.png" alt="TinyNote 应用图标" width="96">
</p>

TinyNote 是一款轻量 Windows 桌面待办管理应用，基于 Tauri 2 + React + TypeScript + SQLite 构建。界面简洁，毛玻璃主题，本地离线可用。当前版本 **v1.2.2**。

## 功能

- **日期视图**：未来 N 天日期条（默认 7 天，可选 3/7/14），有活跃任务的日期显示红点，今日高亮，选中日期自动滚动到可视区
- **三种任务类型**：普通（仅当天）、每日（范围显示、每天进度清零）、多日（范围显示、进度当日及之前继承；完成任意一天即完成整个任务，列表标签显示截止日期）
- **多级子任务**：任务树最多三层（母 → 子 → 孙），在右键菜单中添加，添加行支持确认/取消，缩进展示并可单独完成；每个有子任务的任务行可展开/折叠子树，且父任务须先完成所有直接子任务才能完成
- **子任务推进主任务进度**：完成子任务按比例自动推进母任务及祖先的进度；含子任务的任务在标题行右侧显示醒目的「x/y」徽标，只有叶子任务显示可拖动进度条，拖至 100% 后自动完成
- **任务操作**：快速添加、内联编辑、完成/恢复、逐条删除、任务详情与高级排期
- **顺延**：单任务延期到指定日期、批量顺延当日活跃任务到次日，并可清除延期标识与历史；延期副本按目标日期独立完成/恢复，批量父子级联会自动去重，延期子任务会连带母任务及祖先同步延期
- **任务管理面板**：集中创建与管理每日/多日任务（底部栏仅快速添加普通任务）
- **窗口特性**：无边框毛玻璃窗口、置顶、固定桌面、关闭隐藏到托盘、窗口状态记忆、开机自启、系统托盘菜单
- **主题系统**：7 套主题（毛玻璃蓝/白/薄荷/紫、亮色、暗色、跟随系统），透明度 0%–100% 全范围可调，支持自定义背景图
- **数据管理**：JSON 导出 / 导入，同步字段预留（user_id、device_id、sync_status、version）
- **应用更新**：关于面板展示版本、GitHub 链接、更新说明，并通过签名安装包完成自动更新

## 下载与安装

在 [GitHub Releases](https://github.com/se-treasurew/TinyNote/releases) 下载最新的 `TinyNote_*_x64-setup.exe` 并运行。应用内点击标题栏“小笺”可打开关于面板并检查更新。

> ⚠️ **不支持降级安装**：升级到新版本后，请勿安装更旧的安装包。TinyNote 的数据库迁移只增不删，降级会导致应用无法启动。如必须运行旧版本，需先卸载当前版本并删除本地数据库（会丢失全部本地数据）后全新安装。

更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2 |
| 前端 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 状态管理 | Zustand 5 |
| 数据库 | SQLite（@tauri-apps/plugin-sql） |
| 测试 | Vitest 2 + @testing-library/react |
| 图标 | lucide-react |

## 开发环境

Windows 原生 Tauri 开发需要：

- Node.js 与 npm（PowerShell 下使用 `npm.cmd`）
- Rust / Rustup，MSVC toolchain
- Microsoft C++ Build Tools（勾选 Desktop development with C++）
- WebView2 Runtime（Windows 10 1803+ 通常已内置）

## 快速开始

```bash
# 安装依赖
cd desktop
npm.cmd install

# 启动开发
npm.cmd run tauri dev

# 运行测试
npm.cmd run test

# 类型检查
npm.cmd run typecheck

# 前端构建
npm.cmd run tauri -- build
```

## 项目结构

```
desktop/
├── src/
│   ├── app/              # 根组件，启动流程
│   ├── pages/            # 主页面
│   ├── components/       # UI 组件（标题栏、任务项、面板等）
│   ├── stores/           # Zustand 状态管理
│   ├── services/         # 业务逻辑层
│   ├── repositories/     # 数据库访问层
│   ├── types/            # TypeScript 类型定义
│   ├── utils/            # 工具函数
│   └── styles/           # 全局样式与主题
├── src-tauri/            # Rust 后端（Tauri 插件、托盘、数据库迁移）
└── package.json
```

## 架构概览

```
Repository（SQL 查询）→ Service（业务逻辑）→ Store（Zustand）→ Component（React UI）
```

**启动流程**：初始化数据库 → 加载设置 → 加载任务 → 注册托盘监听

**任务状态**：`active` → `completed`，支持恢复与软删除。旧版 `archived` 数据在升级或导入时会转换为 `completed`。

**任务类型**：普通（manual，仅当天）、每日（daily，范围显示+每天清零）、多日（multi_day，范围显示+进度当日及之前继承；完成任意 occurrence 即完成整个任务）。顺延支持 manual 与 multi_day。

**子任务**：任务树最多三层（母 → 子 → 孙），子任务继承母任务的类型与日期范围。含子任务的任务显示「x/y」徽标（直接子任务完成数），只有叶子任务有可拖动进度条；进度拖动结束后保存，达到 100% 自动完成当前 occurrence。父任务必须先完成所有直接子任务才可完成；完成子任务按比例推进母任务及祖先进度。添加子任务时可显式确认或取消。延期子任务会向上连带母任务及祖先，删除/改期母任务会向下连带全部后代。

**延期 occurrence**：普通任务延期后，原日期和目标日期各自保留独立 occurrence。目标日期完成/恢复只写该日期的进度记录，不会回写原始日期任务状态；批量顺延会对父子级联闭包去重，避免同一次操作产生重复历史。

## 版本

当前版本 **1.2.2**。版本以 `desktop/src-tauri/tauri.conf.json` 为准，`package.json` 与 `Cargo.toml` 保持一致；标题栏版本号通过 Tauri 运行时 `getVersion()` 读取，无需手动同步。

发布时需先在 `CHANGELOG.md` 增加对应版本章节，再推送同版本的 `v*` 标签。GitHub Actions 会构建 NSIS/MSI、签名文件和 `latest.json`，并将该章节作为 Release 与应用内更新说明。

> 不支持降级安装：SQLite 迁移只增不删，降级会因旧版本不识别新迁移而启动失败。详见 [CHANGELOG.md](CHANGELOG.md) 各版本的「升级与降级」说明。

## 许可

未指定。
