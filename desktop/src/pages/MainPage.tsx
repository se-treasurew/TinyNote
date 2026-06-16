import { useEffect } from 'react';
import { ArchivePanel } from '../components/ArchivePanel';
import { DateSection } from '../components/DateSection';
import { RoutinePanel } from '../components/RoutinePanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { TaskInput } from '../components/TaskInput';
import { TitleBar } from '../components/TitleBar';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

export function MainPage() {
  const settings = useSettingsStore((state) => state.settings);
  const tasksByDate = useTaskStore((state) => state.tasksByDate);
  const visibleDates = useTaskStore((state) => state.visibleDates);
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const addTask = useTaskStore((state) => state.addTask);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const isArchiveOpen = useUiStore((state) => state.isArchiveOpen);
  const isRoutineOpen = useUiStore((state) => state.isRoutineOpen);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);

  useEffect(() => {
    void loadTasks(settings.visibleDays);
  }, [loadTasks, settings.visibleDays]);

  return (
    <main className="app-shell">
      <TitleBar />
      <section className="quick-entry">
        <TaskInput
          selectedDate={selectedDate}
          onSubmit={(title) => addTask({ title, taskDate: selectedDate })}
        />
      </section>
      <section className="date-list" aria-label="任务日期列表">
        {visibleDates.map((date) => (
          <DateSection
            key={date}
            date={date}
            tasks={tasksByDate[date] ?? []}
            selected={selectedDate === date}
            onSelect={() => setSelectedDate(date)}
          />
        ))}
      </section>
      {isArchiveOpen && <ArchivePanel />}
      {isRoutineOpen && <RoutinePanel />}
      {isSettingsOpen && <SettingsPanel />}
    </main>
  );
}
