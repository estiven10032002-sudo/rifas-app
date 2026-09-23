'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STATUS_LABEL } from '@/lib/format';
import type { TicketStatus } from '@/lib/types';

/* ---------- Modal ---------- */

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-sm !min-h-0 rounded-full !px-2.5 !py-1 text-base">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Toasts + confirmaciones ---------- */

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  /** Si se define, la persona debe escribir exactamente este texto para confirmar. */
  requireText?: string;
}

interface UIContextValue {
  toast: (text: string, kind?: 'ok' | 'error') => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI debe usarse dentro de <UIProvider>');
  return ctx;
}

interface ToastItem {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const counter = useRef(0);

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  function answer(v: boolean) {
    pending?.resolve(v);
    setPending(null);
  }

  return (
    <UIContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialog options={pending.options} onAnswer={answer} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-ink text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </UIContext.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (v: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const needsText = !!options.requireText;
  const canConfirm = !needsText || typed.trim() === options.requireText;
  return (
    <Modal title={options.title} onClose={() => onAnswer(false)}>
      {options.message && <div className="text-sm text-slate-600">{options.message}</div>}
      {needsText && (
        <div className="mt-4">
          <label className="label" htmlFor="confirm-text">
            Para confirmar, escribe <strong>{options.requireText}</strong>
          </label>
          <input id="confirm-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={() => onAnswer(false)}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          className={`btn ${options.danger ? 'btn-danger-solid' : 'btn-primary'}`}
          onClick={() => onAnswer(true)}
        >
          {options.confirmText ?? 'Confirmar'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Piezas pequeñas ---------- */

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

const BADGE: Record<TicketStatus, string> = {
  reserved: 'border-amber-300 bg-amber-50 text-amber-900',
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  winner: 'border-amber-500 bg-amber-200 text-amber-950',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`chip ${BADGE[status]}`}>{status === 'winner' ? '★ ' : ''}{STATUS_LABEL[status]}</span>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {children}
    </div>
  );
}
