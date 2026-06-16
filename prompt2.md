# TinyNote“小笺”Windows MVP 可行性与实施计划

## 总结
方案技术可行：Tauri 2 + React + TypeScript + SQLite 可以覆盖本地离线、托盘、窗口状态、开机启动和轻量 UI。官方文档确认 SQL 插件支持 SQLite 与迁移，Window State 可恢复窗口状态，Tray/Autostart/Notification/Global Shortcut 均有对应能力。参考：Tauri [Prerequisites](https://v2.tauri.app/start/prerequisites/)、[SQL](https://v2.tauri.app/plugin/sql/)、[Window State](https://v2.tauri.app/plugin/window-state/)、[System Tray](https://v2.tauri.app/learn/system-tray/)、[Autostart](https://v2.tauri.app/plugin/autostart/)。

当前环境判断：目录内只有 `prompt.md`，应按空项目脚手架启动；本机 Node/npm 可用，但 Rust/Cargo 缺失，且当前是 WSL2。实际 Windows 桌面打包与托盘、置顶、开机启动验收应在 Windows 原生环境完成。

## 已确认需求
- 第一阶段只做 Windows 桌面端 MVP，本地完整可用，不接服务器。
- Daily routine 在启动或刷新可见日期时，为当前可见日期范围生成实例，默认未来 7 天。
- 完成任务默认从主日期视图隐藏，进入归档页查看；是否“完成后立即归档”由设置控制。
- JSON 导入采用按 ID 合并策略，不做全量覆盖。
- “固定桌面”解释为：普通鼠标操作下窗口不可拖动、不可缩放，并持久化当前位置和尺寸；“置顶”是独立 always-on-top 开关。

## 关键设计
- 项目结构使用 `desktop/`，脚手架为 Tauri 2 + Vite + React + TypeScript；样式采用 CSS Modules + `global.css` 变量，减少依赖并保持轻量。
- Rust/Tauri 侧初始化 SQL、Window State、Autostart、Notification 插件，开启 tray feature；Global Shortcut 只预留，不纳入第一版核心验收。
- SQLite 使用应用数据目录中的 `sqlite:tinynote.db`，通过 Tauri SQL migrations 创建 `tasks`、`routines`、`routine_instances`、`app_settings`、`sync_log` 与索引。
- `tasks` 保留 `user_id`、`device_id`、`sync_status`、`version`、`updated_at`、`deleted_at`；所有写操作更新时间、递增版本并写入 `sync_log`。
- `source_type` 区分 `manual`、`routine_daily`、`multi_day`；普通任务、daily routine 实例、多日任务实例都落到 `tasks`，routine 元数据保存在 `routines`。
- Daily routine 生成逻辑以 `routine_id + instance_date` 唯一约束保证幂等；多日任务创建时为日期范围内每天生成一个实例。
- 主日期视图只查询 `active` 任务；红点规则为该日期存在 `status = active` 的任务。
- 完成任务：`active -> completed`，若设置开启立即归档则 `active -> archived`；恢复归档/完成项时改回 `active` 并清理完成/归档时间。
- 删除全部采用软删除：`status = deleted` + `deleted_at`，不物理删除。
- 导出 JSON 包含 `schemaVersion`、`exportedAt`、`tasks`、`routines`、`routine_instances`、`settings`；导入在事务内按 ID 合并，`deleted` 优先，其次按 `version/updated_at` 决定较新记录。

## 实施步骤
1. 准备环境：安装 Rust/Cargo、Windows C++ Build Tools、WebView2；确认能在 Windows 原生环境运行 `npm run tauri dev`。
2. 创建 `desktop/` 项目骨架：配置 Vite、React、TypeScript、CSS Modules、Zustand、lucide-react、Tauri 2 插件与 capabilities。
3. 实现数据库层：`db.ts` 加载 SQLite，Repository 封装参数化查询、事务、迁移、索引与默认设置初始化。
4. 实现领域服务与 Store：Task、Routine、Settings、Window、Tray、Archive 服务；Zustand 只承载 UI 状态和异步 action，不直接拼 SQL。
5. 实现主界面：360x620 默认窗口、自定义极简标题栏、顶部快捷输入和图标按钮、未来 N 天日期卡片、任务项编辑/完成/删除/改日期。
6. 实现归档、Routine、设置面板：使用小尺寸友好的滑出面板或覆盖面板；归档页支持恢复，Routine 页支持 daily 与 multi-day，设置页支持窗口、主题、字体、导入导出。
7. 实现窗口与系统能力：关闭最小化到托盘，托盘菜单打开/隐藏/退出/切换固定/置顶/开机启动；固定窗口时禁用拖动与 resize，置顶调用 Tauri window API。
8. 完成持久化启动流程：初始化 DB、加载设置、恢复窗口状态、应用置顶/固定/透明度、生成可见日期 routine 实例、加载任务、初始化托盘。
9. 补齐 README：记录开发命令、Windows 环境要求、数据位置、MVP 功能边界与后续同步预留说明。

## 测试与验收
- 自动化：TypeScript typecheck、前端构建、Rust `cargo check`、Vitest 覆盖日期工具、红点统计、routine 幂等生成、软删除、归档恢复、JSON 合并。
- 手工 Windows 验收：启动、数据库自动创建、任务 CRUD、完成后红点消失、归档恢复、daily routine 不重复、多日任务逐日展示。
- 原生能力验收：窗口固定/解锁、置顶、关闭到托盘、托盘打开/隐藏/退出、开机启动开关、重启后窗口状态和设置不丢失。
- UI 验收：360x620 下无文字溢出、按钮可点、日期卡片清晰、浅色/深色/跟随系统可用，整体不扩展成项目管理工具。

## 默认假设
- MVP 不实现提醒时间、通知规则、服务器同步、账号系统、团队协作、评论、看板。
- Notification 插件先配置能力，第一版仅作为后续提醒功能预留，不强行加入提醒产品逻辑。
- 托盘“添加今日任务”行为为打开主窗口、选中今天并聚焦快速输入框。
- 开发可在 WSL2 写代码，但最终 Tauri dev/build 与 Windows 原生功能验收以 Windows 环境为准。
