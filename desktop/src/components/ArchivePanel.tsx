import { RotateCcw, Trash2, X } from 'lucide-react';
import { useContext, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { ConfirmContext } from './ConfirmDialog';

export function ArchivePanel() {
  const archiveTasks = useTaskStore((state) => state.archiveTasks);
  const loadArchive = useTaskStore((state) => state.loadArchive);
  const restoreTask = useTaskStore((state) => state.restoreTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const closePanel = useUiStore((state) => state.closePanel);
  const confirm = useContext(ConfirmContext);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  async function handleDelete(id: string, title: string) {
    const ok = await confirm?.({
      title: '永久删除',
      message: `归档任务「${title}」将被永久删除，无法恢复。确定吗？`,
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) {
      await deleteTask(id);
    }
  }

  return (
    <aside className="panel">
      <header className="panel-header">
        <strong>归档</strong>
        <button type="button" aria-label="关闭" onClick={closePanel}>
          <X size={16} />
        </button>
      </header>
      <div className="panel-list">
        {archiveTasks.map((task) => (
          <div className="archive-row" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.taskDate}</span>
            </div>
            <button type="button" aria-label="恢复" onClick={() => void restoreTask(task.id)}>
              <RotateCcw size={15} />
            </button>
            <button type="button" aria-label="删除" onClick={() => void handleDelete(task.id, task.title)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {archiveTasks.length === 0 && <p className="empty-copy">还没有归档</p>}
      </div>
    </aside>
  );
}
