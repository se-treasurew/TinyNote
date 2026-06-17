import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface TaskInputProps {
  selectedDate: string;
  onSubmit: (title: string) => Promise<void> | void;
}

export function TaskInput({ selectedDate, onSubmit }: TaskInputProps) {
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setIsSaving(true);
    try {
      await onSubmit(value);
      setTitle('');
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
        placeholder={`${selectedDate} 添加一件小事`}
      />
      <button type="submit" aria-label="添加" disabled={isSaving || !title.trim()}>
        <Plus size={17} />
      </button>
    </form>
  );
}
