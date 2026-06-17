import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskInput } from './TaskInput';

describe('TaskInput', () => {
  it('re-enables submit after a failed save', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('database failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<TaskInput selectedDate="2026-06-18" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('添加任务'), { target: { value: '新增任务' } });
    fireEvent.submit(screen.getByLabelText('添加任务').closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: '新增任务',
        sourceType: 'manual',
        taskDate: '2026-06-18',
        endDate: null,
        progressPercent: 0,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).not.toBeDisabled();
    });

    consoleError.mockRestore();
  });

  it('submits daily tasks with an optional end date and initial progress', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(<TaskInput selectedDate="2026-06-18" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('添加任务'), { target: { value: '每日阅读' } });
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-06-30' } });
    fireEvent.change(screen.getByLabelText('初始进度'), { target: { value: '25' } });
    fireEvent.submit(screen.getByLabelText('添加任务').closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: '每日阅读',
        sourceType: 'daily',
        taskDate: '2026-06-18',
        endDate: '2026-06-30',
        progressPercent: 25,
      });
    });
  });
});
