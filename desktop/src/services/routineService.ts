import { RoutineRepository } from '../repositories/routineRepository';
import type { CreateDailyRoutineInput, CreateMultiDayRoutineInput, Routine } from '../types/routine';
import type { Task } from '../types/task';
import { createId, getDeviceId } from '../utils/id';
import { normalizeTitle } from '../utils/format';
import { buildDailyRoutineInstances, buildMultiDayTaskDrafts } from './routineLogic';
import { writeSyncLog } from './syncLogService';

const routineRepository = new RoutineRepository();

export class RoutineService {
  async loadRoutines(): Promise<Routine[]> {
    return routineRepository.listRoutines();
  }

  async createDailyRoutine(input: CreateDailyRoutineInput): Promise<Routine> {
    const now = new Date().toISOString();
    const routine = createRoutine({
      title: input.title,
      description: input.description ?? null,
      routineType: 'daily',
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      repeatRule: 'daily',
      now,
    });

    await routineRepository.insertRoutine(routine);
    await writeSyncLog({ entityType: 'routine', entityId: routine.id, operation: 'create', payload: routine });
    return routine;
  }

  async createMultiDayRoutine(input: CreateMultiDayRoutineInput): Promise<{ routine: Routine; tasks: Task[] }> {
    const now = new Date().toISOString();
    const routine = createRoutine({
      title: input.title,
      description: input.description ?? null,
      routineType: 'multi_day',
      startDate: input.startDate,
      endDate: input.endDate,
      repeatRule: null,
      now,
    });

    await routineRepository.insertRoutine(routine);
    await writeSyncLog({ entityType: 'routine', entityId: routine.id, operation: 'create', payload: routine });

    const drafts = buildMultiDayTaskDrafts({
      title: routine.title,
      content: routine.description,
      startDate: routine.startDate,
      endDate: routine.endDate ?? routine.startDate,
      routineId: routine.id,
      deviceId: getDeviceId(),
      now,
    });
    const tasks = drafts.map((draft) => ({ ...draft, id: draft.id ?? createId('task') }));
    const insertedTasks = await routineRepository.createTasksWithInstances(tasks);
    for (const task of insertedTasks) {
      await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    }
    return { routine, tasks: insertedTasks };
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<Routine> {
    const routines = await routineRepository.listRoutines(true);
    // Exclude soft-deleted routines so enabling cannot revive one that was deleted.
    const routine = routines.find((item) => item.id === id && !item.deletedAt);
    if (!routine) {
      throw new Error(`Routine not found: ${id}`);
    }

    const now = new Date().toISOString();
    const updated: Routine = {
      ...routine,
      isEnabled,
      updatedAt: now,
      syncStatus: 'pending',
      version: routine.version + 1,
    };
    await routineRepository.saveRoutine(updated);
    await writeSyncLog({ entityType: 'routine', entityId: updated.id, operation: 'update', payload: updated });
    return updated;
  }

  async deleteRoutine(id: string): Promise<Routine> {
    const routines = await routineRepository.listRoutines(true);
    const routine = routines.find((item) => item.id === id);
    if (!routine) {
      throw new Error(`Routine not found: ${id}`);
    }

    const now = new Date().toISOString();
    const updated: Routine = {
      ...routine,
      isEnabled: false,
      deletedAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      version: routine.version + 1,
    };
    await routineRepository.saveRoutine(updated);
    await writeSyncLog({ entityType: 'routine', entityId: updated.id, operation: 'delete', payload: updated });
    return updated;
  }

  async generateVisibleRoutineTasks(visibleDates: string[], existingTasks: Task[]): Promise<Task[]> {
    const routines = await routineRepository.listEnabledDailyRoutines();
    const drafts = buildDailyRoutineInstances({
      routines,
      visibleDates,
      existingTasks,
      now: new Date().toISOString(),
      deviceId: getDeviceId(),
    });

    if (drafts.length === 0) {
      return [];
    }

    const tasks = drafts.map((draft) => ({ ...draft, id: draft.id ?? createId('task') }));
    const insertedTasks = await routineRepository.createTasksWithInstances(tasks, { priority: 'background' });
    for (const task of insertedTasks) {
      await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    }
    return insertedTasks;
  }
}

export const routineService = new RoutineService();

function createRoutine(input: {
  title: string;
  description: string | null;
  routineType: Routine['routineType'];
  startDate: string;
  endDate: string | null;
  repeatRule: string | null;
  now: string;
}): Routine {
  return {
    id: createId('routine'),
    userId: null,
    title: normalizeTitle(input.title),
    description: input.description,
    routineType: input.routineType,
    startDate: input.startDate,
    endDate: input.endDate,
    repeatRule: input.repeatRule,
    activeDays: null,
    isEnabled: true,
    progressMode: 'daily_instance',
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncStatus: 'local',
    version: 1,
  };
}
