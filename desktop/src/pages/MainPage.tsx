import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { ArchivePanel } from '../components/ArchivePanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { TaskManagePanel } from '../components/TaskManagePanel';
import { ConfirmContext } from '../components/ConfirmDialog';
import { TaskItem } from '../components/TaskItem';
import { TitleBar } from '../components/TitleBar';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { todayIsoDate } from '../utils/date';
import { useUiStore } from '../stores/uiStore';
import { isBatchPostponeEligibleTask } from '../services/taskScheduling';

export function MainPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const confirm = useContext(ConfirmContext);
  const settings = useSettingsStore((state) => state.settings);
  const tasks = useTaskStore((state) => state.tasks);
  const tasksByDate = useTaskStore((state) => state.tasksByDate);
  const visibleDates = useTaskStore((state) => state.visibleDates);
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const navigateDate = useTaskStore((state) => state.navigateDate);
  const goToToday = useTaskStore((state) => state.goToToday);
  const addTask = useTaskStore((state) => state.addTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const postponeTasksForDate = useTaskStore((state) => state.postponeTasksForDate);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const isArchiveOpen = useUiStore((state) => state.isArchiveOpen);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const isTaskManageOpen = useUiStore((state) => state.isTaskManageOpen);
  const selectedTasks = tasksByDate[selectedDate] ?? [];
  const activeTasks = selectedTasks.filter((task) => task.status === 'active');
  const doneTasks = selectedTasks.filter((task) => task.status === 'completed' || task.status === 'archived');
  const canPostponeSelectedDate = activeTasks.some((task) => isBatchPostponeEligibleTask(task, selectedDate));

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

  async function clearCompletedTasks() {
    if (doneTasks.length === 0) {
      return;
    }
    const ok = await confirm?.({
      title: '清空已完成',
      message: `将删除 ${doneTasks.length} 个已完成/归档任务，确定吗？`,
      confirmLabel: '清空',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      for (const task of doneTasks) {
        await deleteTask(task.id);
      }
    } catch (error) {
      console.error('Failed to clear completed tasks', error);
      await loadTasks(settings.visibleDays);
    }
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
          {activeTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
          {activeTasks.length === 0 && <p className="empty-copy">暂无待办</p>}
        </div>
        {doneTasks.length > 0 && (
          <section className="completed-section" aria-label="已完成任务">
            <header>
              <span>已完成</span>
              <strong>{doneTasks.length}</strong>
            </header>
            <div className="task-list completed-list" role="list">
              {doneTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
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
        <button
          type="button"
          className="bottom-action clear"
          disabled={doneTasks.length === 0}
          onClick={() => void clearCompletedTasks()}
        >
          <Trash2 size={18} />
          <span>清空已完成</span>
        </button>
      </section>
      {isArchiveOpen && <ArchivePanel />}
      {isSettingsOpen && <SettingsPanel />}
      {isTaskManageOpen && <TaskManagePanel />}
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
