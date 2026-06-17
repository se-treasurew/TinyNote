import { Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';
import { taskService } from '../services/taskService';
import type { Task, TaskSourceType } from '../types/task';

export function TaskManagePanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const [mode, setMode] = useState<TaskSourceType>('daily');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  async function refresh() {
    const all = await taskService.loadAll();
    setTasks(all.filter((t) => t.sourceType !== 'manual' && t.status !== 'deleted'));
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => tasks.filter((t) => t.sourceType === mode), [tasks, mode]);

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditStartDate(task.taskDate);
    setEditEndDate(task.endDate ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    const title = editTitle.trim();
    if (!title) return;
    await updateTask(editingId, {
      title,
      taskDate: editStartDate,
      endDate: editEndDate || null,
    });
    setEditingId(null);
    await refresh();
    await loadTasks();
  }

  async function handleDelete(id: string) {
    await deleteTask(id);
    await refresh();
  }

  return (
    <aside className="panel">
      <header className="panel-header">
        <strong>任务管理</strong>
        <button type="button" aria-label="关闭" onClick={closePanel}>
          <X size={16} />
        </button>
      </header>
      <div className="segmented">
        <button
          type="button"
          className={mode === 'daily' ? 'active' : ''}
          onClick={() => { setMode('daily'); setEditingId(null); }}
        >
          每日
        </button>
        <button
          type="button"
          className={mode === 'multi_day' ? 'active' : ''}
          onClick={() => { setMode('multi_day'); setEditingId(null); }}
        >
          多日
        </button>
      </div>
      <div className="panel-list">
        {filtered.map((task) => (
          <div className="routine-row" key={task.id}>
            {editingId === task.id ? (
              <div className="panel-form">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="标题" />
                <div className="date-pair">
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
                  <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
                </div>
                <div className="panel-form-actions">
                  <button type="button" onClick={() => void saveEdit()}>保存</button>
                  <button type="button" className="ghost" onClick={cancelEdit}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {task.taskDate}{task.endDate ? ` - ${task.endDate}` : ''}
                    {task.status !== 'active' && ` · ${task.status === 'completed' ? '已完成' : '已归档'}`}
                  </span>
                </div>
                <button type="button" aria-label="编辑" onClick={() => startEdit(task)}>
                  <Pencil size={15} />
                </button>
                <button type="button" aria-label="删除" onClick={() => void handleDelete(task.id)}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="empty-copy">{mode === 'daily' ? '还没有每日任务' : '还没有多日任务'}</p>}
      </div>
    </aside>
  );
}
