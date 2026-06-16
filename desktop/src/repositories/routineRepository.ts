import { getDb, runInTransaction, type TinyNoteDatabase } from './db';
import type { Routine, RoutineInstance, RoutineInstanceRow, RoutineRow } from '../types/routine';
import type { Task } from '../types/task';
import { taskToParams } from './taskRepository';

const routineColumns = `
  id, user_id, title, description, routine_type, start_date, end_date, repeat_rule,
  active_days, is_enabled, progress_mode, created_at, updated_at, deleted_at,
  sync_status, version
`;

const routineInstanceColumns = 'id, routine_id, task_id, instance_date, status, created_at';

export class RoutineRepository {
  async listRoutines(includeDeleted = false): Promise<Routine[]> {
    const db = await getDb();
    const rows = await db.select<RoutineRow[]>(
      `SELECT ${routineColumns}
       FROM routines
       ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
       ORDER BY created_at DESC`,
    );
    return rows.map(mapRoutineRow);
  }

  async listEnabledDailyRoutines(): Promise<Routine[]> {
    const db = await getDb();
    const rows = await db.select<RoutineRow[]>(
      `SELECT ${routineColumns}
       FROM routines
       WHERE routine_type = 'daily'
         AND is_enabled = 1
         AND deleted_at IS NULL
       ORDER BY created_at ASC`,
    );
    return rows.map(mapRoutineRow);
  }

  async listInstances(): Promise<RoutineInstance[]> {
    const db = await getDb();
    const rows = await db.select<RoutineInstanceRow[]>(
      `SELECT ${routineInstanceColumns}
       FROM routine_instances
       ORDER BY instance_date DESC`,
    );
    return rows.map(mapRoutineInstanceRow);
  }

  async insertRoutine(routine: Routine): Promise<void> {
    const db = await getDb();
    await insertRoutine(db, routine);
  }

  async saveRoutine(routine: Routine): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE routines
       SET user_id = $2,
           title = $3,
           description = $4,
           routine_type = $5,
           start_date = $6,
           end_date = $7,
           repeat_rule = $8,
           active_days = $9,
           is_enabled = $10,
           progress_mode = $11,
           updated_at = $12,
           deleted_at = $13,
           sync_status = $14,
           version = $15
       WHERE id = $1`,
      routineToUpdateParams(routine),
    );
  }

  async createTasksWithInstances(tasks: Task[]): Promise<void> {
    await runInTransaction(async (db) => {
      for (const task of tasks) {
        await db.execute(
          `INSERT INTO tasks (
            id, user_id, device_id, title, content, task_date, status, priority, source_type,
            routine_id, parent_task_id, sort_order, completed_at, archived_at, deleted_at,
            created_at, updated_at, sync_status, version
          )
          VALUES (${placeholders(19)})`,
          taskToParams(task),
        );

        if (task.routineId) {
          await db.execute(
            `INSERT OR IGNORE INTO routine_instances (${routineInstanceColumns})
             VALUES ($1, $2, $3, $4, 'generated', $5)`,
            [`instance_${task.routineId}_${task.taskDate}`, task.routineId, task.id, task.taskDate, task.createdAt],
          );
        }
      }
    });
  }

  async upsertRoutine(routine: Routine): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO routines (${routineColumns})
       VALUES (${placeholders(16)})
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         title = excluded.title,
         description = excluded.description,
         routine_type = excluded.routine_type,
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         repeat_rule = excluded.repeat_rule,
         active_days = excluded.active_days,
         is_enabled = excluded.is_enabled,
         progress_mode = excluded.progress_mode,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         sync_status = excluded.sync_status,
         version = excluded.version`,
      routineToParams(routine),
    );
  }

  async upsertRoutineInstance(instance: RoutineInstance): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO routine_instances (${routineInstanceColumns})
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(routine_id, instance_date) DO UPDATE SET
         task_id = excluded.task_id,
         status = excluded.status,
         created_at = excluded.created_at`,
      routineInstanceToParams(instance),
    );
  }
}

export function mapRoutineRow(row: RoutineRow): Routine {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    routineType: row.routine_type,
    startDate: row.start_date,
    endDate: row.end_date,
    repeatRule: row.repeat_rule,
    activeDays: row.active_days,
    isEnabled: row.is_enabled === 1,
    progressMode: row.progress_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

export function mapRoutineInstanceRow(row: RoutineInstanceRow): RoutineInstance {
  return {
    id: row.id,
    routineId: row.routine_id,
    taskId: row.task_id,
    instanceDate: row.instance_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function routineToParams(routine: Routine): unknown[] {
  return [
    routine.id,
    routine.userId,
    routine.title,
    routine.description,
    routine.routineType,
    routine.startDate,
    routine.endDate,
    routine.repeatRule,
    routine.activeDays,
    routine.isEnabled ? 1 : 0,
    routine.progressMode,
    routine.createdAt,
    routine.updatedAt,
    routine.deletedAt,
    routine.syncStatus,
    routine.version,
  ];
}

export function routineToUpdateParams(routine: Routine): unknown[] {
  return [
    routine.id,
    routine.userId,
    routine.title,
    routine.description,
    routine.routineType,
    routine.startDate,
    routine.endDate,
    routine.repeatRule,
    routine.activeDays,
    routine.isEnabled ? 1 : 0,
    routine.progressMode,
    routine.updatedAt,
    routine.deletedAt,
    routine.syncStatus,
    routine.version,
  ];
}

export function routineInstanceToParams(instance: RoutineInstance): unknown[] {
  return [
    instance.id,
    instance.routineId,
    instance.taskId,
    instance.instanceDate,
    instance.status,
    instance.createdAt,
  ];
}

async function insertRoutine(db: TinyNoteDatabase, routine: Routine): Promise<void> {
  await db.execute(
    `INSERT INTO routines (${routineColumns})
     VALUES (${placeholders(16)})`,
    routineToParams(routine),
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ');
}
