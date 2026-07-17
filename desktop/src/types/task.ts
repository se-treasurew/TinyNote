export type TaskStatus = 'active' | 'completed' | 'archived' | 'deleted';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high';
export type TaskSourceType = 'manual' | 'daily' | 'multi_day';
export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflicted';

export interface Task {
  id: string;
  userId: string | null;
  deviceId: string | null;
  title: string;
  content: string | null;
  taskDate: string;
  endDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  sourceType: TaskSourceType;
  routineId: string | null;
  parentTaskId: string | null;
  sortOrder: number;
  completedAt: string | null;
  completedOnDate: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  postponedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  version: number;
}

export interface TaskOccurrence extends Task {
  definitionTaskDate: string;
  occurrenceDate: string;
  progressPercent: number;
  progressEntryId: string | null;
  postponementId: string | null;
  postponedFromDate: string | null;
  postponedToDate: string | null;
  postponementHistory: TaskPostponement[];
}

export interface TaskProgressEntry {
  id: string;
  taskId: string;
  progressDate: string;
  percent: number;
  status: TaskStatus;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  version: number;
}

export interface TaskPostponement {
  id: string;
  taskId: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  version: number;
}

export type TaskDraft = Omit<Task, 'id'> & {
  id?: string;
};

export interface CreateTaskInput {
  title: string;
  content?: string | null;
  taskDate: string;
  endDate?: string | null;
  sourceType?: TaskSourceType;
  routineId?: string | null;
  parentTaskId?: string | null;
  sortOrder?: number;
}

export interface UpdateTaskInput {
  title?: string;
  content?: string | null;
  taskDate?: string;
  endDate?: string | null;
  sourceType?: TaskSourceType;
  postponedAt?: string | null;
  sortOrder?: number;
}

export type TasksByDate = Record<string, TaskOccurrence[]>;

export interface TaskRow {
  id: string;
  user_id: string | null;
  device_id: string | null;
  title: string;
  content: string | null;
  task_date: string;
  end_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source_type: TaskSourceType;
  routine_id: string | null;
  parent_task_id: string | null;
  sort_order: number;
  completed_at: string | null;
  completed_on_date: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  postponed_at: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
  version: number;
}

export interface TaskProgressEntryRow {
  id: string;
  task_id: string;
  progress_date: string;
  percent: number;
  status: TaskStatus;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
  version: number;
}

export interface TaskPostponementRow {
  id: string;
  task_id: string;
  from_date: string;
  to_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
  version: number;
}
