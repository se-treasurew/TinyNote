你是一个资深全栈工程师、桌面端架构师和产品经理。请帮我开发一个轻量级桌面便签 / 待办软件，项目名为 TinyNote，中文名为“小笺”。

一、产品定位

TinyNote 小笺是一款轻量、简洁、实用的桌面便签工具。它的核心理念是：

轻轻一记，日日有序。

它不是复杂的项目管理软件，也不是重型笔记软件，而是一个常驻桌面的轻量任务便签工具。用户可以随手记录今天、明天或未来某一天要做的事情，也可以管理每日 routine 和多日任务。

第一阶段只开发 Windows 桌面端。后续会扩展安卓端、服务端 Web 管理端和账号同步功能，所以架构上需要预留多端同步能力。

二、技术栈要求

请使用以下技术栈开发 Windows 桌面端：

- Tauri 2
- React
- TypeScript
- SQLite
- Zustand
- Vite
- Tailwind CSS 或普通 CSS Module
- Tauri SQL Plugin
- Tauri Window State Plugin
- Tauri Autostart Plugin
- Tauri Notification Plugin
- Tauri Global Shortcut Plugin，可后置
- Tauri Tray / 系统托盘能力

项目可以参考 SeaZhusp/LiteNote 的技术路线和交互风格，但不要直接照搬它的数据模型。TinyNote 需要支持后续账号同步、归档、routine 和多端数据合并，因此数据库结构要重新设计。

三、第一阶段目标

当前只实现 Windows 桌面端 MVP，要求本地可完整使用，不依赖服务器。

必须完成：

1. 日期视图。
2. 每个日期下展示任务列表。
3. 日期有未完成任务时显示红点。
4. 支持添加、编辑、删除任务。
5. 支持点击任务完成。
6. 完成后的任务进入已完成 / 归档状态。
7. 支持查看归档任务。
8. 支持恢复归档任务。
9. 支持 routine。
10. 支持每日固定 routine。
11. 支持多日大任务。
12. 支持窗口固定大小和位置。
13. 支持窗口置顶。
14. 支持系统托盘。
15. 支持开机启动。
16. 支持保存窗口状态和用户设置。
17. UI 要简洁、清晰、美观、轻量。

四、核心界面要求

主窗口默认尺寸：

- 宽度：360px
- 高度：620px
- 无边框或极简边框
- 支持透明或半透明背景
- 支持圆角卡片
- 整体风格轻量、干净、柔和

主界面结构：

顶部区域：

- 显示当前日期，例如：2026年6月16日 星期二
- 显示产品名 TinyNote / 小笺
- 快速添加任务输入框
- 设置按钮
- Routine 按钮
- 归档按钮
- 固定桌面按钮
- 置顶按钮

主体区域：

- 按日期分组展示任务
- 默认展示未来 7 天
- 每个日期是一个卡片
- 每个日期卡片包含：
  - 日期
  - 星期
  - 红点标识
  - 当前日期下的任务列表
  - 快速添加按钮

任务项：

- 左侧复选框
- 中间任务标题
- 可选标签：routine、多日任务、过期
- 右侧更多菜单
- 点击复选框后任务完成
- 点击标题可以编辑
- 支持删除
- 支持修改日期

红点规则：

- 如果某个日期下存在 status = active 的任务，则该日期显示红点
- 已完成、已归档、已删除任务不触发红点

五、核心功能

1. 任务功能

任务需要支持：

- 添加任务
- 编辑任务标题
- 编辑任务内容
- 修改任务日期
- 删除任务，使用软删除
- 标记完成
- 归档任务
- 恢复归档任务
- 按日期查询任务
- 按日期统计未完成任务数量
- 按 sort_order 排序

任务状态：

- active：未完成
- completed：已完成
- archived：已归档
- deleted：已删除

完成规则：

- 用户点击复选框后，任务从 active 变为 completed
- 如果设置中开启“完成后立即归档”，则直接变为 archived
- completed / archived 任务不再触发日期红点
- 归档页可以查看和恢复任务

2. Routine 功能

Routine 分为两类：

第一类：每日固定任务 daily

例如：

- 运动
- 喝水
- 背单词
- 复盘

规则：

- 用户创建 daily routine 后，系统每天自动生成一个任务实例
- 每个 routine 每天只能生成一次
- 用户可以启用、暂停、删除 routine
- 支持开始日期和结束日期
- 支持工作日 / 周末 / 每日执行，第一版可以简化为每日执行

第二类：多日大任务 multi_day

例如：

- 写论文
- 准备考试
- 完成项目提案

规则：

- 用户创建多日任务时，需要输入开始日期和结束日期
- 在日期范围内，每一天都显示这个任务
- 每天对应一个任务实例
- 每个日期可以单独完成当天的实例

3. 窗口固定功能

需要两个独立开关：

固定桌面：

- 开启后窗口大小不能改变
- 开启后窗口位置不能移动
- 保存当前窗口位置和大小
- 应用重启后恢复
- 关闭后可以移动和调整窗口

固定到顶部：

- 开启后窗口始终置顶
- 关闭后恢复普通窗口层级

这两个开关互相独立。

4. 系统托盘

托盘菜单包含：

- 打开 / 隐藏
- 添加今日任务
- 固定桌面：开 / 关
- 置顶：开 / 关
- 开机启动：开 / 关
- 退出

关闭窗口时默认最小化到托盘，不直接退出。

5. 设置功能

设置项包括：

- 默认展示天数：3 / 7 / 14
- 完成后是否立即归档
- 是否开机启动
- 启动时是否显示窗口
- 启动时是否最小化到托盘
- 是否固定桌面
- 是否固定到顶部
- 窗口透明度
- 主题：浅色 / 深色 / 跟随系统
- 字体大小
- 恢复默认窗口位置
- 导出 JSON
- 导入 JSON

六、数据库设计

使用 SQLite。本地数据库需要放在应用数据目录中。应用启动时自动初始化数据库和表。所有时间使用 ISO 8601 字符串保存。

需要创建以下表：

1. tasks

字段：

- id TEXT PRIMARY KEY
- user_id TEXT
- device_id TEXT
- title TEXT NOT NULL
- content TEXT
- task_date TEXT NOT NULL
- status TEXT NOT NULL DEFAULT 'active'
- priority TEXT NOT NULL DEFAULT 'none'
- source_type TEXT NOT NULL DEFAULT 'manual'
- routine_id TEXT
- parent_task_id TEXT
- sort_order INTEGER NOT NULL DEFAULT 0
- completed_at TEXT
- archived_at TEXT
- deleted_at TEXT
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- sync_status TEXT NOT NULL DEFAULT 'local'
- version INTEGER NOT NULL DEFAULT 1

2. routines

字段：

- id TEXT PRIMARY KEY
- user_id TEXT
- title TEXT NOT NULL
- description TEXT
- routine_type TEXT NOT NULL
- start_date TEXT NOT NULL
- end_date TEXT
- repeat_rule TEXT
- active_days TEXT
- is_enabled INTEGER NOT NULL DEFAULT 1
- progress_mode TEXT NOT NULL DEFAULT 'daily_instance'
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- deleted_at TEXT
- sync_status TEXT NOT NULL DEFAULT 'local'
- version INTEGER NOT NULL DEFAULT 1

3. routine_instances

字段：

- id TEXT PRIMARY KEY
- routine_id TEXT NOT NULL
- task_id TEXT NOT NULL
- instance_date TEXT NOT NULL
- status TEXT NOT NULL DEFAULT 'generated'
- created_at TEXT NOT NULL

要求：

- routine_id + instance_date 唯一，避免重复生成

4. app_settings

字段：

- key TEXT PRIMARY KEY
- value TEXT NOT NULL
- updated_at TEXT NOT NULL

5. sync_log

字段：

- id TEXT PRIMARY KEY
- entity_type TEXT NOT NULL
- entity_id TEXT NOT NULL
- operation TEXT NOT NULL
- payload TEXT NOT NULL
- created_at TEXT NOT NULL
- synced_at TEXT

需要创建索引：

- tasks(task_date, status)
- tasks(updated_at)
- tasks(routine_id)
- routines(is_enabled)
- sync_log(synced_at)

七、代码结构

请按以下结构组织代码：

desktop/
├── src/
│   ├── app/
│   │   └── App.tsx
│   ├── components/
│   │   ├── DateSection.tsx
│   │   ├── TaskItem.tsx
│   │   ├── TaskInput.tsx
│   │   ├── TitleBar.tsx
│   │   ├── RoutinePanel.tsx
│   │   ├── ArchivePanel.tsx
│   │   └── SettingsPanel.tsx
│   ├── pages/
│   │   └── MainPage.tsx
│   ├── stores/
│   │   ├── taskStore.ts
│   │   ├── routineStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   ├── services/
│   │   ├── taskService.ts
│   │   ├── routineService.ts
│   │   ├── archiveService.ts
│   │   ├── settingsService.ts
│   │   ├── windowService.ts
│   │   ├── trayService.ts
│   │   └── syncService.ts
│   ├── repositories/
│   │   ├── db.ts
│   │   ├── taskRepository.ts
│   │   ├── routineRepository.ts
│   │   └── settingsRepository.ts
│   ├── types/
│   │   ├── task.ts
│   │   ├── routine.ts
│   │   └── settings.ts
│   ├── utils/
│   │   ├── date.ts
│   │   ├── id.ts
│   │   └── format.ts
│   └── styles/
│       └── global.css
├── src-tauri/
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md

八、状态管理

使用 Zustand。

需要至少包含：

taskStore：

- tasksByDate
- visibleDays
- selectedDate
- loadTasks()
- addTask()
- updateTask()
- completeTask()
- archiveTask()
- restoreTask()
- deleteTask()
- getActiveCountByDate()

routineStore：

- routines
- loadRoutines()
- createRoutine()
- updateRoutine()
- enableRoutine()
- disableRoutine()
- deleteRoutine()
- generateTodayRoutineTasks()

settingsStore：

- settings
- loadSettings()
- updateSetting()
- toggleTopmost()
- toggleLockWindow()
- toggleAutostart()

uiStore：

- currentPanel
- isArchiveOpen
- isRoutineOpen
- isSettingsOpen

九、启动流程

应用启动后执行：

1. 初始化 SQLite。
2. 创建所有表和索引。
3. 加载 app_settings。
4. 恢复窗口位置、尺寸、固定状态、置顶状态。
5. 执行 routine 生成逻辑。
6. 加载未来 N 天任务，默认 N=7。
7. 初始化系统托盘。
8. 显示主窗口。

十、同步预留

第一阶段不需要实现服务器同步，但所有数据结构必须为同步预留字段。

预留字段包括：

- user_id
- device_id
- sync_status
- version
- updated_at
- deleted_at

后续同步策略：

- 本地优先
- 离线可用
- 所有变更写入 sync_log
- 服务端通过 updated_at、version、deleted_at 合并
- 删除采用软删除
- 冲突第一版采用最后更新时间优先
- deleted 状态优先级最高
- archived / completed 优先级高于 active

十一、UI 风格

整体风格：

- 简洁
- 清晰
- 轻量
- 圆角
- 柔和阴影
- 低饱和配色
- 信息密度适中
- 不要做成复杂项目管理软件
- 不要加入过多按钮
- 主要操作应当能在主界面完成

推荐视觉：

- 背景：浅色或半透明浅色
- 日期卡片：白色或淡灰色
- 红点：小而清晰
- 任务项：一行展示，必要时展开
- 已完成任务：灰色、删除线或隐藏
- 字体：系统默认字体即可
- 动画：轻微即可，不要复杂

十二、验收标准

完成后需要满足：

1. 应用可以正常启动。
2. SQLite 数据库自动初始化。
3. 添加任务后，任务出现在对应日期下。
4. 有未完成任务的日期显示红点。
5. 完成任务后，任务不再触发红点。
6. 归档页可以看到已完成 / 已归档任务。
7. 归档任务可以恢复。
8. 删除任务使用软删除。
9. 创建每日 routine 后，每天自动生成任务。
10. 每个 routine 每天只生成一次。
11. 创建多日任务后，日期范围内每天显示任务。
12. 固定桌面开启后，窗口不能移动和缩放。
13. 固定桌面关闭后，窗口可以移动。
14. 置顶开启后，窗口始终在最上层。
15. 托盘可以打开、隐藏和退出应用。
16. 开机启动开关可以生效。
17. 应用重启后，任务、设置、窗口状态不丢失。
18. UI 在 360x620 尺寸下仍然清晰可用。

十三、开发顺序

请按以下顺序开发：

第一步：创建 Tauri 2 + React + TypeScript 项目。

第二步：实现 SQLite 初始化、数据库表和 Repository 层。

第三步：实现 Task 类型、TaskService、TaskStore。

第四步：实现主界面，包括日期分组、任务列表、红点和快速添加任务。

第五步：实现任务完成、归档、恢复和软删除。

第六步：实现 Routine 数据表、RoutineService 和 RoutinePanel。

第七步：实现每日 routine 和多日任务生成逻辑。

第八步：实现窗口固定、窗口置顶和窗口状态保存。

第九步：实现系统托盘和开机启动。

第十步：实现设置页、导入导出和基础主题。

十四、重要约束

1. 不要把 completed 任务直接物理删除。
2. 不要用简单 todos 表替代完整 tasks 表。
3. 不要把 routine 和普通任务混在一起不做区分。
4. 不要先做服务器同步，但必须预留同步字段。
5. 不要做复杂项目管理功能。
6. 不要引入团队协作、评论、看板等重功能。
7. 保持产品轻量。
8. 所有核心功能必须本地离线可用。
9. Windows 桌面端优先。
10. 后续要能扩展安卓端和 Web 管理端。

请先生成完整项目骨架，然后逐步实现上述功能。