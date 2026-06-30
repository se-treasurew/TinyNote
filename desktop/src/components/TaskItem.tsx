import { CalendarClock, CalendarDays, Check, ChevronDown, ChevronRight, Info, MoreHorizontal, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import type { TaskOccurrence, TaskSourceType } from '../types/task';
import { useTaskStore } from '../stores/taskStore';
import { addDays, formatShortDate } from '../utils/date';
import { isPostponeEligibleTask } from '../services/taskScheduling';
import { ConfirmContext } from './ConfirmDialog';

interface SubtaskBadge {
  done: number;
  total: number;
}

interface TaskItemProps {
  task: TaskOccurrence;
  /** 0 = top-level task, 1 = subtask, 2 = grandchild. */
  depth?: number;
  subtaskBadge?: SubtaskBadge;
  hasSubtasks?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onRequestAddSubtask?: () => void;
}

export function TaskItem({
  task,
  depth = 0,
  subtaskBadge,
  hasSubtasks = false,
  isCollapsed = false,
  onToggleCollapse,
  onRequestAddSubtask,
}: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [draftSourceType, setDraftSourceType] = useState<TaskSourceType>(task.sourceType);
  const [draftStartDate, setDraftStartDate] = useState(task.definitionTaskDate);
  const [draftEndDate, setDraftEndDate] = useState(task.endDate ?? addDays(task.definitionTaskDate, 1));
  const [postponeToDate, setPostponeToDate] = useState(addDays(task.occurrenceDate, 1));
  const [progress, setProgress] = useState(task.progressPercent);
  const progressRef = useRef(task.progressPercent);
  const isProgressDirtyRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirm = useContext(ConfirmContext);
  const completeTask = useTaskStore((state) => state.completeTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const updateTaskProgress = useTaskStore((state) => state.updateTaskProgress);
  const postponeTask = useTaskStore((state) => state.postponeTask);
  const clearTaskPostponements = useTaskStore((state) => state.clearTaskPostponements);
  const restoreTask = useTaskStore((state) => state.restoreTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const isDone = task.status === 'completed' || task.status === 'archived';
  const canPostpone = isPostponeEligibleTask(task, task.occurrenceDate) && postponeToDate > task.occurrenceDate;
  const postponeButtonLabel = `确认延期到 ${postponeToDate}`;
  const scheduleEndDate = draftSourceType === 'manual' ? null : draftEndDate;
  const canSaveSchedule =
    Boolean(draftStartDate) &&
    (draftSourceType === 'manual' || Boolean(draftEndDate && draftEndDate >= draftStartDate));
  const canAddSubtask = depth < 2;
  const showProgress = task.status === 'active' && !hasSubtasks;

  useEffect(() => {
    resetDrafts();
    setProgress(task.progressPercent);
    progressRef.current = task.progressPercent;
    isProgressDirtyRef.current = false;
  }, [task.definitionTaskDate, task.endDate, task.id, task.occurrenceDate, task.progressPercent, task.sourceType, task.title]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  function resetDrafts() {
    setTitle(task.title);
    setDraftSourceType(task.sourceType);
    setDraftStartDate(task.definitionTaskDate);
    setDraftEndDate(task.endDate ?? addDays(task.definitionTaskDate, 1));
    setPostponeToDate(addDays(task.occurrenceDate, 1));
  }

  function openMenu() {
    resetDrafts();
    setIsMenuOpen(true);
  }

  function closeMenu() {
    resetDrafts();
    setIsMenuOpen(false);
  }

  function openDetails() {
    resetDrafts();
    setIsMenuOpen(false);
    setIsDetailOpen(true);
  }

  function closeDetails() {
    resetDrafts();
    setIsDetailOpen(false);
  }

  async function saveTitle() {
    const next = title.trim();
    setIsEditing(false);
    if (next && next !== task.title) {
      await updateTask(task.id, { title: next });
    }
  }

  async function saveSchedule() {
    if (!canSaveSchedule) {
      return;
    }

    await updateTask(task.id, {
      sourceType: draftSourceType,
      taskDate: draftStartDate,
      endDate: scheduleEndDate,
    });
    setIsMenuOpen(false);
    setIsDetailOpen(false);
  }

  function updateDraftSourceType(nextSourceType: TaskSourceType) {
    setDraftSourceType(nextSourceType);
    if (nextSourceType !== 'manual' && !draftEndDate) {
      setDraftEndDate(addDays(draftStartDate, 1));
    }
  }

  function changeProgress(nextProgress: number) {
    setProgress(nextProgress);
    progressRef.current = nextProgress;
    isProgressDirtyRef.current = true;
  }

  async function commitProgress() {
    if (!isProgressDirtyRef.current) {
      return;
    }

    const nextProgress = progressRef.current;
    isProgressDirtyRef.current = false;
    if (nextProgress === 100) {
      await completeTask(task.id, task.occurrenceDate);
      return;
    }

    await updateTaskProgress(task.id, task.occurrenceDate, nextProgress);
  }

  async function toggleCompleted() {
    if (isDone) {
      await restoreTask(task.id, task.occurrenceDate);
      return;
    }

    await completeTask(task.id, task.occurrenceDate);
  }

  async function postpone() {
    if (!canPostpone) {
      return;
    }

    await postponeTask(task.id, task.occurrenceDate, postponeToDate, progress);
    setIsMenuOpen(false);
  }

  async function confirmClearPostponements() {
    const ok = await confirm?.({
      title: '取消延期',
      message: '将清除该任务的全部延期标识与历史，但不会恢复截止日期或进度。确定吗？',
      confirmLabel: '取消延期',
      danger: true,
    });
    if (ok) {
      closeMenu();
      await clearTaskPostponements(task.id);
    }
  }

  async function confirmDelete() {
    const ok = await confirm?.({
      title: '删除任务',
      message: `确定要删除「${task.title}」吗？`,
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) {
      closeMenu();
      await deleteTask(task.id);
    }
  }

  return (
    <div
      className={`task-item task-item--depth-${depth} ${isDone ? 'completed' : ''}`}
      role="listitem"
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu();
      }}
    >
      {hasSubtasks ? (
        <button
          type="button"
          className="task-collapse"
          aria-label={isCollapsed ? '展开子任务' : '收起子任务'}
          onClick={() => onToggleCollapse?.()}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      ) : (
        <span className="task-collapse-placeholder" aria-hidden="true" />
      )}
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
          <div className="task-title-row">
            <button type="button" className="task-title" onClick={() => setIsEditing(true)}>
              {task.title}
            </button>
            {subtaskBadge && subtaskBadge.total > 0 && (
              <span className="task-subtask-badge">{subtaskBadge.done}/{subtaskBadge.total}</span>
            )}
          </div>
        )}
        <div className="task-meta">
          <div className="task-tags">
            {task.sourceType === 'manual' && <span className="tag-manual">普通</span>}
            {task.sourceType === 'daily' && <span className="tag-daily">每日</span>}
            {task.sourceType === 'multi_day' && (
              <span className="tag-multi">
                {task.endDate ? `截止 ${formatShortDate(task.endDate)}` : '截止未设置'}
              </span>
            )}
            {task.postponedAt && <span className="tag-postponed">延期</span>}
          </div>
        </div>
      </div>
      {showProgress && (
        <div className="task-progress">
          <input
            aria-label={`任务进度：${task.title}`}
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => changeProgress(Number(event.target.value))}
            onPointerUp={() => void commitProgress()}
            onPointerCancel={() => void commitProgress()}
            onKeyUp={() => void commitProgress()}
            onBlur={() => void commitProgress()}
          />
          <span>{progress}%</span>
        </div>
      )}
      <div className="task-menu" ref={menuRef}>
        <button type="button" aria-label="更多" onClick={() => (isMenuOpen ? closeMenu() : openMenu())}>
          <MoreHorizontal size={16} />
        </button>
        {isMenuOpen && (
          <div className="task-menu-popover">
            {canAddSubtask && onRequestAddSubtask && (
              <button
                type="button"
                onClick={() => {
                  onRequestAddSubtask();
                  closeMenu();
                }}
              >
                <Plus size={14} />
                <span>添加子任务</span>
              </button>
            )}
            {isPostponeEligibleTask(task, task.occurrenceDate) && (
              <>
                <div className="task-menu-postpone-row">
                  <CalendarClock size={14} />
                  <span>延期到</span>
                  <input
                    aria-label="延期日期"
                    type="date"
                    value={postponeToDate}
                    onChange={(event) => setPostponeToDate(event.target.value)}
                  />
                  <button
                    type="button"
                    className="task-menu-icon-button"
                    aria-label={postponeButtonLabel}
                    title={postponeButtonLabel}
                    disabled={!canPostpone}
                    onClick={() => void postpone()}
                  >
                    <Check size={14} />
                  </button>
                </div>
              </>
            )}
            <button type="button" onClick={openDetails}>
              <Info size={14} />
              <span>任务详情</span>
            </button>
            {(task.postponedAt || task.postponementHistory.length > 0) && (
              <button type="button" onClick={() => void confirmClearPostponements()}>
                <Undo2 size={14} />
                <span>取消延期</span>
              </button>
            )}
            <button type="button" onClick={() => { void confirmDelete(); }}>
              <Trash2 size={14} />
              <span>删除</span>
            </button>
          </div>
        )}
      </div>
      {isDetailOpen && (
        <TaskDetailDialog
          task={task}
          draftSourceType={draftSourceType}
          draftStartDate={draftStartDate}
          draftEndDate={draftEndDate}
          canSaveSchedule={canSaveSchedule}
          canEditSchedule={depth === 0}
          onClose={closeDetails}
          onSaveSchedule={() => void saveSchedule()}
          onChangeSourceType={updateDraftSourceType}
          onChangeStartDate={(nextStartDate) => {
            setDraftStartDate(nextStartDate);
            if (draftSourceType !== 'manual' && draftEndDate < nextStartDate) {
              setDraftEndDate(nextStartDate);
            }
          }}
          onChangeEndDate={setDraftEndDate}
        />
      )}
    </div>
  );
}

interface TaskDetailDialogProps {
  task: TaskOccurrence;
  draftSourceType: TaskSourceType;
  draftStartDate: string;
  draftEndDate: string;
  canSaveSchedule: boolean;
  canEditSchedule: boolean;
  onClose: () => void;
  onSaveSchedule: () => void;
  onChangeSourceType: (sourceType: TaskSourceType) => void;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
}

function TaskDetailDialog({
  task,
  draftSourceType,
  draftStartDate,
  draftEndDate,
  canSaveSchedule,
  canEditSchedule,
  onClose,
  onSaveSchedule,
  onChangeSourceType,
  onChangeStartDate,
  onChangeEndDate,
}: TaskDetailDialogProps) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const sortedPostponements = [...task.postponementHistory]
    .filter((postponement) => !postponement.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div
      className="task-detail-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="task-detail-dialog" role="dialog" aria-modal="true" aria-label="任务详情">
        <header className="task-detail-header">
          <strong>任务详情</strong>
          <button type="button" aria-label="关闭任务详情" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="task-detail-body">
          <div className="task-detail-title">
            <strong>{task.title}</strong>
            <span>{formatSourceType(task.sourceType)} · {formatStatus(task.status)}</span>
          </div>
          <div className="task-detail-grid">
            <span>当前日期：{task.occurrenceDate}</span>
            <span>开始：{task.definitionTaskDate}</span>
            <span>截止：{task.endDate ?? '无'}</span>
            <span>创建：{formatDateTime(task.createdAt)}</span>
            <span>更新：{formatDateTime(task.updatedAt)}</span>
            <span>最近延期：{task.postponedAt ? formatDateTime(task.postponedAt) : '无'}</span>
          </div>
          <div className="task-detail-history">
            <strong>延期历史</strong>
            {sortedPostponements.length > 0 ? (
              sortedPostponements.map((postponement) => (
                <span key={postponement.id}>
                  {postponement.fromDate} -&gt; {postponement.toDate} · {formatDateTime(postponement.createdAt)}
                </span>
              ))
            ) : (
              <span>暂无延期记录</span>
            )}
          </div>
          <div className="task-detail-schedule">
            <button
              type="button"
              className="task-detail-toggle"
              disabled={!canEditSchedule}
              title={canEditSchedule ? undefined : '子任务跟随母任务排期，不可单独修改'}
              onClick={() => canEditSchedule && setIsScheduleOpen((current) => !current)}
            >
              <CalendarDays size={14} />
              <span>高级排期</span>
            </button>
            {canEditSchedule && isScheduleOpen && (
              <div className="task-detail-schedule-fields">
                <label className="task-type-field">
                  <span>类型</span>
                  <select
                    aria-label="任务类型"
                    value={draftSourceType}
                    onChange={(event) => onChangeSourceType(event.target.value as TaskSourceType)}
                  >
                    <option value="manual">普通</option>
                    <option value="daily">每日</option>
                    <option value="multi_day">多日</option>
                  </select>
                </label>
                <label>
                  <CalendarDays size={14} />
                  <span>开始</span>
                  <input
                    aria-label="开始日期"
                    type="date"
                    value={draftStartDate}
                    onChange={(event) => onChangeStartDate(event.target.value)}
                  />
                </label>
                {draftSourceType !== 'manual' && (
                  <label>
                    <CalendarDays size={14} />
                    <span>截止</span>
                    <input
                      aria-label="截止日期"
                      type="date"
                      value={draftEndDate}
                      onChange={(event) => onChangeEndDate(event.target.value)}
                    />
                  </label>
                )}
                <div className="task-menu-actions">
                  <button type="button" disabled={!canSaveSchedule} onClick={onSaveSchedule}>
                    <Save size={14} />
                    <span>保存排期</span>
                  </button>
                  <button type="button" className="ghost" onClick={onClose}>
                    <span>取消</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

function formatSourceType(sourceType: TaskSourceType): string {
  if (sourceType === 'daily') return '每日';
  if (sourceType === 'multi_day') return '多日';
  return '普通';
}

function formatStatus(status: TaskOccurrence['status']): string {
  if (status === 'completed') return '已完成';
  if (status === 'archived') return '已完成';
  if (status === 'deleted') return '已删除';
  return '进行中';
}
