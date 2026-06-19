# TinyNote 小笺

TinyNote 是一款轻量 Windows 桌面待办管理应用，基于 Tauri 2 + React + TypeScript + SQLite 构建。界面简洁，毛玻璃主题，本地离线可用。当前版本 **v1.0.1**。

## 功能

- **日期视图**：未来 N 天日期条（默认 7 天，可选 3/7/14），有活跃任务的日期显示红点，今日高亮，选中日期自动滚动到可视区
- **三种任务类型**：普通（仅当天）、每日（范围显示、每天进度清零）、多日（范围显示、进度当日及之前继承）
- **任务操作**：快速添加、内联编辑、进度条、完成/恢复、逐条删除、任务详情与高级排期
- **顺延**：单任务延期到指定日期、批量顺延当日活跃任务到次日，并可清除延期标识与历史
- **任务管理面板**：集中创建与管理每日/多日任务（底部栏仅快速添加普通任务）
- **窗口特性**：无边框毛玻璃窗口、置顶、固定桌面、关闭隐藏到托盘、窗口状态记忆、开机自启、系统托盘菜单
- **主题系统**：7 套主题（毛玻璃蓝/白/薄荷/紫、亮色、暗色、跟随系统），透明度可调，支持自定义背景图
- **数据管理**：JSON 导出 / 导入，同步字段预留（user_id、device_id、sync_status、version）
- **应用更新**：关于面板展示版本、GitHub 链接、更新说明，并通过签名安装包完成自动更新

## 下载与安装

在 [GitHub Releases](https://github.com/se-treasurew/TinyNote/releases) 下载最新的 `TinyNote_*_x64-setup.exe` 并运行。应用内点击标题栏“小笺”可打开关于面板并检查更新。

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

**任务类型**：普通（manual，仅当天）、每日（daily，范围显示+每天清零）、多日（multi_day，范围显示+进度当日及之前继承）。顺延支持 manual 与 multi_day。

## 版本

当前版本 **1.0.1**。版本以 `desktop/src-tauri/tauri.conf.json` 为准，`package.json` 与 `Cargo.toml` 保持一致；标题栏版本号通过 Tauri 运行时 `getVersion()` 读取，无需手动同步。

发布时需先在 `CHANGELOG.md` 增加对应版本章节，再推送同版本的 `v*` 标签。GitHub Actions 会构建 NSIS/MSI、签名文件和 `latest.json`，并将该章节作为 Release 与应用内更新说明。

## 许可

未指定。
