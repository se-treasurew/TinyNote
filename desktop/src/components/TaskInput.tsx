import { Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { TaskSourceType } from '../types/task';

export interface TaskInputValue {
  title: string;
  sourceType: TaskSourceType;
  taskDate: string;
  endDate: string | null;
  progressPercent: number;
}

interface TaskInputProps {
  selectedDate: string;
  onSubmit: (value: TaskInputValue) => Promise<void> | void;
}

export function TaskInput({ selectedDate, onSubmit }: TaskInputProps) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<TaskSourceType>('manual');
  const [taskDate, setTaskDate] = useState(selectedDate);
  const [endDate, setEndDate] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTaskDate(selectedDate);
  }, [selectedDate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setIsSaving(true);
    try {
      await onSubmit({
        title: value,
        sourceType,
        taskDate,
        endDate: sourceType === 'manual' ? null : endDate || null,
        progressPercent: clampProgress(progressPercent),
      });
      setTitle('');
      setProgressPercent(0);
    } catch (error) {
      console.error('Failed to add task', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="task-input" onSubmit={(event) => void handleSubmit(event)}>
      <input
        aria-label="添加任务"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={`${taskDate || selectedDate} 添加一件小事`}
      />
      <label className="task-input-field compact">
        <span>类型</span>
        <select
          aria-label="任务类型"
          value={sourceType}
          onChange={(event) => {
            const next = event.target.value as TaskSourceType;
            setSourceType(next);
            if (next === 'manual') {
              setEndDate('');
            }
          }}
        >
          <option value="manual">普通</option>
          <option value="daily">每日</option>
          <option value="multi_day">多日</option>
        </select>
      </label>
      <label className="task-input-field date">
        <span>开始</span>
        <input aria-label="开始日期" type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} />
      </label>
      {sourceType !== 'manual' && (
        <label className="task-input-field date">
          <span>结束</span>
          <input aria-label="结束日期" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      )}
      <label className="task-input-field progress">
        <span>进度</span>
        <input
          aria-label="初始进度"
          type="number"
          min="0"
          max="100"
          value={progressPercent}
          onChange={(event) => setProgressPercent(clampProgress(Number(event.target.value)))}
        />
      </label>
      <button type="submit" aria-label="添加" disabled={isSaving || !title.trim()}>
        <Plus size={17} />
      </button>
    </form>
  );
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
