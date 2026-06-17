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
      expect(onSubmit).toHaveBeenCalledWith('新增任务');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).not.toBeDisabled();
    });

    consoleError.mockRestore();
  });
});
