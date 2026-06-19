# TinyNote Desktop

TinyNote 的 Tauri 2 + React 桌面应用位于本目录。产品功能、下载安装和版本说明请参阅仓库根目录的 [README](../README.md) 与 [CHANGELOG](../CHANGELOG.md)。

## 开发环境

- Node.js 与 npm；Windows PowerShell 下使用 `npm.cmd`
- Rust / Rustup 与 MSVC toolchain
- Microsoft C++ Build Tools
- WebView2 Runtime

## 常用命令

```powershell
npm.cmd install
npm.cmd run tauri dev
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run tauri -- build
```

SQLite 数据库由 Tauri SQL 插件初始化。应用采用 Repository → Service → Zustand Store → React Component 的分层结构，任务 occurrence、进度与延期历史分别持久化。
