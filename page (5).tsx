'use client';

import { useMemo, useState } from 'react';
import { useRaffle } from '@/components/raffle-context';
import { friendlyError, useRaffleModals } from '@/components/raffle-modals';
import { useUI } from '@/components/ui';
import { formatMoney, normalize, whatsappLink } from '@/lib/format';
import type { Participant, Ticket } from '@/lib/types';

interface Row {
  person: Participant;
  tickets: Ticket[];
  paid: number;
  pending: number;
  hasReserved: boolean;
}

export default function ParticipantsPage() {
  const { supabase, raffle, participants, tickets, reload } = useRaffle();
  const ui = useUI();
  const { openTicket, openParticipant, modals } = useRaffleModals();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const byPerson = new Map<string, Ticket[]>();
    for (const t of tickets) byPerson.set(t.participant_id, [...(byPerson.get(t.participant_id) ?? []), t]);
    return participants.map((person) => {
      const mine = (byPerson.get(person.id) ?? []).sort((a, b) => a.number - b.number);
      return {
        person,
        tickets: mine,
        paid: mine.reduce((s, t) => s + Number(t.amount_paid), 0),
        pending: mine.filter((t) => t.status === 'reserved').reduce((s, t) => s + Math.max(raffle.price - Number(t.amount_paid), 0), 0),
        hasReserved: mine.some((t) => t.status === 'reserved'),
      };
    });
  }, [participants, tickets, raffle.price]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return rows;
    const asNumber = /^\d+$/.test(q) ? Number(q) : null;
    return rows.filter(
      (r) =>
        normalize(r.person.name).includes(q) ||
        normalize(r.person.phone).includes(q) ||
        (asNumber !== null && r.tickets.some((t) => t.number === asNumber)),
    );
  }, [rows, query]);

  async function markAllPaid(row: Row) {
    setBusyId(row.person.id);
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'paid', amount_paid: raffle.price })
      .eq('participant_id', row.person.id)
      .eq('status', 'reserved');
    setBusyId(null);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast(`${row.person.name}: todos sus números quedaron pagados`);
  }

  async function remove(row: Row) {
    const n = row.tickets.length;
    const ok = await ui.confirm({
      title: `¿Eliminar a ${row.person.name}?`,
      message: n > 0 ? <>Se liberarán sus {n} número{n === 1 ? '' : 's'} ({row.tickets.map((t) => t.number).join(', ')}) y no se puede deshacer.</> : 'Se borrará este participante.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setBusyId(row.person.id);
    const { error } = await supabase.from('participants').delete().eq('id', row.person.id);
    setBusyId(null);
    await reload();
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast('Participante eliminado');
  }

  function Chips({ row }: { row: Row }) {
    if (row.tickets.length === 0) return <span className="text-sm text-slate-400">Sin números</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {row.tickets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openTicket(t.number)}
            title={t.status === 'reserved' ? 'Reservado' : t.status === 'paid' ? 'Pagado' : 'Ganador'}
            className={`chip transition hover:brightness-95 ${
              t.status === 'reserved'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : t.status === 'paid'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-amber-500 bg-amber-200 text-amber-950'
            }`}
          >
            {t.status === 'winner' && '★ '}
            {t.number}
          </button>
        ))}
      </div>
    );
  }

  function Actions({ row }: { row: Row }) {
    const disabled = busyId === row.person.id;
    return (
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openParticipant(row.person.id)}>
          Editar
        </button>
        {row.hasReserved && (
          <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => markAllPaid(row)}>
            Marcar pagado
          </button>
        )}
        <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => remove(row)}>
          Eliminar
        </button>
      </div>
    );
  }

  function Contact({ person }: { person: Participant }) {
    const wa = whatsappLink(person.phone);
    if (!person.phone) return <span className="text-slate-400">—</span>;
    return (
      <span>
        {person.phone}
        {wa && (
          <>
            {' '}
            <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">
              WhatsApp
            </a>
          </>
        )}
      </span>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-80">
          <label htmlFor="search" className="label">Buscar por nombre, teléfono o número</label>
          <input id="search" type="search" className="input" placeholder="Ej: María o 27" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openParticipant(null)}>
          Nuevo participante
        </button>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        {filtered.length} participante{filtered.length === 1 ? '' : 's'}
        {query && ` encontrado${filtered.length === 1 ? '' : 's'}`}
      </p>

      {filtered.length === 0 ? (
        <div className="card mt-3 p-8 text-center text-slate-600">
          {participants.length === 0 ? 'Todavía no hay participantes. Agrega el primero con “Nuevo participante”.' : 'No hay resultados para esa búsqueda.'}
        </div>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="mt-3 space-y-3 md:hidden">
            {filtered.map((row) => (
              <li key={row.person.id} className="card p-4">
                <p className="text-base font-bold">{row.person.name}</p>
                <p className="text-sm text-slate-600">{Contact({ person: row.person })}</p>
                {row.person.notes && <p className="mt-1 text-sm italic text-slate-500">{row.person.notes}</p>}
                <div className="mt-3">{Chips({ row })}</div>
                <p className="mt-3 text-sm text-slate-600">
                  Pagado <strong className="tabular-nums">{formatMoney(row.paid, raffle.currency)}</strong>
                  {row.pending > 0 && <> · Debe <strong className="tabular-nums text-amber-800">{formatMoney(row.pending, raffle.currency)}</strong></>}
                </p>
                <div className="mt-3">{Actions({ row })}</div>
              </li>
            ))}
          </ul>

          {/* Computador: tabla */}
          <div className="card mt-3 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Participante</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Números</th>
                  <th className="px-4 py-3 text-right font-semibold">Pagado</th>
                  <th className="px-4 py-3 text-right font-semibold">Pendiente</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <tr key={row.person.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.person.name}</p>
                      {row.person.notes && <p className="max-w-[14rem] text-xs italic text-slate-500">{row.person.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{Contact({ person: row.person })}</td>
                    <td className="max-w-[16rem] px-4 py-3">{Chips({ row })}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.paid, raffle.currency)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${row.pending > 0 ? 'font-semibold text-amber-800' : 'text-slate-400'}`}>
                      {formatMoney(row.pending, raffle.currency)}
                    </td>
                    <td className="px-4 py-3">{Actions({ row })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modals}
    </div>
  );
}
