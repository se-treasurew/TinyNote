import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { AboutPanel } from '../components/AboutPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { TaskManagePanel } from '../components/TaskManagePanel';
import { TaskItem } from '../components/TaskItem';
import { TitleBar } from '../components/TitleBar';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { todayIsoDate } from '../utils/date';
import { useUiStore } from '../stores/uiStore';
import { isBatchPostponeEligibleTask } from '../services/taskScheduling';
import { groupTasksWithSubtasks, subtaskBadge } from '../services/taskWorkflow';

export function MainPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const settings = useSettingsStore((state) => state.settings);
  const tasks = useTaskStore((state) => state.tasks);
  const tasksByDate = useTaskStore((state) => state.tasksByDate);
  const visibleDates = useTaskStore((state) => state.visibleDates);
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const navigateDate = useTaskStore((state) => state.navigateDate);
  const goToToday = useTaskStore((state) => state.goToToday);
  const addTask = useTaskStore((state) => state.addTask);
  const postponeTasksForDate = useTaskStore((state) => state.postponeTasksForDate);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const isTaskManageOpen = useUiStore((state) => state.isTaskManageOpen);
  const isAboutOpen = useUiStore((state) => state.isAboutOpen);
  const selectedTasks = tasksByDate[selectedDate] ?? [];
  const trees = useMemo(() => groupTasksWithSubtasks(selectedTasks), [selectedTasks]);
  const activeTrees = trees.filter((tree) => tree.task.status === 'active');
  const doneTrees = trees.filter(
    (tree) => tree.task.status === 'completed' || tree.task.status === 'archived',
  );
  const canPostponeSelectedDate = activeTrees.some((tree) => isBatchPostponeEligibleTask(tree.task, selectedDate));

  const activeCountByDate = useMemo(() => {
    return tasks.reduce<Record<string, number>>((counts, task) => {
      if (task.status === 'active') {
        counts[task.taskDate] = (counts[task.taskDate] ?? 0) + 1;
      }
      return counts;
    }, {});
  }, [tasks]);

  const dateStripRef = useRef<HTMLDivElement>(null);
  const todayIso = todayIsoDate();

  useEffect(() => {
    void loadTasks(settings.visibleDays);
  }, [loadTasks, settings.visibleDays]);

  // Auto-scroll the selected date tab into view
  useEffect(() => {
    const container = dateStripRef.current;
    if (!container) return;
    const tab = container.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`);
    if (tab && typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedDate]);

  async function selectAdjacentDate(direction: -1 | 1) {
    await navigateDate(direction, settings.visibleDays);
    setIsAdding(false);
  }

  async function submitQuickTask() {
    const title = quickTitle.trim();
    if (!title) return;
    await addTask({
      title,
      taskDate: selectedDate,
      sourceType: 'manual',
      endDate: null,
    });
    setQuickTitle('');
    setIsAdding(false);
  }

  function cancelAdding() {
    setQuickTitle('');
    setIsAdding(false);
  }

  function startAddSubtask(parentId: string) {
    setAddingSubtaskParentId(parentId);
    setSubtaskTitle('');
  }

  function cancelAddSubtask() {
    setAddingSubtaskParentId(null);
    setSubtaskTitle('');
  }

  async function submitSubtask(parentId: string) {
    const title = subtaskTitle.trim();
    if (!title) {
      cancelAddSubtask();
      return;
    }
    // sourceType/taskDate/endDate are inherited from the parent server-side.
    await addTask({ title, parentTaskId: parentId, taskDate: selectedDate });
    cancelAddSubtask();
  }

  return (
    <main className="app-shell">
      <TitleBar />
      <section className="date-strip-wrap">
        <button
          type="button"
          className="date-arrow"
          aria-label="上一个日期"
          disabled={visibleDates.length === 0}
          onClick={() => void selectAdjacentDate(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="date-strip" ref={dateStripRef} role="tablist" aria-label="日期">
          {visibleDates.map((date) => (
            <button
              key={date}
              type="button"
              role="tab"
              data-date={date}
              className={`date-tab ${selectedDate === date ? 'selected' : ''} ${date === todayIso ? 'is-today' : ''}`}
              aria-label={`${formatWeekdayLabel(date)} ${formatMonthDay(date)}`}
              aria-selected={selectedDate === date}
              onClick={() => {
                setSelectedDate(date);
                setIsAdding(false);
              }}
            >
              <span>{formatWeekdayLabel(date)}</span>
              <strong>{formatMonthDay(date)}</strong>
              {(activeCountByDate[date] ?? 0) > 0 && <i aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="date-arrow"
          aria-label="下一个日期"
          disabled={visibleDates.length === 0}
          onClick={() => void selectAdjacentDate(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className={`date-today ${selectedDate === todayIsoDate() ? 'is-today' : ''}`}
          aria-label="回到今天"
          onClick={() => void goToToday(settings.visibleDays)}
        >
          今天
        </button>
      </section>
      <section className="task-board" aria-label={`${selectedDate} 任务`}>
        <div className="task-list active-list" role="list" aria-label="未完成任务">
          {activeTrees.map((tree) => (
            <div className="task-tree" key={tree.task.id}>
              <TaskItem
                task={tree.task}
                subtaskBadge={tree.subtasks.length > 0 ? subtaskBadge(tree.subtasks) : undefined}
                onRequestAddSubtask={() => startAddSubtask(tree.task.id)}
              />
              {tree.subtasks.map((subtask) => (
                <TaskItem key={subtask.id} task={subtask} isSubtask />
              ))}
              {addingSubtaskParentId === tree.task.id && (
                <input
                  className="subtask-add-input"
                  autoFocus
                  aria-label="添加子任务"
                  value={subtaskTitle}
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitSubtask(tree.task.id);
                    if (event.key === 'Escape') cancelAddSubtask();
                  }}
                  placeholder="添加子任务"
                />
              )}
            </div>
          ))}
          {activeTrees.length === 0 && <p className="empty-copy">暂无待办</p>}
        </div>
        {doneTrees.length > 0 && (
          <section className="completed-section" aria-label="已完成任务">
            <header>
              <span>已完成</span>
              <strong>{doneTrees.length}</strong>
            </header>
            <div className="task-list completed-list" role="list">
              {doneTrees.map((tree) => (
                <div className="task-tree" key={tree.task.id}>
                  <TaskItem
                    task={tree.task}
                    subtaskBadge={tree.subtasks.length > 0 ? subtaskBadge(tree.subtasks) : undefined}
                    onRequestAddSubtask={() => startAddSubtask(tree.task.id)}
                  />
                  {tree.subtasks.map((subtask) => (
                    <TaskItem key={subtask.id} task={subtask} isSubtask />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
      <section className={`bottom-bar ${isAdding ? 'editing' : ''}`}>
        {isAdding ? (
          <>
            <input
              className="quick-add-input"
              autoFocus
              aria-label="快速添加任务"
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitQuickTask();
                if (event.key === 'Escape') cancelAdding();
              }}
              placeholder={`${selectedDate} 添加一件小事`}
            />
            <button type="button" className="bottom-action confirm" aria-label="确认添加" onClick={() => void submitQuickTask()}>
              <Plus size={18} />
            </button>
            <button type="button" className="bottom-action cancel" aria-label="取消" onClick={cancelAdding}>
              <X size={18} />
            </button>
          </>
        ) : (
          <button type="button" className="bottom-action add" onClick={() => setIsAdding(true)}>
            <Plus size={20} />
            <span>添加</span>
          </button>
        )}
        <button
          type="button"
          className="bottom-action postpone"
          disabled={!canPostponeSelectedDate}
          onClick={() => void postponeTasksForDate(selectedDate)}
        >
          <CalendarClock size={18} />
          <span>顺延</span>
        </button>
      </section>
      {isSettingsOpen && <SettingsPanel />}
      {isTaskManageOpen && <TaskManagePanel />}
      {isAboutOpen && <AboutPanel />}
    </main>
  );
}

function formatMonthDay(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  return `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatWeekdayLabel(isoDate: string): string {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[parseIsoDate(isoDate).getUTCDay()];
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
