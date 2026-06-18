import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export { ConfirmContext };

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Provides a promise-based confirmation dialog across the app. Renders a single
 * shared modal so callers can `await confirm({ message })` without wiring up a
 * dialog per call site. Avoids the Tauri dialog plugin (not yet registered) and
 * the inconsistent `window.confirm` behavior inside WebView2.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className="confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={pending.title ?? '确认操作'}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              close(false);
            }
          }}
        >
          <section className="confirm-dialog">
            {pending.title && <strong className="confirm-title">{pending.title}</strong>}
            <p className="confirm-message">{pending.message}</p>
            <div className="confirm-actions">
              <button type="button" className="ghost" onClick={() => close(false)}>
                {pending.cancelLabel ?? '取消'}
              </button>
              <button
                type="button"
                className={pending.danger ? 'danger' : ''}
                autoFocus
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? '确认'}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return confirm;
}
