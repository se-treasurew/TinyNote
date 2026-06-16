import { RoutineRepository } from '../repositories/routineRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { TaskRepository } from '../repositories/taskRepository';
import type { AppSettings } from '../types/settings';
import type { Routine } from '../types/routine';
import type { Task } from '../types/task';
import { chooseMergedRecord, createExportPayload, type TinyNoteExport } from './syncService';
import { writeSyncLog } from './syncLogService';

const taskRepository = new TaskRepository();
const routineRepository = new RoutineRepository();
const settingsRepository = new SettingsRepository();

export const dataPortabilityService = {
  async exportData(): Promise<TinyNoteExport> {
    const [tasks, routines, routineInstances, settings] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
      routineRepository.listInstances(),
      settingsRepository.load(),
    ]);

    return createExportPayload({
      tasks,
      routines,
      routineInstances,
      settings,
    });
  },

  async importData(payload: TinyNoteExport): Promise<void> {
    assertPayload(payload);

    const [localTasks, localRoutines] = await Promise.all([
      taskRepository.listAll(),
      routineRepository.listRoutines(true),
    ]);
    const localTaskMap = new Map(localTasks.map((task) => [task.id, task]));
    const localRoutineMap = new Map(localRoutines.map((routine) => [routine.id, routine]));

    for (const incoming of payload.tasks) {
      const local = localTaskMap.get(incoming.id);
      const merged = local ? chooseMergedRecord(local, incoming) : incoming;
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

    await settingsRepository.setMany(payload.settings);
  },
};

function assertPayload(payload: TinyNoteExport): void {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.tasks) || !Array.isArray(payload.routines)) {
    throw new Error('Invalid TinyNote export file');
  }
}

function routineAsSyncable(routine: Routine): Routine & { status?: string } {
  return {
    ...routine,
    status: routine.deletedAt ? 'deleted' : undefined,
  };
}

export type { AppSettings, Task, Routine };
