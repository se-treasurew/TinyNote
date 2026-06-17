import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPage } from './MainPage';
import { defaultSettings } from '../types/settings';
import type { TaskOccurrence } from '../types/task';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

vi.mock('../services/windowService', () => ({
  windowService: {
    startDragIfUnlocked: vi.fn(),
    applySettings: vi.fn(),
    readAutostart: vi.fn(async () => false),
    resetWindowBounds: vi.fn(),
  },
}));

const baseTask = (overrides: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '阅读器PPT',
  content: null,
  taskDate: '2026-06-16',
  endDate: null,
  status: 'active',
  priority: 'none',
  sourceType: 'manual',
  routineId: null,
  parentTaskId: null,
  sortOrder: 0,
  completedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
  definitionTaskDate: '2026-06-16',
  occurrenceDate: '2026-06-16',
  progressPercent: 0,
  progressEntryId: null,
  ...overrides,
});

describe('MainPage display layout', () => {
  beforeEach(() => {
    const tasks = [
      baseTask({ id: 'today-active', title: '阅读器PPT', status: 'active' }),
      baseTask({
        id: 'today-completed',
        title: '已完成整理',
        status: 'completed',
        completedAt: '2026-06-16T01:00:00.000Z',
        sortOrder: 1,
      }),
      baseTask({ id: 'tomorrow-active', title: '明天任务', taskDate: '2026-06-17' }),
    ];

    useSettingsStore.setState({
      settings: { ...defaultSettings, visibleDays: 7 },
      isLoading: false,
    });
    useTaskStore.setState({
      tasks,
      archiveTasks: [],
      tasksByDate: {
        '2026-06-16': [tasks[0], tasks[1]],
        '2026-06-17': [tasks[2]],
      },
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 7,
      carryProgressForward: false,
      selectedDate: '2026-06-16',
      isLoading: false,
      loadTasks: vi.fn(async () => undefined),
    });
    useUiStore.setState({
      currentPanel: 'main',
      isArchiveOpen: false,
      isSettingsOpen: false,
    });
  });

  it('renders a date tab strip and only lists tasks for the selected date', () => {
    render(<MainPage />);

    expect(screen.getByRole('tablist', { name: '日期' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '周二 06-16' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '周三 06-17' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('阅读器PPT')).toBeInTheDocument();
    expect(screen.queryByText('明天任务')).not.toBeInTheDocument();
  });

  it('keeps completed tasks visible with a distinct completed row', () => {
    render(<MainPage />);

    const completedSection = screen.getByRole('region', { name: '已完成任务' });
    const completedTitle = within(completedSection).getByText('已完成整理');
    expect(completedTitle.closest('.task-item')).toHaveClass('completed');
    expect(screen.getByRole('button', { name: '恢复任务：已完成整理' })).toBeInTheDocument();
  });

  it('loads the next date window when the next arrow reaches the visible edge', async () => {
    const navigateDate = vi.fn(async () => undefined);

    useTaskStore.setState({
      selectedDate: '2026-06-17',
      navigateDate,
    });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '下一个日期' }));

    await waitFor(() => {
      expect(navigateDate).toHaveBeenCalledWith(1, 7, false);
    });
  });

  it('submits new tasks with the latest selected date from the store', async () => {
    const addTask = vi.fn(async () => baseTask({ id: 'task-new', taskDate: '2026-06-17' }));
    const updateTaskProgress = vi.fn(async () => undefined);
    useTaskStore.setState({ addTask, updateTaskProgress, selectedDate: '2026-06-17' });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.change(screen.getByLabelText('添加任务'), { target: { value: '快速翻页后新增' } });
    fireEvent.submit(screen.getByLabelText('添加任务').closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '快速翻页后新增',
        taskDate: '2026-06-17',
        sourceType: 'manual',
        endDate: null,
      });
    });
  });

  it('submits multi-day tasks with progress from the expanded input', async () => {
    const addTask = vi.fn(async () => baseTask({ id: 'task-1' }));
    const updateTaskProgress = vi.fn(async () => undefined);
    useTaskStore.setState({ addTask, updateTaskProgress });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.change(screen.getByLabelText('添加任务'), { target: { value: '准备论文' } });
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: 'multi_day' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-06-20' } });
    fireEvent.change(screen.getByLabelText('初始进度'), { target: { value: '30' } });
    fireEvent.submit(screen.getByLabelText('添加任务').closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '准备论文',
        taskDate: '2026-06-16',
        sourceType: 'multi_day',
        endDate: '2026-06-20',
      });
      expect(updateTaskProgress).toHaveBeenCalledWith('task-1', '2026-06-16', 30);
    });
  });
});
