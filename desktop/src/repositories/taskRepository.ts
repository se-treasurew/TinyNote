import {
  executeInTransaction,
  executeWrite,
  runInTransaction,
  selectWithRetry,
  type TinyNoteDatabase,
} from './db';
import type { Task, TaskRow } from '../types/task';

const taskColumns = `
  id, user_id, device_id, title, content, task_date, status, priority, source_type,
  routine_id, parent_task_id, sort_order, completed_at, archived_at, deleted_at,
  created_at, updated_at, sync_status, version
`;

export class TaskRepository {
  async listByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       WHERE task_date BETWEEN $1 AND $2
         AND status != 'deleted'
       ORDER BY task_date ASC, sort_order ASC, created_at ASC`,
      [startDate, endDate],
    );
    return rows.map(mapTaskRow);
  }

  async listArchive(): Promise<Task[]> {
    const rows = await selectWithRetry<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks
       WHERE status IN ('completed', 'archived')
       ORDER BY updated_at DESC`,
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

  async insert(task: Task): Promise<void> {
    await executeWrite(
      `INSERT INTO tasks (${taskColumns})
       VALUES (${placeholders(19)})`,
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
           status = $7,
           priority = $8,
           source_type = $9,
           routine_id = $10,
           parent_task_id = $11,
           sort_order = $12,
           completed_at = $13,
           archived_at = $14,
           deleted_at = $15,
           updated_at = $16,
           sync_status = $17,
           version = $18
       WHERE id = $1`,
      taskToUpdateParams(task),
    );
  }

  async upsert(task: Task): Promise<void> {
    await executeWrite(
      `INSERT INTO tasks (${taskColumns})
       VALUES (${placeholders(19)})
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         device_id = excluded.device_id,
         title = excluded.title,
         content = excluded.content,
         task_date = excluded.task_date,
         status = excluded.status,
         priority = excluded.priority,
         source_type = excluded.source_type,
         routine_id = excluded.routine_id,
         parent_task_id = excluded.parent_task_id,
         sort_order = excluded.sort_order,
         completed_at = excluded.completed_at,
         archived_at = excluded.archived_at,
         deleted_at = excluded.deleted_at,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         sync_status = excluded.sync_status,
         version = excluded.version`,
      taskToParams(task),
    );
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
    status: row.status,
    priority: row.priority,
    sourceType: row.source_type,
    routineId: row.routine_id,
    parentTaskId: row.parent_task_id,
    sortOrder: row.sort_order,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    task.status,
    task.priority,
    task.sourceType,
    task.routineId,
    task.parentTaskId,
    task.sortOrder,
    task.completedAt,
    task.archivedAt,
    task.deletedAt,
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
    task.status,
    task.priority,
    task.sourceType,
    task.routineId,
    task.parentTaskId,
    task.sortOrder,
    task.completedAt,
    task.archivedAt,
    task.deletedAt,
    task.updatedAt,
    task.syncStatus,
    task.version,
  ];
}

async function insertTask(db: TinyNoteDatabase, task: Task): Promise<void> {
  await executeInTransaction(
    db,
    `INSERT INTO tasks (${taskColumns})
     VALUES (${placeholders(19)})`,
    taskToParams(task),
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ');
}
