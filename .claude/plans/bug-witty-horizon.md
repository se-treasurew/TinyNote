# Bug Fix Plan: 连续翻页后应用无响应

## Context

用户报告：连续向右翻页后，添加/修改任务大概率无法响应，修改配置也大概率无法实现。经过对 taskStore、settingsStore、services 和 repositories 的全面审查，定位到 3 个核心竞态 Bug 和 2 个相关 Bug。

## 根因分析

### Bug 1（核心）：`navigateDate` 在 `loadTasks` 之外递增 `latestTaskLoadId`

[taskStore.ts:126](desktop/src/stores/taskStore.ts#L126) 中 `navigateDate` 同步执行 `latestTaskLoadId += 1`，然后延迟 120ms 调用 `loadTasks`（其中 [taskStore.ts:79](desktop/src/stores/taskStore.ts#L79) 会再次递增）。这产生两个破坏：

- **用户操作被静默丢弃**：用户在翻页后的 120ms 内执行 `addTask`，它调用 `loadTasks` 并获得 `loadId = N+2`。120ms 后，`navigateDate` 调度的 `loadTasks` 获得 `loadId = N+3`。用户操作的 load 完成时发现 `N+2 !== N+3`（[taskStore.ts:84](desktop/src/stores/taskStore.ts#L84)），静默 return，结果被丢弃。任务已写入数据库但 UI 永不更新。
- **连续翻页放大问题**：翻页 5 次，`latestTaskLoadId` 递增 5 次，但只有最后一次的 load 实际触发。后续任何用户操作的 loadId 都小于下一次翻页产生的 ID，永久被丢弃。

### Bug 2（核心）：`loadTasks` 提前 return 时 `isLoading` 未重置

[taskStore.ts:79-111](desktop/src/stores/taskStore.ts#L79-L111) 中，`loadTasks` 在 3 处因 `loadId !== latestTaskLoadId` 提前 return（[L84-L86](desktop/src/stores/taskStore.ts#L84-L86)、[L89-L91](desktop/src/stores/taskStore.ts#L89-L91)、[L95-L97](desktop/src/stores/taskStore.ts#L95-L97)）。所有这些路径都没有重置 `isLoading: false`（在 [L80](desktop/src/stores/taskStore.ts#L80) 设为 true）。没有 `finally` 块，也没有在 return 前 set。翻页频繁后 `isLoading` 永久卡在 `true`。

### Bug 3（核心）：`navigateDate` 在数据加载前就更新 UI 状态

[taskStore.ts:128](desktop/src/stores/taskStore.ts#L128) 中 `set({ ...dateWindow, isLoading: false })` 立即设置新的日期窗口和 `isLoading: false`，但实际数据要等 120ms 后才加载。UI 在这段时间显示新的日期标题但对应当旧数据，用户交互基于错误的状态。

### Bug 4（相关）：设置 Store 的乐观更新回滚使用错误快照

[settingsStore.ts:34](desktop/src/stores/settingsStore.ts#L34) 中 `previousSettings` 捕获的是包含上次乐观更新的状态。如果两次 `updateSetting` 并发，回滚时恢复到的是中间的乐观状态，不是真正的 DB 状态。

### Bug 5（相关）：`navigateDate` void 调用吞噬错误

[taskStore.ts:130](desktop/src/stores/taskStore.ts#L130) `void get().loadTasks(...)` 吞掉所有 load 异常。如果 DB 查询失败，错误被静默丢弃，`isLoading` 永远未被后续成功 load 重置的情况下 UI 冻结。

## 修复方案

### 修复 1：移除 `navigateDate` 中的 `latestTaskLoadId` 递增

**文件**：[taskStore.ts](desktop/src/stores/taskStore.ts)

删除 [L126](desktop/src/stores/taskStore.ts#L126) `latestTaskLoadId += 1;`。`loadTasks` 内部已在 [L79](desktop/src/stores/taskStore.ts#L79) 自行递增。`navigateDate` 不应管理此计数器。

### 修复 2：`loadTasks` 所有提前 return 路径在 return 前重置 `isLoading`

**文件**：[taskStore.ts](desktop/src/stores/taskStore.ts)

在 [L84-86](desktop/src/stores/taskStore.ts#L84-L86)、[L89-91](desktop/src/stores/taskStore.ts#L89-L91)、[L95-97](desktop/src/stores/taskStore.ts#L95-L97) 三处 `return` 前加 `set({ isLoading: false });`。抽取 `abortLoad()` 辅助函数统一处理。

### 修复 3：`navigateDate` 不立即更新 UI 日期窗口

**文件**：[taskStore.ts](desktop/src/stores/taskStore.ts)

将 [L128](desktop/src/stores/taskStore.ts#L128) 的 `set({ ...dateWindow, isLoading: false })` 移除。`loadTasks` 在成功加载后统一设置日期窗口（已在 [L100-L105](desktop/src/stores/taskStore.ts#L100-L105) 做）。

### 修复 4：`navigateDate` 的 load 调用改为 await 并处理错误

**文件**：[taskStore.ts](desktop/src/stores/taskStore.ts)

将 `scheduleNavigationLoad` 内部改为 await loadTasks + catch 调用 `abortLoad()`。签名从 `() => void` 改为 `() => Promise<void>`。

### 修复 5：`previousSettings` 快照使用 DB 返回的值

**文件**：[settingsStore.ts](desktop/src/stores/settingsStore.ts)

在 `updateSetting` 回滚时，不再使用捕获的 `previousSettings`，而是直接从 DB 重新加载设置。移除 `previousSettings` 变量。

## 验证

1. 启动应用：`cd desktop && npm.cmd run tauri dev`
2. 连续点击右箭头翻页 10 次，观察 UI 是否仍然响应
3. 在翻页过程中快速添加任务，确认任务正确出现在列表中
4. 翻页后立即修改设置（主题、字号），确认设置生效
5. 运行现有测试：`npm.cmd run test`，确保无回归