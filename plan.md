# TinyNote“小笺”Windows MVP 实施计划

## 摘要

- 方案技术可行：Tauri 2 覆盖 Windows 桌面、托盘、窗口状态、开机启动、通知、全局快捷键等能力；SQL 插件支持 SQLite 与迁移；Window State 插件可保存/恢复窗口状态。
- MVP 边界：第一阶段只做 Windows 桌面端，本地离线完整可用，不接服务器；通知与全局快捷键只做能力预留。
- 当前任务体系已从 routine 自动生成改为“任务定义 + 日期 occurrence + 进度记录”：普通、每日、多日任务都从添加入口创建，按选中日期计算展示。

## 已确认需求与默认口径

- 核心范围：日期视图、未来 N 天任务、红点、普通/每日/多日任务、任务 CRUD、完成、归档/恢复、软删除、百分比进度、窗口锁定、置顶、托盘、开机启动、设置持久化、导入导出 JSON。
- 普通任务是一次性任务，默认只显示在开始日期；设置开启“进度顺延”后，未完成普通任务可在后续日期显示并继承最近进度。
- 多日任务按开始/结束日期范围展示；设置开启“进度顺延”后，当天没有进度记录时继承前一天最近进度。
- 每日任务从开始日期起每天展示，结束日期可为空；每日进度默认独立，从 0 开始，不继承昨日。
- 所有任务支持 0-100 百分比进度；修改进度不自动完成任务，点击完成才改变完成状态。
- 任务完成后默认变为 `completed`，从未完成列表移到当天已完成区域；若设置开启“完成后立即归档”，完成时直接变为 `archived`。
- UI 采用轻量桌面便签风格，默认窗口 `360x620`，按钮图标使用 `lucide-react`。

## 关键实现设计

- 项目结构：`desktop/` 使用 Tauri 2 + Vite + React + TypeScript + Zustand + SQLite。
- 数据库：`tasks` 保存任务定义，`task_progress_entries` 保存 `task_id + progress_date` 的当日进度与当日状态；旧 `routines/routine_instances` 表保留兼容但不再驱动主流程。
- 任务来源：`source_type` 使用 `manual`、`daily`、`multi_day`；旧 `routine_daily` 测试数据在迁移中清理或导入时归一化为 `daily`。
- `taskService.loadVisibleTasks()` 加载任务定义与进度记录，并通过 occurrence 计算函数生成当前日期窗口的展示项。
- `taskStore` 只管理日期窗口、任务 occurrence、归档列表和乐观更新；不再调用 routine 自动生成。
- JSON 导出升级到 `schemaVersion: 2`，包含 `tasks`、`taskProgressEntries`、`settings`，并保留 `routines/routineInstances` 字段用于旧文件结构兼容。

## 实施步骤

1. 环境准备：安装 Rust/Rustup MSVC toolchain、Microsoft C++ Build Tools、确认 WebView2；PowerShell 下开发命令使用 `npm.cmd`。
2. 创建并维护 `desktop/` 项目：Vite React TS、Tauri 2、Zustand、lucide-react、Vitest。
3. 实现数据库层：migrations、默认设置初始化、SQLite 写队列、busy retry、任务定义与进度记录 repository。
4. 实现领域服务：任务 occurrence 计算、任务 CRUD、进度更新、完成/归档/恢复、设置、窗口、托盘、导入导出。
5. 实现 Store：`taskStore` 管理日期任务与红点统计，`settingsStore` 管理设置和原生开关，`uiStore` 管理面板状态。
6. 实现主界面：标题栏、日期条、添加任务表单、任务项编辑、完成、删除、改日期、进度条、已完成区域。
7. 实现设置页：展示天数、完成后立即归档、进度顺延、开机启动、启动显示/最小化、固定桌面、置顶、透明度、主题、字体大小、背景图片、导入/导出 JSON。
8. 实现窗口与托盘能力：关闭窗口默认隐藏到托盘；托盘菜单包含打开/隐藏、添加今日任务、固定桌面、置顶、开机启动、退出。
9. 完成启动流程：初始化 DB、加载设置、恢复窗口状态、应用窗口锁定/置顶/透明度、加载当前日期窗口任务、初始化托盘、显示主窗口。
10. 编写和维护文档：记录 Windows 环境要求、开发命令、数据位置、MVP 功能边界、同步预留字段和后续路线。

## 测试与验收

- 自动化测试：日期工具、日期翻页、任务 occurrence 计算、进度顺延、每日任务独立进度、多日任务范围、任务完成流转、软删除、归档恢复、JSON 合并策略。
- 构建检查：`npm.cmd run test`、`npm.cmd run typecheck`、`cargo check`、`npm.cmd run tauri -- build`。
- Windows 手工验收：应用启动、SQLite 自动初始化、普通/每日/多日任务新增、编辑、删除、完成、进度修改、红点统计、归档恢复、导入导出。
- 原生能力验收：固定桌面开启后不能拖动/缩放，关闭后可移动；置顶开关生效；关闭到托盘；托盘打开/隐藏/退出；开机启动开关可用。
- UI 验收：`360x620` 下文字不溢出，图标按钮可点击，日期卡片清晰，浅色/深色/玻璃主题可用，整体保持轻量便签而非项目管理软件。

## 明确不做

- 不做服务器同步、账号系统、安卓端、Web 管理端。
- 不做提醒时间、复杂通知规则、团队协作、评论、看板、项目管理字段。
- 不保存进度修改历史；第一版只保存每个任务每天最新百分比。
- 不提前为每日/多日任务批量生成每天的 task 记录。
