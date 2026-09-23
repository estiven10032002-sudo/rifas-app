'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRaffle } from '@/components/raffle-context';
import { friendlyError } from '@/components/raffle-modals';
import { Modal, useUI } from '@/components/ui';
import { formatDateTime, formatMoney, whatsappLink } from '@/lib/format';
import type { Draw } from '@/lib/types';

const SPIN_MS = 4200;

export default function DrawPage() {
  const { supabase, raffle, tickets, draws, activeDraw, reload } = useRaffle();
  const ui = useUI();
  const [includeReserved, setIncludeReserved] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [voiding, setVoiding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const eligible = useMemo(
    () => tickets.filter((t) => t.status === 'paid' || (includeReserved && t.status === 'reserved')).map((t) => t.number),
    [tickets, includeReserved],
  );
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const reservedCount = tickets.filter((t) => t.status === 'reserved').length;

  async function run() {
    const ok = await ui.confirm({
      title: '¿Realizar el sorteo ahora?',
      message: (
        <div className="space-y-2">
          <p>
            Participan <strong>{eligible.length}</strong> puesto{eligible.length === 1 ? '' : 's'} {includeReserved ? '(pagados y reservados)' : '(solo pagados)'}.
          </p>
          <p>El ganador se elige en la base de datos y queda guardado de forma permanente. No se puede cambiar sin anular el sorteo.</p>
        </div>
      ),
      confirmText: 'Sí, realizar sorteo',
    });
    if (!ok) return;

    setSpinning(true);
    const pool = eligible.length ? eligible : [1];
    timer.current = setInterval(() => setShown(pool[Math.floor(Math.random() * pool.length)]), 75);
    const started = Date.now();

    // 1) El resultado REAL se genera y guarda en la base de datos.
    const { data, error } = await supabase.rpc('run_draw', { p_raffle_id: raffle.id, p_include_reserved: includeReserved });
    // 2) La animación solo es visual: se mantiene un mínimo de segundos para dar emoción.
    await new Promise((r) => setTimeout(r, Math.max(0, SPIN_MS - (Date.now() - started))));
    if (timer.current) clearInterval(timer.current);

    if (error) {
      setSpinning(false);
      setShown(null);
      await reload();
      return ui.toast(friendlyError(error), 'error');
    }
    setShown((data as Draw).winning_number);
    await reload();
    setSpinning(false);
  }

  return (
    <div className="space-y-8">
      {spinning ? (
        <section className="stub rounded-3xl bg-ink px-6 py-12 text-center text-white shadow-lg" aria-live="polite">
          <p className="text-sm text-white/70">Sorteando…</p>
          <p className="mt-2 text-8xl font-black tabular-nums sm:text-9xl">{shown ?? '…'}</p>
        </section>
      ) : activeDraw ? (
        <WinnerCard draw={activeDraw} currency={raffle.currency} price={raffle.price} onVoid={() => setVoiding(true)} />
      ) : (
        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-bold">Sorteo</h2>
          <p className="mt-1 text-sm text-slate-600">
            {raffle.prize_name ? <>Premio: <strong>{raffle.prize_name}</strong>. </> : 'Aún no definiste el premio en Configuración. '}
            Por defecto solo participan los puestos <strong>pagados</strong>.
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={includeReserved} onChange={(e) => setIncludeReserved(e.target.checked)} />
            <span>
              <strong>Incluir también los reservados</strong> ({reservedCount})
              <span className="block text-xs text-slate-500">Úsalo solo si quieres que participen puestos que aún no han pagado.</span>
            </span>
          </label>

          <div className="mt-5">
            <p className="text-sm font-semibold">{eligible.length} puesto{eligible.length === 1 ? '' : 's'} habilitado{eligible.length === 1 ? '' : 's'}</p>
            <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {eligible.length === 0 && <span className="text-sm text-slate-500">Todavía no hay puestos pagados.</span>}
              {eligible.map((n) => (
                <span key={n} className="chip border-emerald-300 bg-emerald-50 text-emerald-900">{n}</span>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn-primary mt-6 w-full sm:w-auto sm:px-8" disabled={eligible.length === 0} onClick={run}>
            Realizar sorteo
          </button>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold">Historial de sorteos</h2>
        {draws.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Todavía no se ha realizado ningún sorteo.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {draws.map((d) => (
              <li key={d.id} className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${d.voided_at ? 'opacity-70' : ''}`}>
                <div>
                  <p className="font-bold">
                    <span className="tabular-nums">#{d.winning_number}</span> · {d.winner_name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatDateTime(d.drawn_at)} · {d.eligible_numbers.length} habilitados
                    {d.include_reserved ? ' (con reservados)' : ''}
                  </p>
                  {d.voided_at && (
                    <p className="mt-1 text-sm text-red-700">Anulado el {formatDateTime(d.voided_at)}: {d.void_reason}</p>
                  )}
                </div>
                <span className={`chip ${d.voided_at ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-amber-500 bg-amber-200 text-amber-950'}`}>
                  {d.voided_at ? 'Anulado' : 'Vigente'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {voiding && activeDraw && <VoidModal draw={activeDraw} onClose={() => setVoiding(false)} />}
    </div>
  );
}

function WinnerCard({ draw, currency, price, onVoid }: { draw: Draw; currency: string; price: number; onVoid: () => void }) {
  const wa = whatsappLink(draw.winner_phone);
  return (
    <section className="animate-pop rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-yellow-100 via-amber-100 to-amber-300 p-6 text-center text-amber-950 shadow-lg sm:p-10">
      <p className="text-sm font-bold">Número ganador</p>
      <p className="mt-1 text-8xl font-black leading-none tabular-nums sm:text-9xl">#{draw.winning_number}</p>
      <p className="mt-4 text-2xl font-black sm:text-3xl">{draw.winner_name}</p>
      {draw.winner_phone && (
        <p className="mt-1 text-sm">
          {draw.winner_phone}
          {wa && (
            <>
              {' · '}
              <a href={wa} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                Escribirle por WhatsApp
              </a>
            </>
          )}
        </p>
      )}
      {draw.prize_name && <p className="mt-3 text-lg font-semibold">Premio: {draw.prize_name}</p>}
      <p className="mt-4 text-sm text-amber-900/80">Sorteo realizado el {formatDateTime(draw.drawn_at)}</p>
      <p className="mt-1 text-xs text-amber-900/70">
        Resultado guardado de forma permanente · {draw.eligible_numbers.length} puestos participaron · valor del puesto {formatMoney(price, currency)}
      </p>
      <button type="button" className="btn btn-danger btn-sm mt-6" onClick={onVoid}>
        Anular sorteo…
      </button>
    </section>
  );
}

function VoidModal({ draw, onClose }: { draw: Draw; onClose: () => void }) {
  const { supabase, raffle, reload } = useRaffle();
  const ui = useUI();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = reason.trim().length >= 3 && typed.trim() === 'ANULAR';

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc('void_draw', { p_raffle_id: raffle.id, p_reason: reason });
    setBusy(false);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast('Sorteo anulado. Ya puedes realizar uno nuevo.');
    onClose();
  }

  return (
    <Modal title="Anular sorteo" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Vas a anular el sorteo donde ganó el <strong>#{draw.winning_number}</strong> ({draw.winner_name}). El registro se conserva en el historial con el motivo.
        </p>
        <div>
          <label className="label" htmlFor="void-reason">Motivo</label>
          <textarea id="void-reason" className="input min-h-[5rem]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Se hizo por error antes de la hora del sorteo" />
        </div>
        <div>
          <label className="label" htmlFor="void-typed">Para confirmar, escribe <strong>ANULAR</strong></label>
          <input id="void-typed" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-danger-solid" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Anulando…' : 'Anular sorteo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
