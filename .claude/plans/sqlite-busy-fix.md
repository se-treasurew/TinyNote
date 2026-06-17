# Fix Plan: SQLITE_BUSY "database is locked" After Rapid Date Navigation

## Context

用户反馈：连续翻页后报错 `error returned from database: (code: 5) database is locked`（SQLITE_BUSY）。即使之前的竞态 Bug 已修复，DB 层面的并发问题依然存在。

## 根因分析

### 核心问题：SQLite 使用默认的 DELETE 日志模式 + 无 busy_timeout

[lib.rs:92-171](desktop/src-tauri/src/lib.rs#L92-L171) 的迁移 SQL 中完全没有配置 `PRAGMA journal_mode` 和 `PRAGMA busy_timeout`。

- **DELETE 模式**：写操作持有排他锁，所有并发读写被阻塞。写操作未完成时任何并发读立即返回 `SQLITE_BUSY`。
- **无 busy_timeout**：SQLite 默认不等待，锁冲突瞬间返回 `SQLITE_BUSY`，不重试。

### 触发路径

每次翻页触发 `loadTasks` → `routineService.generateVisibleRoutineTasks` → `createTasksWithInstances` 在 `BEGIN IMMEDIATE` 事务中逐条 INSERT（[routineRepository.ts:77-98](desktop/src/repositories/routineRepository.ts#L77-L98)）。翻页后立即操作任务触发新 DB 操作，与尚未释放锁的事务冲突 → `SQLITE_BUSY`。

### 次要问题：无应用层重试

[db.ts:25](desktop/src/repositories/db.ts#L25) 的 `BEGIN IMMEDIATE` 失败时直接 throw，没有重试。

## 修复方案

### 修复 1：启用 WAL 模式 + 设置 busy_timeout

**文件**：[lib.rs](desktop/src-tauri/src/lib.rs)

在迁移 SQL 最前面添加：

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

- `journal_mode=WAL`：并发读写，写操作不阻塞读
- `busy_timeout=5000`：遇锁等待最多 5 秒，而非立即返回 SQLITE_BUSY

### 修复 2：`runInTransaction` 添加重试

**文件**：[db.ts](desktop/src/repositories/db.ts)

`BEGIN IMMEDIATE` 调用外包重试逻辑：最多 3 次，间隔 100ms。保证 ROLLBACK 失败时仍抛出原始错误。

## 验证

1. 启动应用：`cd desktop && npm.cmd run tauri dev`
2. 连续翻页 20 次，确认无 "database is locked"
3. 翻页后立即添加 / 修改任务，操作正常
4. 运行测试：`npm.cmd run test`