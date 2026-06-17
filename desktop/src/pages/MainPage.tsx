import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { ArchivePanel } from '../components/ArchivePanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { TaskInput, type TaskInputValue } from '../components/TaskInput';
import { TaskItem } from '../components/TaskItem';
import { TitleBar } from '../components/TitleBar';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

export function MainPage() {
  const [isAdding, setIsAdding] = useState(false);
  const settings = useSettingsStore((state) => state.settings);
  const tasks = useTaskStore((state) => state.tasks);
  const tasksByDate = useTaskStore((state) => state.tasksByDate);
  const visibleDates = useTaskStore((state) => state.visibleDates);
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const navigateDate = useTaskStore((state) => state.navigateDate);
  const addTask = useTaskStore((state) => state.addTask);
  const updateTaskProgress = useTaskStore((state) => state.updateTaskProgress);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const isArchiveOpen = useUiStore((state) => state.isArchiveOpen);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const selectedTasks = tasksByDate[selectedDate] ?? [];
  const activeTasks = selectedTasks.filter((task) => task.status === 'active');
  const doneTasks = selectedTasks.filter((task) => task.status === 'completed' || task.status === 'archived');

  const activeCountByDate = useMemo(() => {
    return tasks.reduce<Record<string, number>>((counts, task) => {
      if (task.status === 'active') {
        counts[task.taskDate] = (counts[task.taskDate] ?? 0) + 1;
      }
      return counts;
    }, {});
  }, [tasks]);

  useEffect(() => {
    void loadTasks(settings.visibleDays, undefined, undefined, settings.carryProgressForward);
  }, [loadTasks, settings.visibleDays, settings.carryProgressForward]);

  async function selectAdjacentDate(direction: -1 | 1) {
    await navigateDate(direction, settings.visibleDays, settings.carryProgressForward);
    setIsAdding(false);
  }

  async function submitTask(value: TaskInputValue) {
    const task = await addTask({
      title: value.title,
      taskDate: value.taskDate || useTaskStore.getState().selectedDate,
      sourceType: value.sourceType,
      endDate: value.endDate,
    });
    if (value.progressPercent > 0) {
      await updateTaskProgress(task.id, value.taskDate || useTaskStore.getState().selectedDate, value.progressPercent);
    }
    setIsAdding(false);
  }

  async function clearCompletedTasks() {
    for (const task of doneTasks) {
      await deleteTask(task.id);
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
        <div className="date-strip" role="tablist" aria-label="日期">
          {visibleDates.map((date) => (
            <button
              key={date}
              type="button"
              role="tab"
              className={`date-tab ${selectedDate === date ? 'selected' : ''}`}
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
      </section>
      <section className="task-board" aria-label={`${selectedDate} 任务`}>
        <div className="task-list active-list" role="list" aria-label="未完成任务">
          {activeTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
          {activeTasks.length === 0 && doneTasks.length === 0 && <p className="empty-copy">今日清爽</p>}
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
          <TaskInput selectedDate={selectedDate} onSubmit={(value) => void submitTask(value)} />
        ) : (
          <button type="button" className="bottom-action add" onClick={() => setIsAdding(true)}>
            <Plus size={20} />
            <span>添加</span>
          </button>
        )}
        <button
          type="button"
          className="bottom-action clear"
          disabled={doneTasks.length === 0}
          onClick={() => void clearCompletedTasks()}
        >
          <Trash2 size={18} />
          <span>清空</span>
        </button>
      </section>
      {isArchiveOpen && <ArchivePanel />}
      {isSettingsOpen && <SettingsPanel />}
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
