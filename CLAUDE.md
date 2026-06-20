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

## 完成任务后的验证流程

**每次完成代码改动后，必须依次运行以下验证，全部通过才算任务结束**（不要只改代码不验证）。在 `desktop/` 目录下执行：

```bash
npm.cmd run typecheck   # 1. 类型检查（tsc --noEmit）
npm.cmd run test        # 2. 单元测试（vitest run，须全绿）
npm.cmd run build       # 3. 前端构建（tsc + vite build）
```

说明：
- 三项必须全过。任一失败须修复后重跑，不得遗留。
- 完成 TinyNote 功能或 bugfix 后，环境允许时继续运行签名 `npm.cmd run tauri -- build`，生成并报告 NSIS/MSI 安装包与 updater `.sig`。
- 新增/修改的业务逻辑应补对应单元测试（纯函数优先，参考 `taskOccurrence.test.ts`、`taskService.test.ts` 的 mock 模式）。
- 报告完成时必须附上三项命令的实际输出结论（通过/失败、测试数），不得空口声称"已验证"。

## 架构

**分层模式**：Repository（SQL）→ Service（业务逻辑）→ Store（Zustand）→ Components

- **Repositories** (`src/repositories/`)：通过 `@tauri-apps/plugin-sql` 执行 SQL 查询。`db.ts` 是数据库单例，提供事务辅助和默认设置初始化。
- **Services** (`src/services/`)：业务逻辑层。部分为纯函数（`taskWorkflow.ts`、`routineLogic.ts`），易于测试；其余封装 repository 调用。
- **Stores** (`src/stores/`)：四个 Zustand store —— `taskStore`（任务、日期、CRUD、导航、顺延）、`routineStore`（例行任务，**当前休眠**：无 UI 入口，自动生成管线未接入）、`settingsStore`（应用设置 + 原生开关）、`uiStore`（面板可见性，支持 `main`/`settings`/`taskManage`/`about`）。
- **Components/Pages**：`MainPage.tsx` 是主界面。`SettingsPanel`、`TaskManagePanel`、`AboutPanel` 为浮层面板组件。`TaskManagePanel` 负责每日/多日任务的创建与编辑；底部添加栏仅用于快速创建普通任务。`ConfirmDialog` 提供 Promise 化确认弹窗。

**启动流程**（`app/App.tsx`）：初始化数据库 → 加载设置 → 加载任务 → 注册托盘事件监听。

**任务生命周期**：active → completed；已完成任务可恢复为 active。软删除设置 `status='deleted'` 并记录 `deleted_at`。旧 `archived` 数据仅保留兼容，migration 6 和导入流程会将其转换为 completed。

**数据模型**：核心 SQLite 表包括 `tasks`、`task_progress_entries`、`task_postponements`、`routines`、`routine_instances`、`app_settings`、`sync_log`。所有写操作递增 `version`、设置 `sync_status='pending'` 并写入同步日志。

**例行任务系统（休眠态）**：`routines` / `routine_instances` 表与迁移仍在，数据可经 `dataPortabilityService` 导出/导入。但 v1.0 无 routine 创建 UI（旧 `RoutinePanel` 已删），`routineService.generateVisibleRoutineTasks` 未接入 `loadTasks`。daily/daily 任务的实际跨日显示靠 `taskOccurrence.shouldShowTaskOnDate` 的范围判断，不依赖实例生成。

## 任务类型与顺延逻辑

三种任务类型 (`manual` / `daily` / `multi_day`) 的差异：

| 行为 | 普通 (manual) | 每日 (daily) | 多日 (multi_day) |
|------|:--:|:--:|:--:|
| 跨日显示 | 仅当天 | [开始, 结束] 范围 | [开始, 结束] 范围 |
| 进度顺延 | ❌ 永不 | ❌ 每天清零 | ✅ 当日及之前继承 |
| 完成机制 | 改任务自身状态 | 写 per-date progress entry | 写 per-date progress entry |

核心逻辑在 `src/services/taskOccurrence.ts`：`shouldShowTaskOnDate` 控制可见性，`resolveInheritedProgressEntry` 控制多日进度顺延（仅 multi_day + `date <= today`，未来日期不继承；硬编码行为，不再依赖设置项）。注意：`carryProgressForward` 设置已从 `AppSettings` 移除，CLAUDE.md 早期版本曾记载该设置，现已不适用。

## 顺延 (Postpone) 机制

底部栏「顺延」按钮批量推迟选定日期的活跃任务到次日，仅对 `manual` 和 `multi_day` 生效（`daily` 每日清零不顺延）。核心逻辑在 `src/services/taskScheduling.ts`：

- `isTaskPostponeSupported`：仅 `manual` / `multi_day` + `status='active'` 支持顺延
- `isBatchPostponeEligibleTask`：批量顺延资格。`manual` 全部符合；`multi_day` 仅当 `endDate === occurrenceDate`（在结束当天顺延，延长结束日期）符合
- `postponeTask`（store）/ `taskService.postponeTask` 执行单条顺延，`postponeTasksForDate` 批量处理一个日期下所有符合条件任务
- `clearTaskPostponements` 清除任务全部延期标识与历史，但不回滚截止日期或独立进度记录

## 关键技术细节

- **Tauri 插件**：SQL、window-state、notification、autostart、updater、process、opener。确认弹窗使用自研 `ConfirmDialog`；权限定义在 `src-tauri/capabilities/default.json`。
- **窗口行为**：无边框窗口（自定义标题栏 `TitleBar.tsx`）。关闭时隐藏到托盘而非退出。透明背景支持毛玻璃主题。
- **主题系统**：7 套主题，通过 CSS 自定义属性实现（`src/styles/global.css`）。通过 `document.documentElement.dataset.theme` 切换。毛玻璃主题使用 `backdrop-filter: blur(22px)`。窗口透明度可配置（默认 0.82）。
- **测试**：Vitest 2 + jsdom + `@testing-library/react` + `@testing-library/jest-dom`。Tauri API 通过 `vi.mock()` 模拟。配置文件 `src/test/setup.ts`。
- **Rust 入口**：`src-tauri/src/lib.rs` 包含插件注册、系统托盘设置、关闭事件拦截和全部 SQLite 迁移 SQL。
- **日期条交互**：`MainPage` 的日期条在 `selectedDate` 变化时自动将选中标签 `scrollIntoView` 到可视区域中央（jsdom 测试中需用 `typeof tab.scrollIntoView === 'function'` 守卫）。

## 版本

当前版本 **1.0.2**。版本以 `desktop/src-tauri/tauri.conf.json` 为准，`package.json` 与 `Cargo.toml` 保持一致。`TitleBar` 通过 Tauri 运行时 `getVersion()` 读取版本号，不要硬编码；每次发布同时更新 `CHANGELOG.md`。

## 发布

发布流程由 `.github/workflows/release.yml` 驱动：推送 `v*` tag（或手动 dispatch）后在 `windows-latest` 上跑 `typecheck` + `test`，再用 `tauri-apps/tauri-action@v0.6.2` 构建、签名并发布 GitHub Release。Release body 由 `.github/scripts/extract-release-notes.mjs` 从 `CHANGELOG.md` 提取，updater `latest.json` 指向 `se-treasurew/TinyNote` 的 latest release（见 `tauri.conf.json` 的 updater endpoints）。签名密钥 `TAURI_SIGNING_PRIVATE_KEY` / 密码为仓库 secret，本地需自行配置才能产出带 `.sig` 的 updater 制品。升级器公钥已内嵌在 `tauri.conf.json` 的 `plugins.updater.pubkey`。

**不支持降级安装**。SQLite 迁移只增不删，且 sqlx 在启动时校验数据库里已应用的 migration 必须全部存在于当前 binary 的迁移列表中（`ignore_missing` 默认 false）。因此从高版本降级到低版本会启动失败：高版本已写入的 migration（如 v1.0.2 的 migration 7）低版本 binary 不认识，sqlx 抛 `VersionMissing` 致 SQL 插件初始化失败；同时 Tauri NSIS 安装器默认也拒绝覆盖更高版本。全新安装和低→高升级均正常，仅高→低降级不受支持。若未来确需允许降级，需在 Rust 侧为 SQL 插件设置 `ignore_missing = true` 并重新发布。
