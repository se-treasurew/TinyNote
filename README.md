# TinyNote 小笺

TinyNote 是一款轻量 Windows 桌面待办管理应用，基于 Tauri 2 + React + TypeScript + SQLite 构建。界面简洁，毛玻璃主题，本地离线可用。当前版本 **v1.0.0**。

## 功能

- **日期视图**：未来 N 天日期条（默认 7 天，可选 3/7/14），有活跃任务的日期显示红点，今日高亮，选中日期自动滚动到可视区
- **三种任务类型**：普通（仅当天）、每日（范围显示、每天进度清零）、多日（范围显示、进度当日及之前继承）
- **任务操作**：快速添加、内联编辑、进度条、完成/恢复、归档、删除（均带二次确认）、任务详情与延期历史
- **顺延**：单任务延期到指定日期；批量顺延当日活跃任务到次日（manual 全部符合，multi_day 在结束当天符合）
- **任务管理面板**：集中创建与管理每日/多日任务（底部栏仅快速添加普通任务）
- **归档面板**：查看/恢复/永久删除已完成与归档任务
- **窗口特性**：无边框毛玻璃窗口、置顶、固定桌面、关闭隐藏到托盘、窗口状态记忆、开机自启、系统托盘菜单
- **主题系统**：7 套主题（毛玻璃蓝/白/薄荷/紫、亮色、暗色、跟随系统），透明度可调，支持自定义背景图
- **数据管理**：JSON 导出 / 导入，同步字段预留（user_id、device_id、sync_status、version）

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

# 构建
npm.cmd run tauri build
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

**任务状态**：`active` → `completed` → `archived`（支持软删除与恢复）

**任务类型**：普通（manual，仅当天）、每日（daily，范围显示+每天清零）、多日（multi_day，范围显示+进度当日及之前继承）。顺延支持 manual 与 multi_day。

## 版本

当前版本 **1.0.0**。版本以 `desktop/src-tauri/tauri.conf.json` 为准，`package.json` 与 `Cargo.toml` 保持一致；标题栏版本号通过 Tauri 运行时 `getVersion()` 读取，无需手动同步。

## 许可

未指定。
