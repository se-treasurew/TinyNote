# TinyNote 小笺

TinyNote 小笺是一个轻量 Windows 桌面便签 / 待办 MVP。第一版本地离线可用，使用 Tauri 2、React、TypeScript、SQLite、Zustand 和 Vite。

## 功能范围

- 未来 N 天日期视图，默认 7 天。
- 每日任务列表、快速添加、编辑、改日期、完成、归档、恢复和软删除。
- 有 `active` 任务的日期显示红点。
- Daily routine 为可见日期范围幂等生成任务实例。
- Multi-day routine 为日期范围内每天生成一个任务实例。
- 窗口固定、置顶、窗口状态保存、系统托盘、开机启动。
- 设置持久化、基础主题、透明度、字号、JSON 导出与设置导入。

## 开发环境

Windows 原生 Tauri 开发需要：

- Node.js 与 npm。当前 PowerShell 若拦截 `npm.ps1`，请使用 `npm.cmd`。
- Rust/Rustup，默认 MSVC toolchain。
- Microsoft C++ Build Tools，勾选 Desktop development with C++。
- WebView2 Runtime。Windows 10 1803+ 通常已内置。

## 常用命令

```powershell
cd desktop
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run tauri dev
```

## 数据与同步预留

SQLite 数据库使用 `sqlite:tinynote.db`，由 Tauri SQL 插件放在应用配置目录。表结构包含 `user_id`、`device_id`、`sync_status`、`version`、`updated_at`、`deleted_at` 和 `sync_log`，为后续账号同步和多端合并预留。

第一版不实现服务器同步、账号系统、提醒规则、团队协作、评论、看板或项目管理能力。
