import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskManagePanel } from './TaskManagePanel';
import { taskService } from '../services/taskService';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import type { Task } from '../types/task';

vi.mock('../services/taskService', () => ({
  taskService: {
    loadAll: vi.fn(),
  },
}));

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '每日阅读',
  content: null,
  taskDate: '2026-06-18',
  endDate: null,
  status: 'active',
  priority: 'none',
  sourceType: 'daily',
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
  ...overrides,
});

describe('TaskManagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskService.loadAll).mockResolvedValue([]);
    useUiStore.setState({
      currentPanel: 'taskManage',
      isArchiveOpen: false,
      isSettingsOpen: false,
      isTaskManageOpen: true,
    });
    useTaskStore.setState({
      addTask: vi.fn(async () => ({
        ...baseTask(),
        definitionTaskDate: '2026-06-18',
        occurrenceDate: '2026-06-18',
        progressPercent: 0,
        progressEntryId: null,
        postponementId: null,
        postponedFromDate: null,
        postponedToDate: null,
        postponementHistory: [],
      })),
      updateTask: vi.fn(async () => undefined),
      deleteTask: vi.fn(async () => undefined),
      loadTasks: vi.fn(async () => undefined),
    });
  });

  it('opens with daily task creation copy and an action-oriented empty state', async () => {
    await renderPanel();

    expect(screen.getByRole('button', { name: '每日' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /新建每日任务/ })).toBeInTheDocument();

    expect(screen.getByText('还没有每日任务，先创建一个每天都会出现的小事项')).toBeInTheDocument();
  });

  it('shows a labeled daily creation form with matching submit copy', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /新建每日任务/ }));

    expect(screen.getByRole('heading', { name: '新建每日任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务名称')).toHaveAttribute('placeholder', '任务名称');
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('结束日期（可选）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建每日任务' })).toBeDisabled();
  });

  it('updates creation copy when switching to multi-day tasks', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '多日' }));
    fireEvent.click(screen.getByRole('button', { name: /新建多日任务/ }));

    expect(screen.getByRole('heading', { name: '新建多日任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('结束日期')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建多日任务' })).toBeDisabled();
  });

  it('creates a task with the current mode and preserves empty end dates as null', async () => {
    const addTask = vi.fn(async () => ({
      ...baseTask({ title: '晨间复盘' }),
      definitionTaskDate: '2026-06-20',
      occurrenceDate: '2026-06-20',
      progressPercent: 0,
      progressEntryId: null,
      postponementId: null,
      postponedFromDate: null,
      postponedToDate: null,
      postponementHistory: [],
    }));
    useTaskStore.setState({ addTask });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /新建每日任务/ }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '晨间复盘' } });
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: '创建每日任务' }));

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledWith({
        title: '晨间复盘',
        taskDate: '2026-06-20',
        sourceType: 'daily',
        endDate: null,
      });
    });
  });

  it('lays out editing controls as a full-width form with bottom actions', async () => {
    vi.mocked(taskService.loadAll).mockResolvedValue([
      baseTask({ title: '复盘任务', endDate: '2026-06-20' }),
    ]);
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const saveButton = screen.getByRole('button', { name: '保存' });
    const editForm = saveButton.closest('.panel-edit-form');
    expect(editForm).not.toBeNull();
    expect(editForm?.closest('.routine-row')).toHaveClass('editing');
    expect(saveButton.closest('.panel-form-actions')).not.toBeNull();
    expect(screen.getByRole('button', { name: '取消' }).closest('.panel-form-actions')).not.toBeNull();
    expect(screen.getByLabelText('编辑任务标题')).toHaveValue('复盘任务');
    expect(screen.getByLabelText('编辑开始日期')).toHaveValue('2026-06-18');
    expect(screen.getByLabelText('编辑结束日期')).toHaveValue('2026-06-20');
  });
});

async function renderPanel() {
  render(<TaskManagePanel />);

  await waitFor(() => {
    expect(taskService.loadAll).toHaveBeenCalled();
  });
}
