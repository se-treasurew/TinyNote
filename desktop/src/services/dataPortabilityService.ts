import { RoutineRepository } from '../repositories/routineRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { defaultSettings, type AppSettings, type AppSettingKey } from '../types/settings';
import type { Routine } from '../types/routine';
import type { Task, TaskPostponement, TaskProgressEntry } from '../types/task';
import { chooseMergedRecord, createExportPayload, type TinyNoteExport, type TinyNoteImport } from './syncService';
import { writeSyncLog } from './syncLogService';

const taskRepository = new TaskRepository();
const routineRepository = new RoutineRepository();
const settingsRepository = new SettingsRepository();

export const dataPortabilityService = {
  async exportData(): Promise<TinyNoteExport> {
    const [tasks, routines, routineInstances, taskProgressEntries, taskPostponements, settings] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
      routineRepository.listInstances(),
      taskRepository.listAllProgressEntries(),
      taskRepository.listAllPostponements(),
      settingsRepository.load(),
    ]);

    return createExportPayload({
      tasks,
      routines,
      routineInstances,
      taskProgressEntries,
      taskPostponements,
      settings,
    });
  },

  async importData(payload: TinyNoteImport): Promise<void> {
    assertPayload(payload);

    const [localTasks, localRoutines, localProgressEntries, localPostponements] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
      taskRepository.listAllProgressEntries(),
      taskRepository.listAllPostponements(),
    ]);
    const localTaskMap = new Map(localTasks.map((task) => [task.id, task]));
    const localRoutineMap = new Map(localRoutines.map((routine) => [routine.id, routine]));
    const localProgressMap = new Map(localProgressEntries.map((entry) => [entry.id, entry]));
    const localPostponementMap = new Map(localPostponements.map((postponement) => [postponement.id, postponement]));
    const importedProgressEntries = 'taskProgressEntries' in payload ? payload.taskProgressEntries : [];
    const completedProgressDateByTask = latestCompletedProgressDates(importedProgressEntries);

    for (const incoming of payload.tasks) {
      const local = localTaskMap.get(incoming.id);
      const normalized = normalizeImportedTask(incoming, completedProgressDateByTask.get(incoming.id));
      const merged = local ? chooseMergedRecord(local, normalized) : normalized;
      await taskRepository.upsert(merged);
      await writeSyncLog({ entityType: 'task', entityId: merged.id, operation: 'import', payload: merged });
    }

    for (const incoming of payload.routines) {
      const local = localRoutineMap.get(incoming.id);
      const merged = local ? chooseMergedRecord(routineAsSyncable(local), routineAsSyncable(incoming)) : incoming;
      await routineRepository.upsertRoutine(merged as Routine);
      await writeSyncLog({ entityType: 'routine', entityId: incoming.id, operation: 'import', payload: merged });
    }

    for (const instance of payload.routineInstances) {
      await routineRepository.upsertRoutineInstance(instance);
    }

    if (payload.schemaVersion === 2) {
      for (const incoming of payload.taskProgressEntries) {
        const local = localProgressMap.get(incoming.id);
        const normalized = normalizeImportedProgressEntry(incoming);
        const merged = local ? chooseMergedRecord(local, normalized) : normalized;
        await taskRepository.upsertProgressEntry(merged);
        await writeSyncLog({ entityType: 'task_progress', entityId: merged.id, operation: 'import', payload: merged });
      }
    }

    if (payload.schemaVersion === 3) {
      for (const incoming of payload.taskProgressEntries) {
        const local = localProgressMap.get(incoming.id);
        const normalized = normalizeImportedProgressEntry(incoming);
        const merged = local ? chooseMergedRecord(local, normalized) : normalized;
        await taskRepository.upsertProgressEntry(merged);
        await writeSyncLog({ entityType: 'task_progress', entityId: merged.id, operation: 'import', payload: merged });
      }

      for (const incoming of payload.taskPostponements) {
        const normalized = normalizeImportedPostponement(incoming);
        const local = localPostponementMap.get(normalized.id);
        const merged = local ? chooseMergedRecord(local, normalized) : normalized;
        await taskRepository.upsertPostponement(merged);
        await writeSyncLog({ entityType: 'task_postponement', entityId: merged.id, operation: 'import', payload: merged });
      }
    }

    await settingsRepository.setMany(normalizeImportedSettings(payload.settings));
  },
};

function assertPayload(payload: TinyNoteImport): void {
  if (
    !payload ||
    (payload.schemaVersion !== 1 && payload.schemaVersion !== 2 && payload.schemaVersion !== 3) ||
    !Array.isArray(payload.tasks) ||
    !Array.isArray(payload.routines) ||
    (payload.schemaVersion === 3 && !Array.isArray(payload.taskPostponements))
  ) {
    throw new Error('Invalid TinyNote export file');
  }
}

function normalizeImportedTask(task: Task, completedProgressDate?: string): Task {
  const sourceType = String(task.sourceType);
  const normalizedSourceType = sourceType === 'routine_daily' ? 'daily' : task.sourceType;
  const normalizedStatus = task.status === 'archived' ? 'completed' : task.status;
  const storedCompletionDate = (task as Task & { completedOnDate?: string | null }).completedOnDate;
  return {
    ...task,
    endDate: task.endDate ?? null,
    postponedAt: task.postponedAt ?? null,
    completedOnDate: resolveImportedCompletionDate(
      task,
      normalizedSourceType,
      normalizedStatus,
      storedCompletionDate ?? completedProgressDate ?? task.completedAt?.slice(0, 10),
    ),
    sourceType: normalizedSourceType,
    status: normalizedStatus,
    archivedAt: task.status === 'archived' ? null : task.archivedAt,
  } as Task;
}

function latestCompletedProgressDates(entries: TaskProgressEntry[]): Map<string, string> {
  const latest = new Map<string, TaskProgressEntry>();
  for (const entry of entries) {
    if ((entry.status !== 'completed' && entry.status !== 'archived') || entry.deletedAt) {
      continue;
    }
    const current = latest.get(entry.taskId);
    if (!current || entry.updatedAt > current.updatedAt) {
      latest.set(entry.taskId, entry);
    }
  }
  return new Map(Array.from(latest, ([taskId, entry]) => [taskId, entry.progressDate]));
}

function resolveImportedCompletionDate(
  task: Task,
  sourceType: Task['sourceType'],
  status: Task['status'],
  candidate: string | null | undefined,
): string | null {
  if (sourceType !== 'multi_day' || (status !== 'completed' && status !== 'archived')) {
    return null;
  }

  const date = candidate ?? task.taskDate;
  if (date < task.taskDate) return task.taskDate;
  if (task.endDate && date > task.endDate) return task.endDate;
  return date;
}

function normalizeImportedProgressEntry(entry: TaskProgressEntry): TaskProgressEntry {
  return entry.status === 'archived'
    ? { ...entry, status: 'completed', archivedAt: null }
    : entry;
}

function normalizeImportedSettings(settings: AppSettings): AppSettings {
  const normalized = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as AppSettingKey[]) {
    if (settings[key] !== undefined) {
      normalized[key] = settings[key] as never;
    }
  }
  return normalized;
}

function routineAsSyncable(routine: Routine): Routine & { status?: string } {
  return {
    ...routine,
    status: routine.deletedAt ? 'deleted' : undefined,
  };
}

function normalizeImportedPostponement(postponement: TaskPostponement): TaskPostponement {
  return {
    ...postponement,
    deletedAt: postponement.deletedAt ?? null,
  };
}

export type { AppSettings, Task, Routine, TaskProgressEntry, TaskPostponement };
