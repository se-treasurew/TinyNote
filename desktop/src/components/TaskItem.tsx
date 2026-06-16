import { Archive, CalendarDays, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Task } from '../types/task';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.taskDate);
  const settings = useSettingsStore((state) => state.settings);
  const completeTask = useTaskStore((state) => state.completeTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const archiveTask = useTaskStore((state) => state.archiveTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);

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

  return (
    <div className="task-item">
      <button
        type="button"
        className="check-button"
        aria-label="完成任务"
        onClick={() => void completeTask(task.id, settings.completeToArchive)}
      />
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
          {task.sourceType === 'routine_daily' && <span>routine</span>}
          {task.sourceType === 'multi_day' && <span>多日</span>}
          {task.taskDate < new Date().toISOString().slice(0, 10) && <span>过期</span>}
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
          <button type="button" onClick={() => void archiveTask(task.id)}>
            <Archive size={14} />
            <span>归档</span>
          </button>
          <button type="button" onClick={() => void deleteTask(task.id)}>
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      </details>
    </div>
  );
}
