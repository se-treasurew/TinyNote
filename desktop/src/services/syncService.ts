import type { AppSettings } from '../types/settings';
import type { Routine, RoutineInstance } from '../types/routine';
import type { Task, TaskPostponement, TaskProgressEntry } from '../types/task';

export interface SyncableRecord {
  id: string;
  status?: string;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TinyNoteExport {
  schemaVersion: 3;
  exportedAt: string;
  tasks: Task[];
  routines: Routine[];
  routineInstances: RoutineInstance[];
  taskProgressEntries: TaskProgressEntry[];
  taskPostponements: TaskPostponement[];
  settings: AppSettings;
}

export interface TinyNoteExportV2 {
  schemaVersion: 2;
  exportedAt: string;
  tasks: Task[];
  routines: Routine[];
  routineInstances: RoutineInstance[];
  taskProgressEntries: TaskProgressEntry[];
  settings: AppSettings;
}

export interface TinyNoteExportV1 {
  schemaVersion: 1;
  exportedAt: string;
  tasks: Task[];
  routines: Routine[];
  routineInstances: RoutineInstance[];
  settings: AppSettings;
}

export type TinyNoteImport = TinyNoteExport | TinyNoteExportV2 | TinyNoteExportV1;

export function chooseMergedRecord<T extends SyncableRecord>(local: T, incoming: T): T {
  if (isDeleted(local) && !isDeleted(incoming)) {
    return local;
  }

  if (isDeleted(incoming) && !isDeleted(local)) {
    return incoming;
  }

  if (incoming.version !== local.version) {
    return incoming.version > local.version ? incoming : local;
  }

  return incoming.updatedAt > local.updatedAt ? incoming : local;
}

export function createExportPayload(input: {
  tasks: Task[];
  routines: Routine[];
  routineInstances: RoutineInstance[];
  taskProgressEntries: TaskProgressEntry[];
  taskPostponements: TaskPostponement[];
  settings: AppSettings;
  now?: string;
}): TinyNoteExport {
  return {
    schemaVersion: 3,
    exportedAt: input.now ?? new Date().toISOString(),
    tasks: input.tasks,
    routines: input.routines,
    routineInstances: input.routineInstances,
    taskProgressEntries: input.taskProgressEntries,
    taskPostponements: input.taskPostponements,
    settings: input.settings,
  };
}

function isDeleted(record: SyncableRecord): boolean {
  return record.deletedAt !== null || record.status === 'deleted';
}
