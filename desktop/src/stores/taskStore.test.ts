import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskOccurrence, TaskPostponement } from '../types/task';
import { useTaskStore } from './taskStore';

const mocks = vi.hoisted(() => ({
  loadVisibleTasks: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskProgress: vi.fn(),
  postponeTask: vi.fn(),
  clearTaskPostponements: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('../services/taskService', () => ({
  taskService: {
    loadVisibleTasks: mocks.loadVisibleTasks,
    addTask: mocks.addTask,
    updateTask: mocks.updateTask,
    updateTaskProgress: mocks.updateTaskProgress,
    postponeTask: mocks.postponeTask,
    clearTaskPostponements: mocks.clearTaskPostponements,
    completeTask: mocks.completeTask,
    restoreTask: vi.fn(),
    deleteTask: mocks.deleteTask,
  },
}));

const baseTask = (overrides: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '阅读器PPT',
  content: null,
  taskDate: '2026-06-18',
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
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
  definitionTaskDate: '2026-06-18',
  occurrenceDate: '2026-06-18',
  progressPercent: 0,
  progressEntryId: null,
  postponementId: null,
  postponedFromDate: null,
  postponedToDate: null,
  postponementHistory: [],
  ...overrides,
});

const taskPostponement = (overrides: Partial<TaskPostponement> = {}): TaskPostponement => ({
  id: 'postpone-1',
  taskId: 'task-1',
  fromDate: '2026-06-18',
  toDate: '2026-06-20',
  createdAt: '2026-06-18T01:00:00.000Z',
  updatedAt: '2026-06-18T01:00:00.000Z',
  deletedAt: null,
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
    mocks.addTask.mockResolvedValue(baseTask());
    mocks.updateTask.mockResolvedValue(baseTask());
    mocks.updateTaskProgress.mockResolvedValue(baseTask({ progressPercent: 60 }));
    mocks.postponeTask.mockResolvedValue(baseTask({
      taskDate: '2026-06-19',
      postponedAt: '2026-06-18T01:00:00.000Z',
      postponedFromDate: '2026-06-18',
      postponedToDate: '2026-06-19',
    }));
    mocks.clearTaskPostponements.mockResolvedValue(baseTask({ postponedAt: null, postponementHistory: [] }));
    mocks.completeTask.mockResolvedValue(baseTask({ status: 'completed' }));
    mocks.deleteTask.mockResolvedValue(baseTask({ status: 'deleted', deletedAt: '2026-06-18T01:00:00.000Z' }));
    useTaskStore.setState({
      tasks: [],
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
    expect(mocks.loadVisibleTasks).not.toHaveBeenCalled();
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-18');
    expect(useTaskStore.getState().tasksByDate['2026-06-18']?.[0]?.title).toBe('阅读器PPT');
  });

  it('moves the visible window to the new task date after editing a task outside the current window', async () => {
    mocks.updateTask.mockResolvedValue(baseTask({ id: 'task-1', taskDate: '2026-06-25', title: '移到下周' }));

    await useTaskStore.getState().updateTask('task-1', { taskDate: '2026-06-25' });

    expect(mocks.updateTask).toHaveBeenCalledWith('task-1', { taskDate: '2026-06-25' });
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-25', 3);
    expect(useTaskStore.getState().selectedDate).toBe('2026-06-25');
  });

  it('reloads the visible window after schedule edits so multi-day occurrences refresh', async () => {
    useTaskStore.setState({ tasks: [baseTask()], tasksByDate: { '2026-06-18': [baseTask()] } });
    const nextOccurrences = [
      baseTask({ sourceType: 'multi_day', taskDate: '2026-06-18', endDate: '2026-06-20' }),
      baseTask({
        sourceType: 'multi_day',
        taskDate: '2026-06-19',
        endDate: '2026-06-20',
        definitionTaskDate: '2026-06-18',
        occurrenceDate: '2026-06-19',
      }),
    ];
    mocks.updateTask.mockResolvedValue(nextOccurrences[0]);
    mocks.loadVisibleTasks.mockResolvedValue(nextOccurrences);

    await useTaskStore.getState().updateTask('task-1', {
      sourceType: 'multi_day',
      taskDate: '2026-06-18',
      endDate: '2026-06-20',
    });

    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-17', 3);
    expect(useTaskStore.getState().tasksByDate['2026-06-19']?.[0]?.sourceType).toBe('multi_day');
  });

  it('syncs task definition edits across all visible occurrences without changing per-date state', async () => {
    const history = [taskPostponement({ toDate: '2026-06-21' })];
    const firstOccurrence = baseTask({
      id: 'task-1',
      title: '旧标题',
      sourceType: 'multi_day',
      taskDate: '2026-06-18',
      definitionTaskDate: '2026-06-18',
      occurrenceDate: '2026-06-18',
      endDate: '2026-06-20',
      progressPercent: 25,
      status: 'active',
      progressEntryId: 'progress-18',
    });
    const secondOccurrence = baseTask({
      id: 'task-1',
      title: '旧标题',
      sourceType: 'multi_day',
      taskDate: '2026-06-19',
      definitionTaskDate: '2026-06-18',
      occurrenceDate: '2026-06-19',
      endDate: '2026-06-20',
      progressPercent: 75,
      status: 'completed',
      progressEntryId: 'progress-19',
    });
    mocks.updateTask.mockResolvedValue(baseTask({
      ...firstOccurrence,
      title: '新标题',
      updatedAt: '2026-06-18T02:00:00.000Z',
      syncStatus: 'pending',
      version: 2,
      postponementHistory: history,
    }));
    useTaskStore.setState({
      tasks: [firstOccurrence, secondOccurrence],
      tasksByDate: {
        '2026-06-18': [firstOccurrence],
        '2026-06-19': [secondOccurrence],
      },
      visibleDates: ['2026-06-18', '2026-06-19', '2026-06-20'],
      visibleStartDate: '2026-06-18',
      selectedDate: '2026-06-18',
    });

    await useTaskStore.getState().updateTask('task-1', { title: '新标题' });

    const updatedFirst = useTaskStore.getState().tasksByDate['2026-06-18']?.[0];
    const updatedSecond = useTaskStore.getState().tasksByDate['2026-06-19']?.[0];
    expect(mocks.loadVisibleTasks).not.toHaveBeenCalled();
    expect(updatedFirst?.title).toBe('新标题');
    expect(updatedSecond?.title).toBe('新标题');
    expect(updatedFirst?.progressPercent).toBe(25);
    expect(updatedSecond?.progressPercent).toBe(75);
    expect(updatedFirst?.status).toBe('active');
    expect(updatedSecond?.status).toBe('completed');
    expect(updatedFirst?.occurrenceDate).toBe('2026-06-18');
    expect(updatedSecond?.occurrenceDate).toBe('2026-06-19');
    expect(updatedFirst?.progressEntryId).toBe('progress-18');
    expect(updatedSecond?.progressEntryId).toBe('progress-19');
    expect(updatedFirst?.postponementHistory).toEqual(history);
    expect(updatedSecond?.postponementHistory).toEqual(history);
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
    const olderLoad = deferred<TaskOccurrence[]>();
    const newerLoad = deferred<TaskOccurrence[]>();
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
    const staleLoad = deferred<TaskOccurrence[]>();
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

  it('does not leave loading stuck when a task operation invalidates an in-flight load', async () => {
    const staleLoad = deferred<TaskOccurrence[]>();
    mocks.loadVisibleTasks.mockImplementationOnce(() => staleLoad.promise);
    const task = baseTask({ id: 'task-1', taskDate: '2026-06-18', status: 'active' });
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-18': [task] },
      selectedDate: '2026-06-18',
      isLoading: false,
    });

    const staleRefresh = useTaskStore.getState().loadTasks(3, '2026-06-17', '2026-06-18');
    expect(useTaskStore.getState().isLoading).toBe(true);

    await useTaskStore.getState().completeTask('task-1');
    expect(useTaskStore.getState().isLoading).toBe(false);

    staleLoad.resolve([]);
    await staleRefresh;
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

  it('loads visible tasks without automatic carry-forward', async () => {
    vi.useFakeTimers();
    mocks.loadVisibleTasks.mockResolvedValue([]);
    useTaskStore.setState({
      tasks: [],
      tasksByDate: {},
      visibleDates: ['2026-06-17', '2026-06-18'],
      visibleStartDate: '2026-06-17',
      visibleDays: 2,
      selectedDate: '2026-06-18',
      isLoading: false,
    });

    await useTaskStore.getState().loadTasks(2, '2026-06-17', '2026-06-18');

    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-17', 2);
  });

  it('passes the occurrence date when completing a recurring task', async () => {
    const task = baseTask({ id: 'daily-1', sourceType: 'daily', taskDate: '2026-06-18' });
    mocks.completeTask.mockResolvedValue(baseTask({
      id: 'daily-1',
      sourceType: 'daily',
      taskDate: '2026-06-18',
      status: 'completed',
    }));
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-18': [task] },
      selectedDate: '2026-06-18',
    });

    await useTaskStore.getState().completeTask('daily-1');

    expect(mocks.completeTask).toHaveBeenCalledWith('daily-1', '2026-06-18');
    expect(useTaskStore.getState().tasksByDate['2026-06-18']?.[0]?.status).toBe('completed');
  });

  it('keeps postponement history after completing a postponed task', async () => {
    const history = [taskPostponement()];
    const task = baseTask({
      id: 'task-1',
      taskDate: '2026-06-20',
      occurrenceDate: '2026-06-20',
      postponedAt: '2026-06-18T01:00:00.000Z',
      postponedFromDate: '2026-06-18',
      postponedToDate: '2026-06-20',
      postponementHistory: history,
    });
    mocks.completeTask.mockResolvedValue(baseTask({
      ...task,
      status: 'completed',
      progressPercent: 100,
      postponementHistory: history,
    }));
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-20': [task] },
      selectedDate: '2026-06-20',
      visibleDates: ['2026-06-20'],
      visibleStartDate: '2026-06-20',
    });

    await useTaskStore.getState().completeTask('task-1');

    const updated = useTaskStore.getState().tasksByDate['2026-06-20']?.[0];
    expect(updated?.status).toBe('completed');
    expect(updated?.postponementHistory).toEqual(history);
  });

  it('updates task progress in the current occurrence', async () => {
    const task = baseTask({
      id: 'task-1',
      taskDate: '2026-06-18',
      occurrenceDate: '2026-06-19',
      progressPercent: 10,
    });
    mocks.updateTaskProgress.mockResolvedValue(baseTask({
      id: 'task-1',
      taskDate: '2026-06-19',
      occurrenceDate: '2026-06-19',
      progressPercent: 70,
    }));
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-19': [task] },
      selectedDate: '2026-06-19',
    });

    await useTaskStore.getState().updateTaskProgress('task-1', '2026-06-19', 70);

    expect(mocks.updateTaskProgress).toHaveBeenCalledWith('task-1', '2026-06-19', 70);
    expect(useTaskStore.getState().tasksByDate['2026-06-19']?.[0]?.progressPercent).toBe(70);
  });

  it('passes visible progress when postponing a single occurrence', async () => {
    const task = baseTask({ id: 'task-1', taskDate: '2026-06-18', progressPercent: 35 });
    mocks.loadVisibleTasks.mockResolvedValue([]);
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-18': [task] },
      selectedDate: '2026-06-18',
    });

    await useTaskStore.getState().postponeTask('task-1', '2026-06-18', '2026-06-20', 35);

    expect(mocks.postponeTask).toHaveBeenCalledWith('task-1', '2026-06-18', '2026-06-20', 35);
  });

  it('clears postponement history and refreshes the visible window once', async () => {
    const task = baseTask({
      postponedAt: '2026-06-18T01:00:00.000Z',
      postponementHistory: [taskPostponement()],
    });
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { '2026-06-18': [task] },
    });
    mocks.loadVisibleTasks.mockResolvedValue([]);

    await useTaskStore.getState().clearTaskPostponements('task-1');

    expect(mocks.clearTaskPostponements).toHaveBeenCalledWith('task-1');
    expect(mocks.loadVisibleTasks).toHaveBeenCalledTimes(1);
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-17', 3);
  });

  it('postpones all eligible active tasks for the selected date and refreshes once', async () => {
    const manual = baseTask({ id: 'manual-1', sourceType: 'manual', taskDate: '2026-06-18', progressPercent: 25 });
    const dueMulti = baseTask({
      id: 'multi-due',
      sourceType: 'multi_day',
      taskDate: '2026-06-18',
      definitionTaskDate: '2026-06-16',
      occurrenceDate: '2026-06-18',
      endDate: '2026-06-18',
      progressPercent: 60,
    });
    const futureMulti = baseTask({
      id: 'multi-future',
      sourceType: 'multi_day',
      taskDate: '2026-06-18',
      definitionTaskDate: '2026-06-16',
      occurrenceDate: '2026-06-18',
      endDate: '2026-06-20',
    });
    const daily = baseTask({ id: 'daily-1', sourceType: 'daily', taskDate: '2026-06-18' });
    mocks.loadVisibleTasks.mockResolvedValue([]);
    useTaskStore.setState({
      tasks: [manual, dueMulti, futureMulti, daily],
      tasksByDate: { '2026-06-18': [manual, dueMulti, futureMulti, daily] },
      selectedDate: '2026-06-18',
    });

    await useTaskStore.getState().postponeTasksForDate('2026-06-18');

    expect(mocks.postponeTask).toHaveBeenCalledTimes(2);
    expect(mocks.postponeTask).toHaveBeenNthCalledWith(1, 'manual-1', '2026-06-18', '2026-06-19', 25);
    expect(mocks.postponeTask).toHaveBeenNthCalledWith(2, 'multi-due', '2026-06-18', '2026-06-19', 60);
    expect(mocks.loadVisibleTasks).toHaveBeenCalledWith('2026-06-17', 3);
  });

  it('shows a completed task immediately after rapid navigation', async () => {
    vi.useFakeTimers();
    useTaskStore.setState({
      tasks: [],
      tasksByDate: {},
      visibleDates: ['2026-06-17', '2026-06-18'],
      visibleStartDate: '2026-06-17',
      visibleDays: 2,
      selectedDate: '2026-06-18',
      isLoading: false,
    });

    for (let index = 0; index < 20; index++) {
      await useTaskStore.getState().navigateDate(1, 2);
    }
    await vi.runOnlyPendingTimersAsync();

    const selectedAfterNavigation = useTaskStore.getState().selectedDate;
    const task = baseTask({ id: 'task-1', taskDate: selectedAfterNavigation, status: 'active' });
    mocks.completeTask.mockResolvedValue(baseTask({
      id: 'task-1',
      taskDate: selectedAfterNavigation,
      status: 'completed',
    }));
    mocks.loadVisibleTasks.mockResolvedValue([task]);
    useTaskStore.setState({
      tasks: [task],
      tasksByDate: { [selectedAfterNavigation]: [task] },
    });
    const completion = useTaskStore.getState().completeTask('task-1');

    const taskAfterClick = useTaskStore.getState().tasks.find((item) => item.id === 'task-1');
    expect(taskAfterClick?.status).toBe('completed');
    expect(useTaskStore.getState().tasksByDate[selectedAfterNavigation]?.[0]?.status).toBe('completed');

    await completion;
    await vi.runOnlyPendingTimersAsync();

    expect(useTaskStore.getState().tasks.find((item) => item.id === 'task-1')?.status).toBe('completed');
  });

  it('adds a task to the latest selected date without waiting for pending navigation load', async () => {
    vi.useFakeTimers();
    const pendingNavigationLoad = deferred<TaskOccurrence[]>();
    mocks.loadVisibleTasks.mockReturnValue(pendingNavigationLoad.promise);
    mocks.addTask.mockResolvedValue(baseTask({
      id: 'task-new',
      title: '最新日期任务',
      taskDate: '2026-07-08',
    }));
    useTaskStore.setState({
      tasks: [],
      tasksByDate: {},
      visibleDates: ['2026-06-17', '2026-06-18'],
      visibleStartDate: '2026-06-17',
      visibleDays: 2,
      selectedDate: '2026-06-18',
      isLoading: false,
    });

    for (let index = 0; index < 20; index++) {
      await useTaskStore.getState().navigateDate(1, 2);
    }
    const add = useTaskStore.getState().addTask({
      title: '最新日期任务',
      taskDate: useTaskStore.getState().selectedDate,
    });
    const resultPromise = Promise.race([
      add.then(() => 'done'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 1)),
    ]);
    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;
    pendingNavigationLoad.resolve([]);
    await add;

    expect(result).toBe('done');
    expect(mocks.addTask).toHaveBeenCalledWith({ title: '最新日期任务', taskDate: '2026-07-08' });
    expect(useTaskStore.getState().selectedDate).toBe('2026-07-08');
    expect(useTaskStore.getState().tasksByDate['2026-07-08']?.[0]?.title).toBe('最新日期任务');

    pendingNavigationLoad.resolve([]);
    await vi.runOnlyPendingTimersAsync();
    expect(useTaskStore.getState().tasksByDate['2026-07-08']?.[0]?.title).toBe('最新日期任务');
  });

  it('removes completed tasks sequentially when clearing', async () => {
    const completedA = baseTask({ id: 'done-a', status: 'completed' });
    const completedB = baseTask({ id: 'done-b', status: 'completed' });
    const deletedOrder: string[] = [];
    mocks.deleteTask.mockImplementation(async (id: string) => {
      deletedOrder.push(id);
      return baseTask({ id, status: 'deleted' });
    });
    useTaskStore.setState({
      tasks: [completedA, completedB],
      tasksByDate: { '2026-06-18': [completedA, completedB] },
      selectedDate: '2026-06-18',
    });

    await useTaskStore.getState().deleteTask('done-a');
    await useTaskStore.getState().deleteTask('done-b');

    expect(deletedOrder).toEqual(['done-a', 'done-b']);
    expect(useTaskStore.getState().tasksByDate['2026-06-18']).toBeUndefined();
  });
});
