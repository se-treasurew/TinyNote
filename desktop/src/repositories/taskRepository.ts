import {
  executeInTransaction,
  executeWrite,
  runInTransaction,
  selectWithRetry,
  type TinyNoteDatabase,
} from './db';
import type { Task, TaskPostponement, TaskPostponementRow, TaskProgressEntry, TaskProgressEntryRow, TaskRow } from '../types/task';

const taskColumns = `
  id, user_id, device_id, title, content, task_date, end_date, status, priority, source_type,
  routine_id, parent_task_id, sort_order, completed_at, completed_on_date, archived_at, deleted_at, postponed_at,
  created_at, updated_at, sync_status, version
`;

const taskProgressEntryColumns = `
  id, task_id, progress_date, percent, status, completed_at, archived_at, deleted_at,
  created_at, updated_at, sync_status, version
`;

const taskPostponementColumns = `
  id, task_id, from_date, to_date, created_at, updated_at, deleted_at, sync_status, version
`;

export class TaskRepository {
  async listByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       WHERE status != 'deleted'
         AND (
            -- Manual tasks show on their own date and on any active
            -- postponement target date. The target may be visible after the
            -- definition date has scrolled out of the current window.
            (source_type = 'manual' AND (
              (task_date >= $1 AND task_date <= $2)
              OR EXISTS (
                SELECT 1
                FROM task_postponements
                WHERE task_postponements.task_id = tasks.id
                  AND task_postponements.deleted_at IS NULL
                  AND task_postponements.to_date >= $1
                  AND task_postponements.to_date <= $2
              )
            ))
           -- Daily/multi-day tasks span a range. Daily tasks with no end_date
           -- stay active indefinitely by design, so they remain unbounded on
           -- the lower side; multi-day tasks are bounded by end_date >= $1.
           OR (source_type IN ('daily', 'multi_day') AND task_date <= $2 AND (end_date IS NULL OR end_date >= $1))
         )
       ORDER BY task_date ASC, sort_order ASC, created_at ASC`,
      [startDate, endDate],
    );
    return rows.map(mapTaskRow);
  }

  async listAll(): Promise<Task[]> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       ORDER BY updated_at DESC`,
    );
    return rows.map(mapTaskRow);
  }

  async findById(id: string): Promise<Task | null> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return rows[0] ? mapTaskRow(rows[0]) : null;
  }

  async listByParentId(parentId: string): Promise<Task[]> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       WHERE parent_task_id = $1
         AND status != 'deleted'
       ORDER BY sort_order ASC, created_at ASC`,
      [parentId],
    );
    return rows.map(mapTaskRow);
  }

  async saveMany(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) {
      return;
    }

    await runInTransaction(async (db) => {
      for (const task of tasks) {
        await executeInTransaction(
          db,
          `UPDATE tasks
           SET user_id = $2,
               device_id = $3,
               title = $4,
               content = $5,
               task_date = $6,
               end_date = $7,
               status = $8,
               priority = $9,
               source_type = $10,
               routine_id = $11,
               parent_task_id = $12,
               sort_order = $13,
               completed_at = $14,
               completed_on_date = $15,
               archived_at = $16,
               deleted_at = $17,
               postponed_at = $18,
               updated_at = $19,
               sync_status = $20,
               version = $21
           WHERE id = $1`,
          taskToUpdateParams(task),
        );
      }
    });
  }

  async insert(task: Task): Promise<void> {
    await executeWrite(
      `INSERT INTO tasks (${taskColumns})
       VALUES (${placeholders(22)})`,
      taskToParams(task),
    );
  }

  async insertMany(tasks: Task[]): Promise<void> {
    await runInTransaction(async (db) => {
      for (const task of tasks) {
        await insertTask(db, task);
      }
    });
  }

  async save(task: Task): Promise<void> {
    await executeWrite(
      `UPDATE tasks
       SET user_id = $2,
           device_id = $3,
           title = $4,
           content = $5,
           task_date = $6,
           end_date = $7,
           status = $8,
           priority = $9,
           source_type = $10,
           routine_id = $11,
           parent_task_id = $12,
           sort_order = $13,
           completed_at = $14,
           completed_on_date = $15,
           archived_at = $16,
           deleted_at = $17,
           postponed_at = $18,
           updated_at = $19,
           sync_status = $20,
           version = $21
       WHERE id = $1`,
      taskToUpdateParams(task),
    );
  }

  async upsert(task: Task): Promise<void> {
    await executeWrite(
      `INSERT INTO tasks (${taskColumns})
       VALUES (${placeholders(22)})
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         device_id = excluded.device_id,
         title = excluded.title,
         content = excluded.content,
         task_date = excluded.task_date,
         end_date = excluded.end_date,
         status = excluded.status,
         priority = excluded.priority,
         source_type = excluded.source_type,
         routine_id = excluded.routine_id,
         parent_task_id = excluded.parent_task_id,
         sort_order = excluded.sort_order,
         completed_at = excluded.completed_at,
         completed_on_date = excluded.completed_on_date,
         archived_at = excluded.archived_at,
         deleted_at = excluded.deleted_at,
         postponed_at = excluded.postponed_at,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         sync_status = excluded.sync_status,
         version = excluded.version`,
      taskToParams(task),
    );
  }

  async listProgressEntries(taskIds: string[], endDate: string): Promise<TaskProgressEntry[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const taskIdPlaceholders = taskIds.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await selectWithRetry<TaskProgressEntryRow[]>(
      `SELECT ${taskProgressEntryColumns}
       FROM task_progress_entries
       WHERE task_id IN (${taskIdPlaceholders})
         AND progress_date <= $${taskIds.length + 1}
         AND status != 'deleted'
       ORDER BY progress_date ASC, updated_at ASC`,
      [...taskIds, endDate],
    );
    return rows.map(mapTaskProgressEntryRow);
  }

  async listAllProgressEntries(): Promise<TaskProgressEntry[]> {
    const rows = await selectWithRetry<TaskProgressEntryRow[]>(
      `SELECT ${taskProgressEntryColumns}
       FROM task_progress_entries
       ORDER BY updated_at DESC`,
    );
    return rows.map(mapTaskProgressEntryRow);
  }

  async listPostponements(taskIds: string[]): Promise<TaskPostponement[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const taskIdPlaceholders = taskIds.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await selectWithRetry<TaskPostponementRow[]>(
      `SELECT ${taskPostponementColumns}
       FROM task_postponements
       WHERE task_id IN (${taskIdPlaceholders})
         AND deleted_at IS NULL
       ORDER BY from_date ASC, created_at ASC`,
      taskIds,
    );
    return rows.map(mapTaskPostponementRow);
  }

  async listAllPostponements(): Promise<TaskPostponement[]> {
    const rows = await selectWithRetry<TaskPostponementRow[]>(
      `SELECT ${taskPostponementColumns}
       FROM task_postponements
       ORDER BY updated_at DESC`,
    );
    return rows.map(mapTaskPostponementRow);
  }

  async findProgressEntry(taskId: string, progressDate: string): Promise<TaskProgressEntry | null> {
    const rows = await selectWithRetry<TaskProgressEntryRow[]>(
      `SELECT ${taskProgressEntryColumns}
       FROM task_progress_entries
       WHERE task_id = $1
         AND progress_date = $2
       LIMIT 1`,
      [taskId, progressDate],
    );
    return rows[0] ? mapTaskProgressEntryRow(rows[0]) : null;
  }

  async findActivePostponement(taskId: string, fromDate: string, toDate: string): Promise<TaskPostponement | null> {
    const rows = await selectWithRetry<TaskPostponementRow[]>(
      `SELECT ${taskPostponementColumns}
       FROM task_postponements
       WHERE task_id = $1
         AND from_date = $2
         AND to_date = $3
         AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
      [taskId, fromDate, toDate],
    );
    return rows[0] ? mapTaskPostponementRow(rows[0]) : null;
  }

  async upsertProgressEntry(entry: TaskProgressEntry): Promise<void> {
    await executeWrite(
      `INSERT INTO task_progress_entries (${taskProgressEntryColumns})
       VALUES (${placeholders(12)})
       ON CONFLICT(task_id, progress_date) DO UPDATE SET
         percent = excluded.percent,
         status = excluded.status,
         completed_at = excluded.completed_at,
         archived_at = excluded.archived_at,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at,
         sync_status = excluded.sync_status,
         version = excluded.version`,
      taskProgressEntryToParams(entry),
    );
  }

  async upsertPostponement(postponement: TaskPostponement): Promise<void> {
    await executeWrite(
      `INSERT INTO task_postponements (${taskPostponementColumns})
       VALUES (${placeholders(9)})
       ON CONFLICT(id) DO UPDATE SET
         task_id = excluded.task_id,
         from_date = excluded.from_date,
         to_date = excluded.to_date,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         sync_status = excluded.sync_status,
         version = excluded.version`,
      taskPostponementToParams(postponement),
    );
  }

  async softDeletePostponements(taskId: string, now: string): Promise<TaskPostponement[]> {
    const active = await this.listPostponements([taskId]);
    const deleted = active.map((postponement) => ({
      ...postponement,
      updatedAt: now,
      deletedAt: now,
      syncStatus: 'pending' as const,
      version: postponement.version + 1,
    }));

    await runInTransaction(async (db) => {
      for (const postponement of deleted) {
        await executeInTransaction(
          db,
          `UPDATE task_postponements
           SET updated_at = $2,
               deleted_at = $3,
               sync_status = $4,
               version = $5
           WHERE id = $1`,
          [
            postponement.id,
            postponement.updatedAt,
            postponement.deletedAt,
            postponement.syncStatus,
            postponement.version,
          ],
        );
      }
    });

    return deleted;
  }
}

export function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    title: row.title,
    content: row.content,
    taskDate: row.task_date,
    endDate: row.end_date,
    status: row.status,
    priority: row.priority,
    sourceType: row.source_type,
    routineId: row.routine_id,
    parentTaskId: row.parent_task_id,
    sortOrder: row.sort_order,
    completedAt: row.completed_at,
    completedOnDate: row.completed_on_date ?? null,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    postponedAt: row.postponed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

export function mapTaskProgressEntryRow(row: TaskProgressEntryRow): TaskProgressEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    progressDate: row.progress_date,
    percent: row.percent,
    status: row.status,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

export function mapTaskPostponementRow(row: TaskPostponementRow): TaskPostponement {
  return {
    id: row.id,
    taskId: row.task_id,
    fromDate: row.from_date,
    toDate: row.to_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

export function taskToParams(task: Task): unknown[] {
  return [
    task.id,
    task.userId,
    task.deviceId,
    task.title,
    task.content,
    task.taskDate,
    task.endDate,
    task.status,
    task.priority,
    task.sourceType,
    task.routineId,
    task.parentTaskId,
    task.sortOrder,
    task.completedAt,
    task.completedOnDate,
    task.archivedAt,
    task.deletedAt,
    task.postponedAt,
    task.createdAt,
    task.updatedAt,
    task.syncStatus,
    task.version,
  ];
}

export function taskToUpdateParams(task: Task): unknown[] {
  return [
    task.id,
    task.userId,
    task.deviceId,
    task.title,
    task.content,
    task.taskDate,
    task.endDate,
    task.status,
    task.priority,
    task.sourceType,
    task.routineId,
    task.parentTaskId,
    task.sortOrder,
    task.completedAt,
    task.completedOnDate,
    task.archivedAt,
    task.deletedAt,
    task.postponedAt,
    task.updatedAt,
    task.syncStatus,
    task.version,
  ];
}

export function taskProgressEntryToParams(entry: TaskProgressEntry): unknown[] {
  return [
    entry.id,
    entry.taskId,
    entry.progressDate,
    entry.percent,
    entry.status,
    entry.completedAt,
    entry.archivedAt,
    entry.deletedAt,
    entry.createdAt,
    entry.updatedAt,
    entry.syncStatus,
    entry.version,
  ];
}

export function taskPostponementToParams(postponement: TaskPostponement): unknown[] {
  return [
    postponement.id,
    postponement.taskId,
    postponement.fromDate,
    postponement.toDate,
    postponement.createdAt,
    postponement.updatedAt,
    postponement.deletedAt,
    postponement.syncStatus,
    postponement.version,
  ];
}

async function insertTask(db: TinyNoteDatabase, task: Task): Promise<void> {
  await executeInTransaction(
    db,
    `INSERT INTO tasks (${taskColumns})
     VALUES (${placeholders(22)})`,
    taskToParams(task),
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ');
}
