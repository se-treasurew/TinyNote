import { Archive, CalendarDays, Check, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TaskOccurrence } from '../types/task';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';

interface TaskItemProps {
  task: TaskOccurrence;
}

export function TaskItem({ task }: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.taskDate);
  const [progress, setProgress] = useState(task.progressPercent);
  const settings = useSettingsStore((state) => state.settings);
  const completeTask = useTaskStore((state) => state.completeTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const updateTaskProgress = useTaskStore((state) => state.updateTaskProgress);
  const archiveTask = useTaskStore((state) => state.archiveTask);
  const restoreTask = useTaskStore((state) => state.restoreTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const isDone = task.status === 'completed' || task.status === 'archived';

  useEffect(() => {
    setTitle(task.title);
    setDate(task.taskDate);
    setProgress(task.progressPercent);
  }, [task.id, task.taskDate, task.progressPercent, task.title]);

  async function saveTitle() {
    const next = title.trim();
    setIsEditing(false);
    if (next && next !== task.title) {
      await updateTask(task.id, { title: next });
    }
  }

  async function saveDate(nextDate: string) {
    setDate(nextDate);
    if (nextDate !== task.taskDate) {
      await updateTask(task.id, { taskDate: nextDate });
    }
  }

  async function saveProgress(nextProgress: number) {
    setProgress(nextProgress);
    await updateTaskProgress(task.id, task.taskDate, nextProgress);
  }

  async function toggleCompleted() {
    if (isDone) {
      await restoreTask(task.id);
      return;
    }

    await completeTask(task.id, settings.completeToArchive);
  }

  return (
    <div className={`task-item ${isDone ? 'completed' : ''}`} role="listitem">
      <button
        type="button"
        className={`check-button ${isDone ? 'completed' : ''}`}
        aria-label={`${isDone ? '恢复任务' : '完成任务'}：${task.title}`}
        onClick={() => void toggleCompleted()}
      >
        {isDone && <Check size={13} />}
      </button>
      <div className="task-main">
        {isEditing ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void saveTitle();
              if (event.key === 'Escape') {
                setTitle(task.title);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className="task-title" onClick={() => setIsEditing(true)}>
            {task.title}
          </button>
        )}
        <div className="task-tags">
          {task.sourceType === 'daily' && <span>每日</span>}
          {task.sourceType === 'multi_day' && <span>多日</span>}
          {task.status === 'archived' && <span>归档</span>}
          {task.taskDate < new Date().toISOString().slice(0, 10) && <span>过期</span>}
        </div>
        <div className="task-progress">
          <input
            aria-label={`任务进度：${task.title}`}
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => void saveProgress(Number(event.target.value))}
          />
          <span>{progress}%</span>
        </div>
      </div>
      <details className="task-menu">
        <summary aria-label="更多">
          <MoreHorizontal size={16} />
        </summary>
        <div className="task-menu-popover">
          <label>
            <CalendarDays size={14} />
            <input type="date" value={date} onChange={(event) => void saveDate(event.target.value)} />
          </label>
          {task.status !== 'archived' && (
            <button type="button" onClick={() => void archiveTask(task.id)}>
              <Archive size={14} />
              <span>归档</span>
            </button>
          )}
          <button type="button" onClick={() => void deleteTask(task.id)}>
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      </details>
    </div>
  );
}
