export type TaskStatus = 'active' | 'completed' | 'archived' | 'deleted';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high';
export type TaskSourceType = 'manual' | 'routine_daily' | 'multi_day';
export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflicted';

export interface Task {
  id: string;
  userId: string | null;
  deviceId: string | null;
  title: string;
  content: string | null;
  taskDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  sourceType: TaskSourceType;
  routineId: string | null;
  parentTaskId: string | null;
  sortOrder: number;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  sourceType?: TaskSourceType;
  routineId?: string | null;
  parentTaskId?: string | null;
  sortOrder?: number;
}

export interface UpdateTaskInput {
  title?: string;
  content?: string | null;
  taskDate?: string;
  sortOrder?: number;
}

export type TasksByDate = Record<string, Task[]>;

export interface TaskRow {
  id: string;
  user_id: string | null;
  device_id: string | null;
  title: string;
  content: string | null;
  task_date: string;
  status: TaskStatus;
  priority: TaskPriority;
  source_type: TaskSourceType;
  routine_id: string | null;
  parent_task_id: string | null;
  sort_order: number;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
  version: number;
}
