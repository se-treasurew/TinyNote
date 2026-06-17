import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { TaskOccurrence } from '../types/task';
import { formatShortDate } from '../utils/date';
import { useTaskStore } from '../stores/taskStore';
import { TaskItem } from './TaskItem';

interface DateSectionProps {
  date: string;
  tasks: TaskOccurrence[];
  selected: boolean;
  onSelect: () => void;
}

export function DateSection({ date, tasks, selected, onSelect }: DateSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const addTask = useTaskStore((state) => state.addTask);
  const hasActiveTasks = tasks.length > 0;

  async function submitInlineTask() {
    if (!title.trim()) return;
    await addTask({ title, taskDate: date });
    setTitle('');
    setIsAdding(false);
  }

  return (
    <article className={`date-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <header className="date-card-header">
        <div>
          <strong>{formatShortDate(date)}</strong>
          <span>{date}</span>
        </div>
        {hasActiveTasks && <span className="red-dot" aria-label="有未完成任务" />}
      </header>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
        {tasks.length === 0 && <p className="empty-copy">今日清爽</p>}
      </div>
      {isAdding ? (
        <form
          className="inline-add"
          onSubmit={(event) => {
            event.preventDefault();
            void submitInlineTask();
          }}
        >
          <input
            autoFocus
            aria-label="日期任务"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          <button type="submit" aria-label="保存">
            <Plus size={15} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="ghost-row-button"
          aria-label="添加日期任务"
          onClick={(event) => {
            event.stopPropagation();
            setIsAdding(true);
            onSelect();
          }}
        >
          <Plus size={15} />
        </button>
      )}
    </article>
  );
}
