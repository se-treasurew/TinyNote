import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskItem } from './TaskItem';
import { defaultSettings } from '../types/settings';
import type { TaskOccurrence } from '../types/task';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { ConfirmContext } from './ConfirmDialog';

const baseTask = (overrides: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '写方案',
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

describe('TaskItem scheduling controls', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useSettingsStore.setState({
      settings: defaultSettings,
      isLoading: false,
    });
    useTaskStore.setState({
      completeTask: vi.fn(async () => undefined),
      restoreTask: vi.fn(async () => undefined),
      updateTask: vi.fn(async () => undefined),
      updateTaskProgress: vi.fn(async () => undefined),
      postponeTask: vi.fn(async () => undefined),
      clearTaskPostponements: vi.fn(async () => undefined),
      deleteTask: vi.fn(async () => undefined),
    });
  });

  it('shows a postponed tag when the task was postponed', () => {
    render(<TaskItem task={baseTask({
      taskDate: '2026-06-16',
      occurrenceDate: '2026-06-16',
      postponedAt: '2026-06-17T01:00:00.000Z',
    })} />);

    expect(screen.getByText('延期')).toBeInTheDocument();
  });

  it('opens a compact right-click menu and postpones to the chosen date', async () => {
    const postponeTask = vi.fn(async () => undefined);
    useTaskStore.setState({ postponeTask });
    render(<TaskItem task={baseTask({ progressPercent: 40 })} />);

    fireEvent.contextMenu(screen.getByRole('listitem'));
    expect(screen.getAllByText('延期到')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('延期日期'), { target: { value: '2026-06-20' } });
    expect(screen.queryByRole('button', { name: '标记延期' })).not.toBeInTheDocument();
    expect(screen.queryByText('确认延期')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('任务类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('截止日期')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存排期' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认延期到 2026-06-20' }));

    await waitFor(() => {
      expect(postponeTask).toHaveBeenCalledWith('task-1', '2026-06-18', '2026-06-20', 40);
    });
  });

  it('clears all postponement history from the right-click menu after confirmation', async () => {
    const clearTaskPostponements = vi.fn(async () => undefined);
    const confirm = vi.fn(async () => true);
    useTaskStore.setState({ clearTaskPostponements });
    render(
      <ConfirmContext.Provider value={confirm}>
        <TaskItem task={baseTask({
          postponedAt: '2026-06-18T01:00:00.000Z',
          postponementHistory: [{
            id: 'postpone-1',
            taskId: 'task-1',
            fromDate: '2026-06-18',
            toDate: '2026-06-20',
            createdAt: '2026-06-18T01:00:00.000Z',
            updatedAt: '2026-06-18T01:00:00.000Z',
            deletedAt: null,
            syncStatus: 'local',
            version: 1,
          }],
        })} />
      </ConfirmContext.Provider>,
    );

    fireEvent.contextMenu(screen.getByRole('listitem'));
    fireEvent.click(screen.getByRole('button', { name: '取消延期' }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: '取消延期',
        danger: true,
      }));
      expect(clearTaskPostponements).toHaveBeenCalledWith('task-1');
    });
  });

  it('closes the scheduling menu on outside click and Escape', () => {
    render(<TaskItem task={baseTask()} />);

    fireEvent.contextMenu(screen.getByRole('listitem'));
    expect(screen.getByLabelText('延期日期')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText('延期日期')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('listitem'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('延期日期')).not.toBeInTheDocument();
  });

  it('opens task details in a dialog with postponement history', () => {
    render(<TaskItem task={baseTask({
      createdAt: '2026-06-18T00:30:00.000Z',
      updatedAt: '2026-06-18T01:30:00.000Z',
      postponedAt: '2026-06-18T02:30:00.000Z',
      postponementHistory: [
        {
          id: 'postpone-1',
          taskId: 'task-1',
          fromDate: '2026-06-18',
          toDate: '2026-06-20',
          createdAt: '2026-06-18T02:30:00.000Z',
          updatedAt: '2026-06-18T02:30:00.000Z',
          deletedAt: null,
          syncStatus: 'local',
          version: 1,
        },
        {
          id: 'postpone-2',
          taskId: 'task-1',
          fromDate: '2026-06-20',
          toDate: '2026-06-22',
          createdAt: '2026-06-20T03:30:00.000Z',
          updatedAt: '2026-06-20T03:30:00.000Z',
          deletedAt: null,
          syncStatus: 'local',
          version: 1,
        },
      ],
    })} />);

    fireEvent.contextMenu(screen.getByRole('listitem'));
    fireEvent.click(screen.getByRole('button', { name: '任务详情' }));

    expect(screen.getByRole('dialog', { name: '任务详情' })).toBeInTheDocument();
    expect(screen.getByText('创建：2026-06-18 00:30')).toBeInTheDocument();
    expect(screen.getByText('更新：2026-06-18 01:30')).toBeInTheDocument();
    expect(screen.getByText('最近延期：2026-06-18 02:30')).toBeInTheDocument();
    expect(screen.getByText('2026-06-20 -> 2026-06-22 · 2026-06-20 03:30')).toBeInTheDocument();
    expect(screen.getByText('2026-06-18 -> 2026-06-20 · 2026-06-18 02:30')).toBeInTheDocument();
  });

  it('converts a manual task to multi-day from the details dialog advanced schedule section', async () => {
    const updateTask = vi.fn(async () => undefined);
    useTaskStore.setState({ updateTask });
    render(<TaskItem task={baseTask()} />);

    fireEvent.contextMenu(screen.getByRole('listitem'));
    fireEvent.click(screen.getByRole('button', { name: '任务详情' }));
    fireEvent.click(screen.getByRole('button', { name: '高级排期' }));
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: 'multi_day' } });
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-06-18' } });
    fireEvent.change(screen.getByLabelText('截止日期'), { target: { value: '2026-06-19' } });
    fireEvent.click(screen.getByRole('button', { name: '保存排期' }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('task-1', {
        sourceType: 'multi_day',
        taskDate: '2026-06-18',
        endDate: '2026-06-19',
      });
    });
  });

  it('cancels detail schedule edits without saving and keeps action row styling', async () => {
    const updateTask = vi.fn(async () => undefined);
    useTaskStore.setState({ updateTask });
    render(<TaskItem task={baseTask()} />);

    fireEvent.contextMenu(screen.getByRole('listitem'));
    fireEvent.click(screen.getByRole('button', { name: '任务详情' }));
    fireEvent.click(screen.getByRole('button', { name: '高级排期' }));
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: 'multi_day' } });
    expect(screen.getByRole('button', { name: '保存排期' }).closest('.task-menu-actions')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '任务详情' })).not.toBeInTheDocument();
  });
});
