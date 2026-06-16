import { Pause, Play, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useRoutineStore } from '../stores/routineStore';
import { useUiStore } from '../stores/uiStore';
import { todayIsoDate } from '../utils/date';

export function RoutinePanel() {
  const routines = useRoutineStore((state) => state.routines);
  const loadRoutines = useRoutineStore((state) => state.loadRoutines);
  const createDailyRoutine = useRoutineStore((state) => state.createDailyRoutine);
  const createMultiDayRoutine = useRoutineStore((state) => state.createMultiDayRoutine);
  const enableRoutine = useRoutineStore((state) => state.enableRoutine);
  const disableRoutine = useRoutineStore((state) => state.disableRoutine);
  const deleteRoutine = useRoutineStore((state) => state.deleteRoutine);
  const closePanel = useUiStore((state) => state.closePanel);
  const [mode, setMode] = useState<'daily' | 'multi_day'>('daily');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    void loadRoutines();
  }, [loadRoutines]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    if (mode === 'daily') {
      await createDailyRoutine({ title, startDate, endDate: endDate || null });
    } else {
      await createMultiDayRoutine({ title, startDate, endDate: endDate || startDate });
    }
    setTitle('');
  }

  return (
    <aside className="panel">
      <header className="panel-header">
        <strong>Routine</strong>
        <button type="button" aria-label="关闭" onClick={closePanel}>
          <X size={16} />
        </button>
      </header>
      <div className="segmented">
        <button
          type="button"
          className={mode === 'daily' ? 'active' : ''}
          onClick={() => {
            setMode('daily');
            setEndDate('');
          }}
        >
          Daily
        </button>
        <button
          type="button"
          className={mode === 'multi_day' ? 'active' : ''}
          onClick={() => {
            setMode('multi_day');
            setEndDate((current) => current || startDate);
          }}
        >
          多日
        </button>
      </div>
      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="名称" />
        <div className="date-pair">
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            aria-label={mode === 'daily' ? '结束日期，可留空' : '结束日期'}
          />
        </div>
        <button type="submit">保存</button>
      </form>
      <div className="panel-list">
        {routines.map((routine) => (
          <div className="routine-row" key={routine.id}>
            <div>
              <strong>{routine.title}</strong>
              <span>{routine.startDate}{routine.endDate ? ` - ${routine.endDate}` : ''}</span>
            </div>
            <button
              type="button"
              aria-label={routine.isEnabled ? '暂停' : '启用'}
              onClick={() => void (routine.isEnabled ? disableRoutine(routine.id) : enableRoutine(routine.id))}
            >
              {routine.isEnabled ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" aria-label="删除" onClick={() => void deleteRoutine(routine.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
