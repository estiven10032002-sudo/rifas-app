'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRaffle } from '@/components/raffle-context';
import { ErrorBox, Spinner } from '@/components/ui';
import { formatDateTime, formatMoney, STATUS_LABEL } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

const PAGE = 100;

const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  slug: 'enlace',
  description: 'descripción',
  price: 'precio',
  currency: 'moneda',
  total_numbers: 'cantidad de puestos',
  draw_date: 'fecha del sorteo',
  draw_time: 'hora del sorteo',
  prize_name: 'premio',
  prize_description: 'descripción del premio',
  prize_image_url: 'imagen del premio',
  organizer_name: 'organizador',
  contact_info: 'contacto',
  rules: 'reglas',
  status: 'estado',
  is_public: 'visibilidad pública',
};

function statusText(s: unknown): string {
  return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? String(s);
}

export default function HistoryPage() {
  const { supabase, raffle, participantById } = useRaffle();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('audit_log')
      .select('*')
      .eq('raffle_id', raffle.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (err) setError(err.message);
    else setEntries((data ?? []) as AuditEntry[]);
  }, [supabase, raffle.id, limit]);

  useEffect(() => {
    load();
  }, [load]);

  function personName(id: unknown): string {
    return participantById.get(String(id))?.name ?? 'un participante';
  }

  function describe(e: AuditEntry): string {
    const n = e.new_data ?? {};
    const o = e.old_data ?? {};
    if (e.table_name === 'tickets') {
      if (e.action === 'INSERT') return `Puesto #${n.number} asignado a ${personName(n.participant_id)} (${statusText(n.status).toLowerCase()})`;
      if (e.action === 'DELETE') return `Puesto #${o.number} liberado (era de ${personName(o.participant_id)})`;
      const parts: string[] = [];
      if (o.status !== n.status) parts.push(`${statusText(o.status)} → ${statusText(n.status)}`);
      if (Number(o.amount_paid) !== Number(n.amount_paid)) parts.push(`valor pagado ${formatMoney(Number(o.amount_paid), raffle.currency)} → ${formatMoney(Number(n.amount_paid), raffle.currency)}`);
      return `Puesto #${n.number}: ${parts.join(', ') || 'sin cambios visibles'}`;
    }
    if (e.table_name === 'participants') {
      if (e.action === 'INSERT') return `Participante “${n.name}” creado`;
      if (e.action === 'DELETE') return `Participante “${o.name}” eliminado`;
      const changed = ['name', 'phone', 'notes'].filter((k) => o[k] !== n[k]);
      return `Participante “${n.name}” editado${changed.length ? ` (${changed.map((k) => ({ name: 'nombre', phone: 'teléfono', notes: 'observaciones' })[k]).join(', ')})` : ''}`;
    }
    if (e.table_name === 'draws') {
      if (e.action === 'INSERT') return `Sorteo realizado: ganó el #${n.winning_number} (${n.winner_name})`;
      if (e.action === 'UPDATE' && n.voided_at && !o.voided_at) return `Sorteo anulado (#${n.winning_number}). Motivo: ${n.void_reason}`;
      return 'Sorteo modificado';
    }
    if (e.table_name === 'raffles') {
      if (e.action === 'INSERT') return `Rifa “${n.name}” creada`;
      if (e.action === 'DELETE') return 'Rifa eliminada';
      const changed = Object.keys(n).filter((k) => k !== 'updated_at' && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
      return `Configuración modificada: ${changed.map((k) => FIELD_LABELS[k] ?? k).join(', ') || 'sin cambios visibles'}`;
    }
    return `${e.table_name} ${e.action}`;
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!entries) return <Spinner />;

  return (
    <div>
      <p className="text-sm text-slate-600">
        Registro automático de todo lo que cambia en esta rifa. No se puede editar ni borrar desde la aplicación.
      </p>
      {entries.length === 0 ? (
        <p className="card mt-4 p-6 text-center text-slate-600">Aún no hay movimientos.</p>
      ) : (
        <ol className="card mt-4 divide-y divide-slate-100">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <time className="shrink-0 text-xs text-slate-500 sm:w-40" dateTime={e.created_at}>
                {formatDateTime(e.created_at)}
              </time>
              <span className="text-sm">{describe(e)}</span>
            </li>
          ))}
        </ol>
      )}
      {entries.length >= limit && (
        <button type="button" className="btn btn-secondary mt-4" onClick={() => setLimit((l) => l + PAGE)}>
          Ver movimientos anteriores
        </button>
      )}
    </div>
  );
}
