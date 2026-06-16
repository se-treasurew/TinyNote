import type { SyncStatus } from './task';

export type RoutineType = 'daily' | 'multi_day';
export type RoutineProgressMode = 'daily_instance';

export interface Routine {
  id: string;
  userId: string | null;
  title: string;
  description: string | null;
  routineType: RoutineType;
  startDate: string;
  endDate: string | null;
  repeatRule: string | null;
  activeDays: string | null;
  isEnabled: boolean;
  progressMode: RoutineProgressMode;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  version: number;
}

export interface RoutineInstance {
  id: string;
  routineId: string;
  taskId: string;
  instanceDate: string;
  status: 'generated';
  createdAt: string;
}

export interface CreateDailyRoutineInput {
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface CreateMultiDayRoutineInput {
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
}

export interface RoutineRow {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  routine_type: RoutineType;
  start_date: string;
  end_date: string | null;
  repeat_rule: string | null;
  active_days: string | null;
  is_enabled: number;
  progress_mode: RoutineProgressMode;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
  version: number;
}

export interface RoutineInstanceRow {
  id: string;
  routine_id: string;
  task_id: string;
  instance_date: string;
  status: 'generated';
  created_at: string;
}
