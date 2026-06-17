# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TinyNote 是一款基于 Tauri 2 的 Windows 桌面待办管理应用，前端使用 React + TypeScript，数据库使用 SQLite。界面语言为简体中文，代码和注释为英文。

## 常用命令

所有命令在 `desktop/` 目录下执行，非仓库根目录。Windows 环境下需使用 `npm.cmd` 代替 `npm`（PowerShell 执行策略限制）。

```bash
cd desktop

# 开发
npm.cmd run dev          # 启动 Vite 开发服务器 (localhost:1420)
npm.cmd run tauri dev    # 启动 Tauri 桌面应用开发模式

# 构建
npm.cmd run build        # 类型检查 + Vite 构建
npm.cmd run tauri build  # 完整 Tauri 桌面应用构建

# 测试
npm.cmd run test         # 运行全部测试 (vitest run)
npm.cmd run test:watch   # 监听模式运行测试
npx vitest run src/utils/date.test.ts  # 运行单个测试文件

# 类型检查
npm.cmd run typecheck    # tsc --noEmit
```

项目未配置 linter 或 formatter。

## 架构

**分层模式**：Repository（SQL）→ Service（业务逻辑）→ Store（Zustand）→ Components

- **Repositories** (`src/repositories/`)：通过 `@tauri-apps/plugin-sql` 执行 SQL 查询。`db.ts` 是数据库单例，提供事务辅助和默认设置初始化。
- **Services** (`src/services/`)：业务逻辑层。部分为纯函数（`taskWorkflow.ts`、`routineLogic.ts`），易于测试；其余封装 repository 调用。
- **Stores** (`src/stores/`)：四个 Zustand store —— `taskStore`（任务、日期、CRUD）、`routineStore`（例行任务）、`settingsStore`（应用设置 + 原生开关）、`uiStore`（面板可见性）。
- **Components/Pages**：`MainPage.tsx` 是主界面。`ArchivePanel`、`RoutinePanel`、`SettingsPanel` 为浮层面板组件。

**启动流程**（`app/App.tsx`）：初始化数据库 → 加载设置 → 加载例行任务 → 加载任务（为可见日期范围生成例行任务实例）→ 注册托盘事件监听。

**任务生命周期**：active → completed → archived（或根据设置 active 直接归档）。软删除设置 `status='deleted'` 并记录 `deleted_at` 时间戳。

**数据模型**：5 张 SQLite 表 —— `tasks`、`routines`、`routine_instances`、`app_settings`、`sync_log`。所有写操作递增 `version`，设置 `sync_status` 为 `'pending'`，并写入 `sync_log` 为后续同步预留。

**例行任务生成**：每日例行任务在 `loadTasks()` 时按可见日期范围惰性生成实例；多日例行任务在创建时一次性生成全部实例。通过 `UNIQUE(routine_id, instance_date)` 去重。

## 关键技术细节

- **Tauri 插件**：SQL（迁移在 `lib.rs` 中）、window-state、notification、autostart、dialog、fs。权限定义在 `src-tauri/capabilities/default.json`。
- **窗口行为**：无边框窗口（自定义标题栏 `TitleBar.tsx`）。关闭时隐藏到托盘而非退出。透明背景支持毛玻璃主题。
- **主题系统**：7 套主题，通过 CSS 自定义属性实现（`src/styles/global.css`）。通过 `document.documentElement.dataset.theme` 切换。毛玻璃主题使用 `backdrop-filter: blur(22px)`。窗口透明度可配置（默认 0.82）。
- **测试**：Vitest 2 + jsdom + `@testing-library/react` + `@testing-library/jest-dom`。Tauri API 通过 `vi.mock()` 模拟。配置文件 `src/test/setup.ts`。
- **Rust 入口**：`src-tauri/src/lib.rs` 包含插件注册、系统托盘设置、关闭事件拦截和全部 SQLite 迁移 SQL。

## 版本

当前版本 0.1.5 —— 需同步更新 `package.json`、`Cargo.toml`、`tauri.conf.json` 和 `TitleBar` 组件中的版本号。
