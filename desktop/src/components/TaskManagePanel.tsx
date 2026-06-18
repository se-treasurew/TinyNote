import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';
import { taskService } from '../services/taskService';
import type { Task, TaskSourceType } from '../types/task';
import { todayIsoDate } from '../utils/date';

export function TaskManagePanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const addTask = useTaskStore((state) => state.addTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const [mode, setMode] = useState<TaskSourceType>('daily');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState(todayIsoDate());
  const [newEndDate, setNewEndDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const modeCopy = getTaskModeCopy(mode);

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

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    setIsCreating(true);
    try {
      await addTask({
        title,
        taskDate: newStartDate,
        sourceType: mode,
        endDate: newEndDate || null,
      });
      setNewTitle('');
      setNewStartDate(todayIsoDate());
      setNewEndDate('');
      setIsAdding(false);
      await refresh();
      await loadTasks();
    } finally {
      setIsCreating(false);
    }
  }

  function cancelAdd() {
    setNewTitle('');
    setNewStartDate(todayIsoDate());
    setNewEndDate('');
    setIsAdding(false);
    setIsCreating(false);
  }

  return (
    <aside className="panel task-manage-panel">
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
          onClick={() => { setMode('daily'); setEditingId(null); cancelAdd(); }}
        >
          每日
        </button>
        <button
          type="button"
          className={mode === 'multi_day' ? 'active' : ''}
          onClick={() => { setMode('multi_day'); setEditingId(null); cancelAdd(); }}
        >
          多日
        </button>
      </div>
      {isAdding ? (
        <div className="panel-form panel-form-card">
          <div className="panel-form-title">
            <h2>{modeCopy.newLabel}</h2>
            <span>{modeCopy.formHint}</span>
          </div>
          <label className="field-label">
            <span>任务名称</span>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') cancelAdd();
              }}
              placeholder="任务名称"
            />
          </label>
          <div className="date-pair">
            <label className="field-label">
              <span>开始日期</span>
              <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
            </label>
            <label className="field-label">
              <span>{modeCopy.endDateLabel}</span>
              <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
            </label>
          </div>
          <div className="panel-form-actions">
            <button type="button" disabled={isCreating || !newTitle.trim()} onClick={() => void handleCreate()}>
              {isCreating ? '创建中...' : modeCopy.createLabel}
            </button>
            <button type="button" className="ghost" onClick={cancelAdd}>取消</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost-row-button" aria-label={modeCopy.newLabel} onClick={() => setIsAdding(true)}>
          <Plus size={15} />
          <span>{modeCopy.newLabel}</span>
        </button>
      )}
      <div className="panel-list">
        {filtered.map((task) => (
          <div className={`routine-row ${editingId === task.id ? 'editing' : ''}`} key={task.id}>
            {editingId === task.id ? (
              <div className="panel-form panel-edit-form">
                <label className="field-label">
                  <span>任务名称</span>
                  <input
                    aria-label="编辑任务标题"
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="任务名称"
                  />
                </label>
                <div className="date-pair">
                  <label className="field-label">
                    <span>开始日期</span>
                    <input
                      aria-label="编辑开始日期"
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>{modeCopy.endDateLabel}</span>
                    <input
                      aria-label="编辑结束日期"
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </label>
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
        {filtered.length === 0 && (
          <div className="panel-empty-state">
            <p>{modeCopy.emptyText}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function getTaskModeCopy(mode: TaskSourceType) {
  if (mode === 'multi_day') {
    return {
      newLabel: '新建多日任务',
      createLabel: '创建多日任务',
      endDateLabel: '结束日期',
      formHint: '适合一段时间内持续推进的任务',
      emptyText: '还没有多日任务，先创建一个需要连续推进的事项',
    };
  }

  return {
    newLabel: '新建每日任务',
    createLabel: '创建每日任务',
    endDateLabel: '结束日期（可选）',
    formHint: '适合每天都会出现的小事项',
    emptyText: '还没有每日任务，先创建一个每天都会出现的小事项',
  };
}
