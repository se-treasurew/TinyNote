# TinyNote“小笺”Windows MVP 实施计划

## 摘要

- 方案技术可行：Tauri 2 覆盖 Windows 桌面、托盘、窗口状态、开机启动、通知、全局快捷键等能力；SQL 插件支持 SQLite 与迁移；Window State 插件可保存/恢复窗口状态；托盘与 Autostart 均有官方能力支撑。
- 当前目录是空项目状态，仅有 `prompt.md` 与 `prompt2.md`，且不是 git 仓库；应从 `desktop/` 新建项目骨架。
- 当前机器可用 `node v25.9.0` 与 `npm.cmd 11.13.0`；PowerShell 直接执行 `npm` 会被执行策略拦截；`rustc/cargo/rustup` 未安装或不在 PATH，暂不能直接运行 Tauri 开发链。
- MVP 边界：核心可用优先。通知与全局快捷键只做能力预留，不作为第一版核心验收。

## 已确认需求与默认口径

- 第一阶段只做 Windows 桌面端 MVP，本地离线完整可用，不接服务器。
- 核心范围：日期视图、未来 N 天任务、红点、任务 CRUD、完成、归档/恢复、软删除、daily routine、多日任务、窗口锁定、置顶、托盘、开机启动、设置持久化、导入导出 JSON。
- 固定桌面定义为“锁住窗口”：窗口仍是普通应用窗口，但不能拖动/缩放，并保存当前位置与尺寸；它与置顶开关互相独立。
- Daily routine 在启动或切换展示天数时，为当前可见日期范围生成实例，默认未来 7 天；用唯一约束保证同一 routine 同一天只生成一次。
- 任务完成后默认变为 `completed`，从主日期视图隐藏，不触发红点；归档页可查看 `completed/archived` 并恢复。若设置开启“完成后立即归档”，则完成时直接变为 `archived`。
- UI 采用轻量桌面便签风格，默认窗口 `360x620`；样式选择 CSS Modules + `global.css` 变量，按钮图标使用 `lucide-react`。

## 关键实现设计

- 项目结构：在根目录创建 `desktop/`，使用 Tauri 2 + Vite + React + TypeScript + Zustand + SQLite。
- Tauri 侧：初始化 SQL、Window State、Autostart、Notification 插件；配置 tray；Global Shortcut 只预留依赖和能力开口，后续再接快捷键产品逻辑。
- 数据库：`sqlite:tinynote.db` 放在 Tauri 应用数据目录；通过 SQL migrations 创建 `tasks`、`routines`、`routine_instances`、`app_settings`、`sync_log` 及索引。
- 数据模型：保留 `user_id`、`device_id`、`sync_status`、`version`、`created_at`、`updated_at`、`deleted_at`，为后续多端同步预留。
- 任务来源：`source_type` 使用 `manual`、`routine_daily`、`multi_day`；普通任务、daily routine 实例、多日任务每日实例都落入 `tasks`，routine 元数据保存在 `routines`。
- Repository 层只负责参数化 SQL、事务和数据映射；Service 层负责业务规则；Zustand Store 负责加载状态、调用服务和驱动 UI。
- 所有写操作都更新 `updated_at`、递增 `version`，并写入 `sync_log`；删除只做软删除，不物理删除。
- JSON 导出包含 `schemaVersion`、`exportedAt`、`tasks`、`routines`、`routine_instances`、`settings`；导入按 ID 合并，`deleted` 优先，其次按 `version/updated_at` 取较新记录。

## 实施步骤

1. 环境准备：安装 Rust/Rustup MSVC toolchain、Microsoft C++ Build Tools、确认 WebView2；PowerShell 下开发命令统一使用 `npm.cmd` 或调整执行策略。
2. 创建 `desktop/` 项目：初始化 Vite React TS、Tauri 2、Zustand、lucide-react、CSS Modules、Vitest，并配置 `tauri.conf.json`、capabilities、默认窗口大小与透明/无边框策略。
3. 实现数据库层：创建 migrations、`db.ts`、Repository 基类/工具、默认设置初始化、索引与事务辅助。
4. 实现领域类型与服务：`taskService`、`routineService`、`archiveService`、`settingsService`、`windowService`、`trayService`、`syncService`。
5. 实现 Store：`taskStore` 管理日期任务与红点统计，`routineStore` 管理 routine 与实例生成，`settingsStore` 管理设置和原生开关，`uiStore` 管理面板状态。
6. 实现主界面：标题栏、今日日期、快速输入、设置/routine/归档/锁定/置顶图标按钮、未来 N 天日期卡片、任务项编辑、完成、删除、改日期。
7. 实现归档与恢复：归档页列出 `completed/archived`，支持恢复为 `active` 并清理完成/归档时间；软删除不在主视图和归档页显示。
8. 实现 Routine：daily routine 表单、启用/暂停/删除、开始/结束日期；multi-day 表单按日期范围生成每日任务实例。
9. 实现窗口与托盘能力：关闭窗口默认隐藏到托盘；托盘菜单包含打开/隐藏、添加今日任务、固定桌面、置顶、开机启动、退出。
10. 实现设置页：默认展示天数、完成后立即归档、开机启动、启动显示/最小化、固定桌面、置顶、透明度、主题、字体大小、恢复默认窗口、导入/导出 JSON。
11. 完成启动流程：初始化 DB、加载设置、恢复窗口状态、应用窗口锁定/置顶/透明度、生成可见日期 routine 实例、加载任务、初始化托盘、显示主窗口。
12. 编写 README：记录 Windows 环境要求、开发命令、数据位置、MVP 功能边界、同步预留字段和后续路线。

## 测试与验收

- 自动化测试：日期工具、可见日期生成、红点统计、任务完成流转、软删除、归档恢复、daily routine 幂等生成、multi-day 实例生成、JSON 合并策略。
- 构建检查：`npm.cmd run typecheck`、`npm.cmd run test`、`npm.cmd run build`、`cargo check`、`npm.cmd run tauri dev`。
- Windows 手工验收：应用启动、SQLite 自动初始化、任务新增/编辑/删除/完成、红点正确消失、归档恢复、routine 不重复、多日任务逐日显示。
- 原生能力验收：固定桌面开启后不能拖动/缩放，关闭后可移动；置顶开关生效；关闭到托盘；托盘打开/隐藏/退出；开机启动开关可用。
- UI 验收：`360x620` 下文字不溢出、图标按钮可点击、日期卡片清晰、浅色/深色/跟随系统可用，整体保持轻量便签而非项目管理软件。

## 明确不做

- 不做服务器同步、账号系统、安卓端、Web 管理端。
- 不做提醒时间、复杂通知规则、团队协作、评论、看板、项目管理字段。
- 不物理删除 completed/archived/deleted 任务。
- 不把 routine 与普通任务混成无来源区分的简单 todos 表。
