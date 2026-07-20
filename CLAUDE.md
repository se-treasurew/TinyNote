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
| 完成机制 | 原日期改任务自身状态；延期/已有进度日期写 per-date progress entry | 写 per-date progress entry | 任意日期完成或恢复都更新任务自身状态 |

核心逻辑在 `src/services/taskOccurrence.ts`：`shouldShowTaskOnDate` 控制可见性，`resolveInheritedProgressEntry` 控制多日进度顺延（仅 multi_day + `date <= today`，未来日期不继承；硬编码行为，不再依赖设置项）。多日任务一旦任务本体完成，所有 occurrence 都显示为已完成；每日任务仍只完成当天。注意：`carryProgressForward` 设置已从 `AppSettings` 移除，CLAUDE.md 早期版本曾记载该设置，现已不适用。

## 多日完成边界 (completed_on_date)

`tasks.completed_on_date`（migration 10 新增）记录多日任务的完成日。已完成的 multi_day 任务不再在截止日内的每一天都显示为「已完成」，而是只在「完成日及此前」保留为已完成的历史 occurrence，完成日之后不再展示（`MainPage.shouldDisplayOccurrence` 用 `task.occurrenceDate > task.completedOnDate` 过滤）。恢复（restore）多日任务会清空 `completed_on_date`，使任务重新显示到原截止日。每日 / 普通 / 延期副本的完成规则不受此边界影响。

- `taskService.completeTask` 写入 `completed_on_date = occurrenceDate`（multi_day + completed）；`restoreTask`/`applyRestore` 清空。
- `normalizeCompletionBoundary`（taskService）在 `updateTask`/排期传播时校正后代边界；导入流程 `resolveImportedCompletionDate`（dataPortabilityService）按同规则补齐历史 JSON。
- 已完成子任务在完成边界后的日期会隐藏，但父任务的子任务数量、完成进度和完成约束仍按完整任务树计算。

## 顺延 (Postpone) 机制

底部栏「顺延」按钮批量推迟选定日期的活跃任务到次日，仅对 `manual` 和 `multi_day` 生效（`daily` 每日清零不顺延）。核心逻辑在 `src/services/taskScheduling.ts`：

- `isTaskPostponeSupported`：仅 `manual` / `multi_day` + `status='active'` 支持顺延
- `isBatchPostponeEligibleTask`：批量顺延资格。`manual` 全部符合；`multi_day` 仅当 `endDate === occurrenceDate`（在结束当天顺延，延长结束日期）符合
- `postponeTask`（store）/ `taskService.postponeTask` 执行单条顺延；批量 `postponeTasksForDate` 在 service 层先合并父子级联闭包，确保同一任务每次批量操作只顺延一次
- `clearTaskPostponements` 清除任务全部延期标识与历史，但不回滚截止日期或独立进度记录

**子任务级联**：`taskService.postponeTask` 延期一个任务时**双向级联**——向下用 `collectDescendants` 延期全部后代（子、孙），向上沿 `parentTaskId` 链延期每个符合资格的祖先（仅 `postponeSingle` 自身，不重复向下）。延期子任务会连带母任务及祖先，延期母任务会连带全部后代。兄弟节点不连带。`collectDescendants` 带 visited 集合防 `parent_task_id` 循环。

## 子任务系统

任务树最多**三层**（母 → 子 → 孙），通过 `tasks.parent_task_id` 表达，migration 7 已加索引。

- **创建**：`taskService.addTask` 用 `depthOf` 计算候选父任务深度，深度 ≥ 2 时拒绝（孙不能再加子）。子任务继承父的 `sourceType/taskDate/endDate`。`CreateTaskInput.parentTaskId` 仅创建时设，`UpdateTaskInput` 不含。
- **分组**：`taskWorkflow.groupTasksWithSubtasks` 把单日扁平 occurrence 列表递归构建为 `TaskTreeNode[]`（`subtasks` 是递归节点数组）。孤儿子任务（父缺失/越界）升为顶层。
- **徽标**：`subtaskBadge` 只数**直接**子任务（孙不计入母的徽标）。含子任务的任务在标题行右侧显示 `x/y` 徽标，不显示进度条；只有叶子任务（无子任务）显示可拖动进度条。
- **进度提交**：`TaskItem` 拖动进度时只更新本地显示，在 pointer/key 结束或失焦时一次性提交；达到 100% 必须调用 `completeTask(id, occurrenceDate)`，不要先写 active progress entry。
- **完成推进**：父任务存在未完成直接子任务时不可手动完成。`completeTask`/`restoreTask` 末尾调 `recomputeAncestorProgress` 沿祖先链上溯——按直接子任务完成比例重算每个祖先的进度。daily 祖先写当日 progress entry；multi_day 祖先在全部直接子任务完成时整体完成，否则恢复 active 并写当日进度；manual 祖先全完成时自动 `applyComplete`、否则 `applyRestore`。manual/multi_day 子任务可回退到任务本体状态，daily 子任务只看当日 direct entry。
- **折叠**：`MainPage` 用 `collapsedParentIds: Set<string>`（会话内、非持久化）控制每节点子树显示；`TaskItem` 有子任务时在复选框前显示 `▶/▼` 折叠按钮。
- **添加交互**：子任务添加行有确认/取消图标按钮，Enter 提交、Escape 取消；切换日期、折叠父任务或打开底部快速添加时会退出子任务添加态。
- **级联**：`deleteTask` 递归软删全部后代；`updateTask` 排期变更（仅顶层 `depth 0` 可编辑排期）递归传播到全部后代。
- **Store 刷新**：`completeTask`/`restoreTask`/`deleteTask` 成功后 `loadTasks` reload 可见窗口，确保父进度、徽标、后代在所有日期刷新。

## 延期 occurrence 完成语义

`TaskOccurrence.taskDate` 是展示日期，`definitionTaskDate` 是任务定义日期，`occurrenceDate` 是状态/进度操作日期。完成或恢复延期副本时必须传 `occurrenceDate`，不要用定义日期回写。

- 普通任务在原始日期且没有直接 progress entry 时，仍通过任务自身 `status` 完成/恢复，兼容旧数据。
- 普通任务在延期目标日期或已有直接 progress entry 的日期完成/恢复时，写该日期 `task_progress_entries`，原日期 occurrence 不随之完成。
- 子任务完成后，`recomputeAncestorProgress` 按同一个 occurrence 日期重算祖先进度，避免延期子任务在目标日期完成时误改原日期父任务。

## 关键技术细节

- **Tauri 插件**：SQL、window-state、notification、autostart、updater、process、opener。确认弹窗使用自研 `ConfirmDialog`；权限定义在 `src-tauri/capabilities/default.json`。
- **窗口行为**：无边框窗口（自定义标题栏 `TitleBar.tsx`）。关闭与最小化都隐藏到托盘而非退出/留在任务栏（最小化走 `windowService.minimizeWindow`→`hide()`，关闭由 Rust 拦截 `CloseRequested`→`hide()`）；恢复靠托盘「打开 / 隐藏」。透明背景支持毛玻璃主题。
- **主题系统**：7 套主题，通过 CSS 自定义属性实现（`src/styles/global.css`）。通过 `document.documentElement.dataset.theme` 切换。毛玻璃主题使用 `backdrop-filter: blur(22px)`。窗口透明度通过 CSS 变量 `--window-opacity` 驱动（`windowService.applySettings` 设到 `<html>` 上，`.app-shell` 背景的 `--bg` 与渐变层都乘以该变量），可在设置面板 0%–100% 全范围调节（默认 0.82），不做 0.72 之类二次封顶。
- **测试**：Vitest 2 + jsdom + `@testing-library/react` + `@testing-library/jest-dom`。Tauri API 通过 `vi.mock()` 模拟。配置文件 `src/test/setup.ts`。
- **Rust 入口**：`src-tauri/src/lib.rs` 包含插件注册、系统托盘设置、关闭事件拦截和全部 SQLite 迁移 SQL。
- **日期条交互**：`MainPage` 的日期条在 `selectedDate` 变化时自动将选中标签 `scrollIntoView` 到可视区域中央（jsdom 测试中需用 `typeof tab.scrollIntoView === 'function'` 守卫）。

## 版本

当前版本 **1.2.6**。版本以 `desktop/src-tauri/tauri.conf.json` 为准，`package.json` 与 `Cargo.toml` 保持一致。`TitleBar` 通过 Tauri 运行时 `getVersion()` 读取版本号，不要硬编码；每次发布同时更新 `CHANGELOG.md`。

## 应用图标

规范源图为 `desktop/src-tauri/icons/icon-source.png`，必须保持正方形。Windows 使用的 `32x32.png`、`128x128.png`、`128x128@2x.png` 和 `icon.ico` 均由 `npm.cmd run tauri -- icon src-tauri/icons/icon-source.png` 生成；不要单独手工修改某一个尺寸。`TrayIconBuilder` 使用 `app.default_window_icon()`，因此同一套资源会同时影响窗口、托盘、EXE 和安装器。

## 发布

发布流程由 `.github/workflows/release.yml` 驱动：推送 `v*` tag（或手动 dispatch）后在 `windows-latest` 上跑 `typecheck` + `test`，再用 `tauri-apps/tauri-action@v0.6.2` 构建、签名并发布 GitHub Release。Release body 由 `.github/scripts/extract-release-notes.mjs` 从 `CHANGELOG.md` 提取；工作流在构建后通过 `gh release edit` 再次同步正文，确保重跑既有 tag 时说明也会更新。updater `latest.json` 指向 `se-treasurew/TinyNote` 的 latest release（见 `tauri.conf.json` 的 updater endpoints）。签名密钥 `TAURI_SIGNING_PRIVATE_KEY` / 密码为仓库 secret，本地需自行配置才能产出带 `.sig` 的 updater 制品。升级器公钥已内嵌在 `tauri.conf.json` 的 `plugins.updater.pubkey`。

Tauri updater 默认只接受 `update.version > current`。强制覆盖同版本 Release 只会替换新下载用户获得的安装包，已经安装该版本的用户不会自动更新；正常发布应递增版本号。

**不支持降级安装**。SQLite 迁移只增不删，且 sqlx 在启动时校验数据库里已应用的 migration 必须全部存在于当前 binary 的迁移列表中（`ignore_missing` 默认 false）。因此从高版本降级到低版本会启动失败：高版本已写入的 migration（如 v1.0.2 的 migration 7）低版本 binary 不认识，sqlx 抛 `VersionMissing` 致 SQL 插件初始化失败；同时 Tauri NSIS 安装器默认也拒绝覆盖更高版本。全新安装和低→高升级均正常，仅高→低降级不受支持。若未来确需允许降级，需在 Rust 侧为 SQL 插件设置 `ignore_missing = true` 并重新发布。
