'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Board, Legend, type CellInfo } from './board';
import { Modal, StatusBadge, useUI } from './ui';
import { useRaffle } from './raffle-context';
import { firstName, formatDateTime, formatMoney, whatsappLink } from '@/lib/format';

/** Convierte errores de la base de datos en mensajes claros. */
export function friendlyError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return 'Ocurrió un error inesperado.';
  const msg = err.message ?? '';
  if (err.code === '23505') {
    return msg.includes('ocupados')
      ? msg
      : 'Ese número acaba de ser ocupado por otra persona. El tablero se actualizó: elige otro.';
  }
  if (err.code === '42501' || msg.includes('row-level security') || msg.includes('JWT')) {
    return 'Tu sesión venció o no tienes permiso. Vuelve a iniciar sesión.';
  }
  return msg || 'Ocurrió un error inesperado.';
}

/**
 * Hook que entrega las ventanas de puesto y de participante.
 * Uso: const { openTicket, openParticipant, modals } = useRaffleModals();  ...  {modals}
 */
export function useRaffleModals() {
  const [ticketNo, setTicketNo] = useState<number | null>(null);
  const [participant, setParticipant] = useState<{ id: string | null; numbers: number[] } | null>(null);

  const modals: ReactNode = (
    <>
      {ticketNo !== null && (
        <TicketModal
          number={ticketNo}
          onNavigate={setTicketNo}
          onClose={() => setTicketNo(null)}
          onEditParticipant={(id) => {
            setTicketNo(null);
            setParticipant({ id, numbers: [] });
          }}
        />
      )}
      {participant && (
        <ParticipantModal participantId={participant.id} initialNumbers={participant.numbers} onClose={() => setParticipant(null)} />
      )}
    </>
  );

  return {
    openTicket: (n: number) => setTicketNo(n),
    openParticipant: (id: string | null = null, numbers: number[] = []) => setParticipant({ id, numbers }),
    modals,
  };
}

/* =====================================================================
   Ventana de un puesto
   ===================================================================== */

function TicketModal({
  number,
  onNavigate,
  onClose,
  onEditParticipant,
}: {
  number: number;
  onNavigate: (n: number) => void;
  onClose: () => void;
  onEditParticipant: (id: string) => void;
}) {
  const { ticketByNumber } = useRaffle();
  const ticket = ticketByNumber.get(number);

  return (
    <Modal title={`Puesto #${number}`} onClose={onClose}>
      {ticket ? (
        <TicketDetails key={ticket.id} ticketId={ticket.id} onNavigate={onNavigate} onClose={onClose} onEditParticipant={onEditParticipant} />
      ) : (
        <AssignForm key={number} number={number} onClose={onClose} />
      )}
    </Modal>
  );
}

function AssignForm({ number, onClose }: { number: number; onClose: () => void }) {
  const { supabase, raffle, participants, reload } = useRaffle();
  const ui = useUI();
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [existingId, setExistingId] = useState('');
  const [busy, setBusy] = useState(false);

  async function assign(status: 'reserved' | 'paid') {
    if (mode === 'new' && !name.trim()) return ui.toast('Escribe el nombre del participante.', 'error');
    if (mode === 'existing' && !existingId) return ui.toast('Elige un participante de la lista.', 'error');
    setBusy(true);
    const amount = status === 'paid' ? raffle.price : 0;
    const res =
      mode === 'new'
        ? await supabase.rpc('save_participant', {
            p_raffle_id: raffle.id,
            p_participant_id: null,
            p_name: name,
            p_phone: phone,
            p_notes: null,
            p_numbers: [number],
            p_new_status: status,
            p_new_amount: amount,
          })
        : await supabase.from('tickets').insert({
            raffle_id: raffle.id,
            number,
            participant_id: existingId,
            status,
            amount_paid: amount,
          });
    setBusy(false);
    await reload();
    if (res.error) return ui.toast(friendlyError(res.error), 'error');
    ui.toast(status === 'paid' ? `Puesto #${number} registrado como pagado` : `Puesto #${number} reservado`);
    onClose();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Este puesto está disponible. ¿A quién se lo asignas?</p>

      {participants.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-2 transition ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {m === 'new' ? 'Persona nueva' : 'Ya registrada'}
            </button>
          ))}
        </div>
      )}

      {mode === 'new' ? (
        <>
          <div>
            <label className="label" htmlFor="t-name">Nombre</label>
            <input id="t-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="t-phone">Teléfono o WhatsApp (opcional)</label>
            <input id="t-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </>
      ) : (
        <div>
          <label className="label" htmlFor="t-existing">Participante</label>
          <select id="t-existing" className="input" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            <option value="">Elige una persona…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} className="btn btn-secondary flex-1" onClick={() => assign('reserved')}>
          Reservar
        </button>
        <button type="button" disabled={busy} className="btn btn-primary flex-1" onClick={() => assign('paid')}>
          Registrar pago ({formatMoney(raffle.price, raffle.currency)})
        </button>
      </div>
    </div>
  );
}

function TicketDetails({
  ticketId,
  onNavigate,
  onClose,
  onEditParticipant,
}: {
  ticketId: string;
  onNavigate: (n: number) => void;
  onClose: () => void;
  onEditParticipant: (id: string) => void;
}) {
  const { supabase, raffle, tickets, participantById, reload } = useRaffle();
  const ui = useUI();
  const ticket = tickets.find((t) => t.id === ticketId)!;
  const person = participantById.get(ticket.participant_id);
  const isWinner = ticket.status === 'winner';
  const mine = useMemo(
    () => tickets.filter((t) => t.participant_id === ticket.participant_id).sort((a, b) => a.number - b.number),
    [tickets, ticket.participant_id],
  );
  const [status, setStatus] = useState<'reserved' | 'paid'>(ticket.status === 'reserved' ? 'reserved' : 'paid');
  const [amount, setAmount] = useState(String(ticket.amount_paid));
  const [busy, setBusy] = useState(false);
  const wa = whatsappLink(person?.phone);

  async function update(patch: { status?: 'reserved' | 'paid'; amount_paid?: number }, okMessage: string) {
    setBusy(true);
    const { error } = await supabase.from('tickets').update(patch).eq('id', ticket.id);
    setBusy(false);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast(okMessage);
    onClose();
  }

  async function release() {
    const ok = await ui.confirm({
      title: `¿Liberar el puesto #${ticket.number}?`,
      message: (
        <>
          Quedará disponible para otra persona y dejará de estar a nombre de <strong>{person?.name}</strong>.
        </>
      ),
      confirmText: 'Liberar puesto',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from('tickets').delete().eq('id', ticket.id);
    setBusy(false);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast(`Puesto #${ticket.number} liberado`);
    onClose();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{person?.name ?? 'Participante'}</p>
            {person?.phone && (
              <p className="mt-0.5 text-sm text-slate-600">
                <a href={`tel:${person.phone}`} className="underline">{person.phone}</a>
                {wa && (
                  <>
                    {' · '}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">
                      WhatsApp
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <StatusBadge status={ticket.status} />
        </div>
        {person?.notes && <p className="mt-2 text-sm text-slate-600">“{person.notes}”</p>}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Valor pagado</dt>
            <dd className="font-bold tabular-nums">{formatMoney(ticket.amount_paid, raffle.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Registrado</dt>
            <dd className="font-medium">{formatDateTime(ticket.registered_at)}</dd>
          </div>
        </dl>
      </div>

      {mine.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Todos sus números</p>
          <div className="flex flex-wrap gap-1.5">
            {mine.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onNavigate(t.number)}
                className={`chip ${t.id === ticket.id ? 'border-brand-600 bg-brand-600 text-white' : t.status === 'reserved' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}
              >
                {t.number}
              </button>
            ))}
          </div>
        </div>
      )}

      {isWinner ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Este es el puesto ganador y está protegido. Para cambiarlo, anula el sorteo desde la sección <strong>Sorteo</strong>.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            {ticket.status === 'reserved' ? (
              <button
                type="button"
                disabled={busy}
                className="btn btn-primary flex-1"
                onClick={() => update({ status: 'paid', amount_paid: Math.max(Number(ticket.amount_paid), raffle.price) }, `Puesto #${ticket.number} marcado como pagado`)}
              >
                Marcar como pagado
              </button>
            ) : (
              <button type="button" disabled={busy} className="btn btn-secondary flex-1" onClick={() => update({ status: 'reserved' }, `Puesto #${ticket.number} vuelve a reservado`)}>
                Volver a reservado
              </button>
            )}
            <button type="button" disabled={busy} className="btn btn-danger flex-1" onClick={release}>
              Liberar número
            </button>
          </div>

          <details className="rounded-2xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Editar estado y valor pagado</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="e-status">Estado</label>
                <select id="e-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as 'reserved' | 'paid')}>
                  <option value="reserved">Reservado</option>
                  <option value="paid">Pagado</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="e-amount">Valor pagado</label>
                <input id="e-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              className="btn btn-secondary mt-3 w-full"
              onClick={() => {
                const value = Number(amount.replace(/[^\d.]/g, ''));
                if (Number.isNaN(value) || value < 0) return ui.toast('El valor pagado no es válido.', 'error');
                update({ status, amount_paid: value }, 'Cambios guardados');
              }}
            >
              Guardar cambios
            </button>
          </details>
        </>
      )}

      {person && (
        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => onEditParticipant(person.id)}>
          Editar datos de {firstName(person.name)}
        </button>
      )}
    </div>
  );
}

/* =====================================================================
   Ventana de participante (crear / editar)
   ===================================================================== */

function parseNumbers(text: string, total: number): { numbers: number[]; invalid: string[] } {
  const numbers: number[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (a < 1 || b > total || a > b) invalid.push(token);
      else for (let n = a; n <= b; n++) numbers.push(n);
    } else if (/^\d+$/.test(token) && Number(token) >= 1 && Number(token) <= total) {
      numbers.push(Number(token));
    } else {
      invalid.push(token);
    }
  }
  return { numbers, invalid };
}

function ParticipantModal({
  participantId,
  initialNumbers,
  onClose,
}: {
  participantId: string | null;
  initialNumbers: number[];
  onClose: () => void;
}) {
  const { supabase, raffle, participantById, ticketByNumber, tickets, reload } = useRaffle();
  const ui = useUI();
  const existing = participantId ? participantById.get(participantId) : undefined;

  const owned = useMemo(
    () => new Set(tickets.filter((t) => t.participant_id === participantId).map((t) => t.number)),
    [tickets, participantId],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [selected, setSelected] = useState<Set<number>>(() => new Set([...Array.from(owned), ...initialNumbers]));
  const [status, setStatus] = useState<'reserved' | 'paid'>('reserved');
  const [amount, setAmount] = useState('0');
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);

  const added = Array.from(selected).filter((n) => !owned.has(n)).sort((a, b) => a - b);
  const removed = Array.from(owned).filter((n) => !selected.has(n)).sort((a, b) => a - b);

  function holderOf(n: number) {
    const t = ticketByNumber.get(n);
    return t && t.participant_id !== participantId ? t : undefined;
  }

  function toggle(n: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function addQuick() {
    const { numbers, invalid } = parseNumbers(quick, raffle.total_numbers);
    const taken = numbers.filter((n) => holderOf(n));
    const ok = numbers.filter((n) => !holderOf(n));
    setSelected((prev) => new Set([...Array.from(prev), ...ok]));
    setQuick('');
    const problems = [...invalid.map((x) => `${x} (no válido)`), ...taken.map((n) => `${n} (ocupado)`)];
    if (problems.length) ui.toast(`No se agregaron: ${problems.join(', ')}`, 'error');
  }

  function changeStatus(next: 'reserved' | 'paid') {
    setStatus(next);
    setAmount(String(next === 'paid' ? raffle.price : 0));
  }

  const getCell = (n: number): CellInfo => {
    const t = ticketByNumber.get(n);
    if (t && t.participant_id !== participantId) {
      return { state: 'disabled', label: firstName(participantById.get(t.participant_id)?.name) };
    }
    if (t && t.status === 'winner') return { state: 'winner', clickable: false };
    return { state: selected.has(n) ? 'selected' : 'available' };
  };

  async function submit() {
    if (!name.trim()) return ui.toast('El nombre es obligatorio.', 'error');
    if (!participantId && selected.size === 0) return ui.toast('Elige al menos un número.', 'error');
    if (removed.length > 0) {
      const ok = await ui.confirm({
        title: 'Se liberarán números',
        message: <>Los números <strong>{removed.join(', ')}</strong> quedarán disponibles otra vez.</>,
        confirmText: 'Continuar',
        danger: true,
      });
      if (!ok) return;
    }
    const value = Number(amount.replace(/[^\d.]/g, '')) || 0;
    setBusy(true);
    const { error } = await supabase.rpc('save_participant', {
      p_raffle_id: raffle.id,
      p_participant_id: participantId,
      p_name: name,
      p_phone: phone,
      p_notes: notes,
      p_numbers: Array.from(selected).sort((a, b) => a - b),
      p_new_status: status,
      p_new_amount: value,
    });
    setBusy(false);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast(participantId ? 'Participante actualizado' : 'Participante guardado');
    onClose();
  }

  return (
    <Modal title={participantId ? 'Editar participante' : 'Nuevo participante'} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-name">Nombre</label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus={!participantId} />
          </div>
          <div>
            <label className="label" htmlFor="p-phone">Teléfono o WhatsApp</label>
            <input id="p-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-notes">Observaciones</label>
          <textarea id="p-notes" className="input min-h-[4.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="label !mb-0">Números</p>
              <p className="hint !mt-0">Toca los números para elegirlos o quitarlos.</p>
            </div>
            <div className="flex gap-2">
              <input
                className="input !w-44"
                placeholder="Ej: 3, 7, 10-15"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addQuick();
                  }
                }}
                aria-label="Escribir números"
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={addQuick}>
                Agregar
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
            <Board total={raffle.total_numbers} getCell={getCell} onSelect={toggle} />
          </div>
          <div className="mt-2">
            <Legend selected />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {selected.size === 0 ? 'Ningún número elegido.' : `${selected.size} número${selected.size === 1 ? '' : 's'}: ${Array.from(selected).sort((a, b) => a - b).join(', ')}`}
          </p>
          {removed.length > 0 && <p className="mt-1 text-sm font-medium text-red-700">Se liberarán: {removed.join(', ')}</p>}
        </div>

        {added.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold">
              Estado de {added.length === 1 ? 'el número nuevo' : `los ${added.length} números nuevos`} ({added.join(', ')})
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="p-status">Estado</label>
                <select id="p-status" className="input" value={status} onChange={(e) => changeStatus(e.target.value as 'reserved' | 'paid')}>
                  <option value="reserved">Reservado (aún no paga)</option>
                  <option value="paid">Pagado</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-amount">Valor pagado por cada número</label>
                <input id="p-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="hint">Precio del puesto: {formatMoney(raffle.price, raffle.currency)}</p>
              </div>
            </div>
          </div>
        ) : participantId ? (
          <p className="text-sm text-slate-500">Para cambiar el estado o el pago de un número que ya tiene, tócalo en el tablero de la pestaña Resumen o en la lista.</p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Guardando…' : 'Guardar participante'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
