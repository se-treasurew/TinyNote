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
    minimizeWindow: vi.fn(async () => undefined),
  },
}));

vi.mock('../services/appUpdateService', () => ({
  appUpdateService: {
    getAboutInfo: vi.fn(async () => ({
      productName: 'TinyNote',
      displayName: '小笺',
      version: '1.0.1',
      githubUrl: 'https://github.com/se-treasurew/TinyNote',
    })),
    openGitHub: vi.fn(async () => undefined),
    checkForUpdate: vi.fn(async () => null),
    installUpdate: vi.fn(async () => undefined),
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
  postponedAt: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
  definitionTaskDate: '2026-06-16',
  occurrenceDate: '2026-06-16',
  progressPercent: 0,
  progressEntryId: null,
  postponementId: null,
  postponedFromDate: null,
  postponedToDate: null,
  postponementHistory: [],
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
      tasksByDate: {
        '2026-06-16': [tasks[0], tasks[1]],
        '2026-06-17': [tasks[2]],
      },
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 7,
      selectedDate: '2026-06-16',
      isLoading: false,
      loadTasks: vi.fn(async () => undefined),
      postponeTasksForDate: vi.fn(async () => undefined),
    });
    useUiStore.setState({
      currentPanel: 'main',
      isSettingsOpen: false,
      isTaskManageOpen: false,
      isAboutOpen: false,
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
    expect(screen.queryByRole('button', { name: '清空已完成' })).not.toBeInTheDocument();
  });

  it('collapses and expands a parent task subtree via the toggle', () => {
    const parent = baseTask({ id: 'parent', title: '母任务' });
    const child = baseTask({ id: 'child', title: '子任务', parentTaskId: 'parent', sortOrder: 1 });
    useTaskStore.setState({
      tasks: [parent, child],
      tasksByDate: { '2026-06-16': [parent, child] },
      selectedDate: '2026-06-16',
    });

    render(<MainPage />);

    // Both parent and child are visible by default.
    expect(screen.getByText('母任务')).toBeInTheDocument();
    expect(screen.getByText('子任务')).toBeInTheDocument();

    // Collapse the parent: the child disappears.
    fireEvent.click(screen.getByLabelText('收起子任务'));
    expect(screen.getByText('母任务')).toBeInTheDocument();
    expect(screen.queryByText('子任务')).not.toBeInTheDocument();

    // Expand again: the child reappears.
    fireEvent.click(screen.getByLabelText('展开子任务'));
    expect(screen.getByText('子任务')).toBeInTheDocument();
  });

  it('shows collapse toggles only on non-leaf tasks and progress bars only on leaf tasks', () => {
    // Three-level tree: parent → child → grandchild. The grandchild is the only leaf.
    const parent = baseTask({ id: 'parent', title: '母任务' });
    const child = baseTask({ id: 'child', title: '子任务', parentTaskId: 'parent', sortOrder: 1 });
    const grandchild = baseTask({
      id: 'grandchild',
      title: '孙任务',
      parentTaskId: 'child',
      sortOrder: 2,
    });
    useTaskStore.setState({
      tasks: [parent, child, grandchild],
      tasksByDate: { '2026-06-16': [parent, child, grandchild] },
      selectedDate: '2026-06-16',
    });

    render(<MainPage />);

    // Parent and child (non-leaf) each get a collapse toggle; grandchild (leaf) does not.
    // Two non-leaf nodes (parent + child) → two collapse buttons.
    expect(screen.getAllByLabelText('收起子任务')).toHaveLength(2);

    // The parent and child rows carry the depth classes; the leaf grandchild is depth-2.
    const parentRow = screen.getByText('母任务').closest('.task-item');
    const childRow = screen.getByText('子任务').closest('.task-item');
    const grandchildRow = screen.getByText('孙任务').closest('.task-item');
    expect(parentRow).not.toHaveClass('task-item--depth-2');
    expect(grandchildRow).toHaveClass('task-item--depth-2');

    // Only the leaf (grandchild) shows a draggable progress slider.
    expect(within(parentRow as HTMLElement).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(childRow as HTMLElement).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(grandchildRow as HTMLElement).getByRole('slider')).toBeInTheDocument();

    // Non-leaf rows show the x/y badge; the leaf does not.
    expect(within(parentRow as HTMLElement).getByText('0/1')).toBeInTheDocument();
    expect(within(childRow as HTMLElement).getByText('0/1')).toBeInTheDocument();
    expect(within(grandchildRow as HTMLElement).queryByText('0/1')).not.toBeInTheDocument();
  });

  it('shows confirm and cancel controls when adding a subtask and clears the draft on cancel', () => {
    const parent = baseTask({ id: 'parent', title: '母任务' });
    useTaskStore.setState({
      tasks: [parent],
      tasksByDate: { '2026-06-16': [parent] },
      selectedDate: '2026-06-16',
    });

    render(<MainPage />);

    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    const subtaskInput = screen.getByLabelText('添加子任务');
    fireEvent.change(subtaskInput, { target: { value: '临时子任务' } });

    expect(screen.getByRole('button', { name: '确认添加子任务' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消添加子任务' }));

    expect(screen.queryByLabelText('添加子任务')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    expect(screen.getByLabelText('添加子任务')).toHaveValue('');
  });

  it('keeps Escape cancel behavior when adding a subtask', () => {
    const parent = baseTask({ id: 'parent', title: '母任务' });
    useTaskStore.setState({
      tasks: [parent],
      tasksByDate: { '2026-06-16': [parent] },
      selectedDate: '2026-06-16',
    });

    render(<MainPage />);

    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    fireEvent.keyDown(screen.getByLabelText('添加子任务'), { key: 'Escape' });

    expect(screen.queryByLabelText('添加子任务')).not.toBeInTheDocument();
  });

  it('cancels subtask adding when switching dates or collapsing the parent', async () => {
    const parent = baseTask({ id: 'parent', title: '母任务' });
    const child = baseTask({ id: 'child', title: '子任务', parentTaskId: 'parent', sortOrder: 1 });
    const tomorrow = baseTask({
      id: 'tomorrow',
      title: '明天任务',
      taskDate: '2026-06-17',
      occurrenceDate: '2026-06-17',
      definitionTaskDate: '2026-06-17',
    });
    useTaskStore.setState({
      tasks: [parent, child, tomorrow],
      tasksByDate: {
        '2026-06-16': [parent, child],
        '2026-06-17': [tomorrow],
      },
      selectedDate: '2026-06-16',
    });

    render(<MainPage />);

    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    expect(screen.getByLabelText('添加子任务')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '周三 06-17' }));
    expect(screen.queryByLabelText('添加子任务')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '周二 06-16' }));
    await waitFor(() => {
      expect(screen.getByText('母任务')).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    expect(screen.getByLabelText('添加子任务')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('收起子任务'));
    expect(screen.queryByLabelText('添加子任务')).not.toBeInTheDocument();
  });

  it('submits a subtask with the current selected date', async () => {
    const addTask = vi.fn(async () => baseTask({ id: 'new-child', parentTaskId: 'parent', title: '新子任务' }));
    const parent = baseTask({ id: 'parent', title: '母任务' });
    useTaskStore.setState({
      tasks: [parent],
      tasksByDate: { '2026-06-16': [parent] },
      selectedDate: '2026-06-16',
      addTask,
    });

    render(<MainPage />);

    fireEvent.contextMenu(screen.getByText('母任务').closest('.task-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '添加子任务' }));
    fireEvent.change(screen.getByLabelText('添加子任务'), { target: { value: '新子任务' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加子任务' }));

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '新子任务',
        parentTaskId: 'parent',
        taskDate: '2026-06-16',
      });
    });
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
      expect(navigateDate).toHaveBeenCalledWith(1, 7);
    });
  });

  it('submits new tasks with the latest selected date from the store', async () => {
    const addTask = vi.fn(async () => baseTask({ id: 'task-new', taskDate: '2026-06-17' }));
    useTaskStore.setState({ addTask, selectedDate: '2026-06-17' });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.change(screen.getByLabelText('快速添加任务'), { target: { value: '快速翻页后新增' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '快速翻页后新增',
        taskDate: '2026-06-17',
        sourceType: 'manual',
        endDate: null,
      });
    });
  });

  it('submits a quick task on Enter key press', async () => {
    const addTask = vi.fn(async () => baseTask({ id: 'task-1' }));
    useTaskStore.setState({ addTask });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.change(screen.getByLabelText('快速添加任务'), { target: { value: '快捷键任务' } });
    fireEvent.keyDown(screen.getByLabelText('快速添加任务'), { key: 'Enter' });

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '快捷键任务',
        taskDate: '2026-06-16',
        sourceType: 'manual',
        endDate: null,
      });
    });
  });

  it('postpones eligible tasks from the bottom bar for the selected date', async () => {
    const postponeTasksForDate = vi.fn(async () => undefined);
    useTaskStore.setState({ postponeTasksForDate });

    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '顺延' }));

    await waitFor(() => {
      expect(postponeTasksForDate).toHaveBeenCalledWith('2026-06-16');
    });
  });

  it('disables bottom postpone when the selected date has no eligible tasks', () => {
    const daily = baseTask({ id: 'daily-only', sourceType: 'daily' });
    useTaskStore.setState({
      tasks: [daily],
      tasksByDate: { '2026-06-16': [daily] },
      postponeTasksForDate: vi.fn(async () => undefined),
    });

    render(<MainPage />);

    expect(screen.getByRole('button', { name: '顺延' })).toBeDisabled();
  });

  it('opens the about panel from the title bar', async () => {
    render(<MainPage />);

    fireEvent.click(screen.getByRole('button', { name: '关于 TinyNote' }));

    expect(await screen.findByRole('complementary', { name: '关于 TinyNote' })).toBeInTheDocument();
    expect(screen.getByText('当前版本 v1.0.1')).toBeInTheDocument();
  });
});
