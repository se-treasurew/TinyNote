import { RoutineRepository } from '../repositories/routineRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { TaskRepository } from '../repositories/taskRepository';
import type { AppSettings } from '../types/settings';
import type { Routine } from '../types/routine';
import type { Task, TaskProgressEntry } from '../types/task';
import { chooseMergedRecord, createExportPayload, type TinyNoteExport, type TinyNoteImport } from './syncService';
import { writeSyncLog } from './syncLogService';

const taskRepository = new TaskRepository();
const routineRepository = new RoutineRepository();
const settingsRepository = new SettingsRepository();

export const dataPortabilityService = {
  async exportData(): Promise<TinyNoteExport> {
    const [tasks, routines, routineInstances, taskProgressEntries, settings] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
      routineRepository.listInstances(),
      taskRepository.listAllProgressEntries(),
      settingsRepository.load(),
    ]);

    return createExportPayload({
      tasks,
      routines,
      routineInstances,
      taskProgressEntries,
      settings,
    });
  },

  async importData(payload: TinyNoteImport): Promise<void> {
    assertPayload(payload);

    const [localTasks, localRoutines, localProgressEntries] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
      taskRepository.listAllProgressEntries(),
    ]);
    const localTaskMap = new Map(localTasks.map((task) => [task.id, task]));
    const localRoutineMap = new Map(localRoutines.map((routine) => [routine.id, routine]));
    const localProgressMap = new Map(localProgressEntries.map((entry) => [entry.id, entry]));

    for (const incoming of payload.tasks) {
      const local = localTaskMap.get(incoming.id);
      const normalized = normalizeImportedTask(incoming);
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
        const merged = local ? chooseMergedRecord(local, incoming) : incoming;
        await taskRepository.upsertProgressEntry(merged);
        await writeSyncLog({ entityType: 'task_progress', entityId: merged.id, operation: 'import', payload: merged });
      }
    }

    await settingsRepository.setMany(payload.settings);
  },
};

function assertPayload(payload: TinyNoteImport): void {
  if (
    !payload ||
    (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) ||
    !Array.isArray(payload.tasks) ||
    !Array.isArray(payload.routines)
  ) {
    throw new Error('Invalid TinyNote export file');
  }
}

function normalizeImportedTask(task: Task): Task {
  const sourceType = String(task.sourceType);
  return {
    ...task,
    endDate: task.endDate ?? null,
    sourceType: sourceType === 'routine_daily' ? 'daily' : task.sourceType,
  } as Task;
}

function routineAsSyncable(routine: Routine): Routine & { status?: string } {
  return {
    ...routine,
    status: routine.deletedAt ? 'deleted' : undefined,
  };
}

export type { AppSettings, Task, Routine, TaskProgressEntry };
