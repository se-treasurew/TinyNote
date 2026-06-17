import { TaskRepository } from '../repositories/taskRepository';
import type { CreateTaskInput, Task, TaskDraft, UpdateTaskInput } from '../types/task';
import { getVisibleDateRange } from '../utils/date';
import { getDeviceId, createId } from '../utils/id';
import { normalizeTitle } from '../utils/format';
import { applyArchive, applyComplete, applyDelete, applyRestore, groupActiveTasksByDate } from './taskWorkflow';
import { writeSyncLog } from './syncLogService';

const taskRepository = new TaskRepository();

export class TaskService {
  async loadVisibleTasks(startDate: string, visibleDays: number): Promise<Task[]> {
    const dates = getVisibleDateRange(startDate, visibleDays);
    const endDate = dates[dates.length - 1] ?? startDate;
    return taskRepository.listByDateRange(startDate, endDate);
  }

  async loadArchive(): Promise<Task[]> {
    return taskRepository.listArchive();
  }

  async loadAll(): Promise<Task[]> {
    return taskRepository.listAll();
  }

  async addTask(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task = createTask({
      title: normalizeTitle(input.title),
      content: input.content ?? null,
      taskDate: input.taskDate,
      sourceType: input.sourceType ?? 'manual',
      routineId: input.routineId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
      now,
    });

    await taskRepository.insert(task);
    await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    return task;
  }

  async insertGeneratedTasks(drafts: TaskDraft[]): Promise<Task[]> {
    const tasks = drafts.map((draft) => ({
      ...draft,
      id: draft.id ?? createId('task'),
    }));

    await taskRepository.insertMany(tasks);
    for (const task of tasks) {
      await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    }
    return tasks;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const updated: Task = {
      ...task,
      title: input.title === undefined ? task.title : normalizeTitle(input.title),
      content: input.content === undefined ? task.content : input.content,
      taskDate: input.taskDate ?? task.taskDate,
      sortOrder: input.sortOrder ?? task.sortOrder,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };

    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return updated;
  }

  async completeTask(id: string, completeToArchive: boolean): Promise<Task> {
    const task = await this.requireTask(id);
    const updated = applyComplete(task, completeToArchive, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return updated;
  }

  async archiveTask(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    const updated = applyArchive(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return updated;
  }

  async restoreTask(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    const updated = applyRestore(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return updated;
  }

  async deleteTask(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    const updated = applyDelete(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'delete', payload: updated });
    return updated;
  }

  groupActiveTasks(tasks: Task[]) {
    return groupActiveTasksByDate(tasks);
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await taskRepository.findById(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    return task;
  }
}

export const taskService = new TaskService();

function createTask(input: {
  title: string;
  content: string | null;
  taskDate: string;
  sourceType: Task['sourceType'];
  routineId: string | null;
  parentTaskId: string | null;
  sortOrder: number;
  now: string;
}): Task {
  return {
    id: createId('task'),
    userId: null,
    deviceId: getDeviceId(),
    title: input.title,
    content: input.content,
    taskDate: input.taskDate,
    status: 'active',
    priority: 'none',
    sourceType: input.sourceType,
    routineId: input.routineId,
    parentTaskId: input.parentTaskId,
    sortOrder: input.sortOrder,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    syncStatus: 'local',
    version: 1,
  };
}
