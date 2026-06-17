import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types/task';
import { useTaskStore } from './taskStore';

const mocks = vi.hoisted(() => ({
  loadVisibleTasks: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  generateVisibleRoutineTasks: vi.fn(),
}));

vi.mock('../services/taskService', () => ({
  taskService: {
    loadVisibleTasks: mocks.loadVisibleTasks,
    loadArchive: vi.fn(async () => []),
    addTask: mocks.addTask,
    updateTask: mocks.updateTask,
    completeTask: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

vi.mock('../services/routineService', () => ({
  routineService: {
    generateVisibleRoutineTasks: mocks.generateVisibleRoutineTasks,
  },
}));

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '阅读器PPT',
  content: null,
  taskDate: '2026-06-18',
  status: 'active',
  priority: 'none',
  sourceType: 'manual',
  routineId: null,
  parentTaskId: null,
  sortOrder: 0,
  completedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe('task store date window behavior', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.loadVisibleTasks.mockResolvedValue([]);
    mocks.generateVisibleRoutineTasks.mockResolvedValue([]);
    mocks.addTask.mockResolvedValue(baseTask());
    mocks.updateTask.mockResolvedValue(baseTask());
    useTaskStore.setState({
      tasks: [],
      archiveTasks: [],
      tasksByDate: {},
      visibleDates: ['2026-06-17', '2026-06-18', '2026-06-19'],
      visibleStartDate: '2026-06-17',
      visibleDays: 3,
      selectedDate: '2026-06-18',
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds tasks to the selected date after paging and reloads the current visible window', async () => {
    await useTaskStore.getState().addTask({ title: '翻页后新增', taskDate: '2026-06-18' });

    expect(mocks.addTask).toHaveBeenCalledWith({ title: '翻页后新增', taskDate: '2026-06-18' });
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-17', 3);
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-18');
  });

  it('moves the visible window to the new task date after editing a task outside the current window', async () => {
    mocks.updateTask.mockResolvedValue(baseTask({ id: 'task-1', taskDate: '2026-06-25', title: '移到下周' }));

    await useTaskStore.getState().updateTask('task-1', { taskDate: '2026-06-25' });

    expect(mocks.updateTask).toHaveBeenCalledWith('task-1', { taskDate: '2026-06-25' });
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-25', 3);
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-25');
  });

  it('advances from the latest visible state during rapid right navigation', async () => {
    vi.useFakeTimers();
    useTaskStore.setState({
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
      selectedDate: '2026-06-17',
    });
    mocks.loadVisibleTasks.mockResolvedValue([]);

    await useTaskStore.getState().navigateDate(1, 2);
    const afterFirstClick = useTaskStore.getState();
    await useTaskStore.getState().navigateDate(1, 2);
    const afterSecondClick = useTaskStore.getState();

    expect(afterFirstClick.selectedDate).toBe('2026-06-18');
    expect(afterFirstClick.visibleDates).toContain('2026-06-18');
    expect(afterSecondClick.selectedDate).toBe('2026-06-19');
    expect(afterSecondClick.visibleDates).toContain('2026-06-19');
    expect(mocks.loadVisibleTasks).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(mocks.loadVisibleTasks).toHaveBeenCalledTimes(1);
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-18', 2);
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-19');
    expect(useTaskStore.getState().visibleDates).toContain('2026-06-19');
  });

  it('keeps the newest navigation result when an older load finishes later', async () => {
    useTaskStore.setState({
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
      selectedDate: '2026-06-17',
    });
    const olderLoad = deferred<Task[]>();
    const newerLoad = deferred<Task[]>();
    const olderTask = baseTask({ id: 'older-task', taskDate: '2026-06-18', title: '旧窗口任务' });
    const newerTask = baseTask({ id: 'newer-task', taskDate: '2026-06-19', title: '新窗口任务' });
    mocks.loadVisibleTasks.mockImplementationOnce(() => olderLoad.promise);
    mocks.loadVisibleTasks.mockImplementationOnce(() => newerLoad.promise);

    const olderNavigation = useTaskStore.getState().loadTasks(2, '2026-06-17', '2026-06-18');
    const newerNavigation = useTaskStore.getState().loadTasks(2, '2026-06-18', '2026-06-19');
    newerLoad.resolve([newerTask]);
    olderLoad.resolve([olderTask]);
    await Promise.all([olderNavigation, newerNavigation]);

    expect(useTaskStore.getState().selectedDate).toBe('2026-06-19');
    expect(useTaskStore.getState().visibleDates).toEqual(['2026-06-18', '2026-06-19']);
    expect(useTaskStore.getState().tasks).toEqual([newerTask]);
    expect(useTaskStore.getState().tasksByDate['2026-06-19']).toEqual([newerTask]);
  });

  it('does not leave loading stuck when navigation invalidates an in-flight load', async () => {
    vi.useFakeTimers();
    useTaskStore.setState({
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
      selectedDate: '2026-06-17',
      isLoading: false,
    });
    const staleLoad = deferred<Task[]>();
    mocks.loadVisibleTasks.mockImplementationOnce(() => staleLoad.promise);

    const staleRefresh = useTaskStore.getState().loadTasks(2, '2026-06-16', '2026-06-17');
    expect(useTaskStore.getState().isLoading).toBe(true);

    await useTaskStore.getState().navigateDate(1, 2);
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-18');
    expect(useTaskStore.getState().visibleDates).toContain('2026-06-18');
    expect(useTaskStore.getState().isLoading).toBe(false);

    staleLoad.resolve([]);
    await staleRefresh;
    expect(useTaskStore.getState().isLoading).toBe(false);

    await vi.runOnlyPendingTimersAsync();
    expect(useTaskStore.getState().isLoading).toBe(false);
  });

  it('adds tasks to the date reached by rapid navigation', async () => {
    vi.useFakeTimers();
    useTaskStore.setState({
      visibleDates: ['2026-06-16', '2026-06-17'],
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
      selectedDate: '2026-06-17',
    });
    mocks.loadVisibleTasks.mockResolvedValue([]);

    await useTaskStore.getState().navigateDate(1, 2);
    await useTaskStore.getState().navigateDate(1, 2);
    await useTaskStore.getState().addTask({
      title: '快速翻页后新增',
      taskDate: useTaskStore.getState().selectedDate,
    });

    expect(mocks.addTask).toHaveBeenCalledWith({
      title: '快速翻页后新增',
      taskDate: '2026-06-19',
    });
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-19');
    expect(useTaskStore.getState().visibleDates).toContain('2026-06-19');

    const callsAfterAdd = mocks.loadVisibleTasks.mock.calls.length;
    await vi.runOnlyPendingTimersAsync();
    expect(mocks.loadVisibleTasks).toHaveBeenCalledTimes(callsAfterAdd);
  });
});
