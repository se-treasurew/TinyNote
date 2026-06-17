# TinyNote 小笺

TinyNote 是一款轻量 Windows 桌面待办管理应用，基于 Tauri 2 + React + TypeScript + SQLite 构建。界面简洁，毛玻璃主题，本地离线可用。

## 功能

- **日期视图**：未来 N 天日期条（默认 7 天），有活跃任务的日期显示红点
- **任务管理**：快速添加、编辑、改日期、完成、归档、恢复、软删除
- **例行任务**：每日 / 多日例行任务，自动生成任务实例，幂等去重
- **窗口特性**：无边框毛玻璃窗口、置顶、关闭隐藏到托盘、窗口状态记忆、开机自启
- **主题系统**：7 套主题（毛玻璃蓝/白/薄荷/紫、亮色、暗色、跟随系统），透明度可调
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

**启动流程**：初始化数据库 → 加载设置 → 加载例行任务 → 加载任务 → 注册托盘监听

**任务状态**：`active` → `completed` → `archived`（支持软删除与恢复）

## 许可

未指定。
