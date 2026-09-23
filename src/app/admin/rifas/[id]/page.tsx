'use client';

import { Board, Legend } from '@/components/board';
import { useRaffle } from '@/components/raffle-context';
import { useRaffleModals } from '@/components/raffle-modals';
import { firstName, formatDateTime, formatMoney } from '@/lib/format';

function Stat({ label, value, tone = 'default', wide = false }: { label: string; value: string | number; tone?: 'default' | 'good' | 'warn'; wide?: boolean }) {
  const tones = {
    default: 'bg-white border-slate-200',
    good: 'bg-emerald-50 border-emerald-200',
    warn: 'bg-amber-50 border-amber-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]} ${wide ? 'col-span-2' : ''}`}>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">{value}</p>
    </div>
  );
}

export default function SummaryPage() {
  const { raffle, stats, ticketByNumber, participantById, activeDraw } = useRaffle();
  const { openTicket, openParticipant, modals } = useRaffleModals();

  return (
    <div className="space-y-8">
      {raffle.is_demo && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          Esta es una <strong>rifa de prueba</strong>. Puedes tocar los números y probar todo. Cuando termines, vuelve a “Mis rifas” y usa
          <strong> Borrar datos de prueba</strong>.
        </div>
      )}

      {activeDraw && (
        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-yellow-100 to-amber-200 p-4 text-amber-950">
          <p className="text-sm font-bold">Sorteo realizado · {formatDateTime(activeDraw.drawn_at)}</p>
          <p className="mt-1 text-xl font-black">
            Ganador: #{activeDraw.winning_number} · {activeDraw.winner_name}
          </p>
        </div>
      )}

      <section aria-label="Estadísticas" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total recaudado" value={formatMoney(stats.collected, raffle.currency)} tone="good" wide />
        <Stat label="Pendiente de pago" value={formatMoney(stats.pending, raffle.currency)} tone="warn" wide />
        <Stat label="Total de puestos" value={stats.total} />
        <Stat label="Disponibles" value={stats.available} />
        <Stat label="Reservados" value={stats.reserved} />
        <Stat label="Pagados" value={stats.paid} />
        <Stat label="Participantes" value={stats.participants} />
        <Stat label="Ocupación" value={`${stats.occupancy}%`} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Tablero</h2>
            <p className="text-sm text-slate-600">Toca un número para reservarlo, cobrarlo o liberarlo.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openParticipant(null)}>
            Nuevo participante
          </button>
        </div>
        <div className="card p-3 sm:p-5">
          <Board
            total={raffle.total_numbers}
            onSelect={openTicket}
            getCell={(n) => {
              const t = ticketByNumber.get(n);
              if (!t) return { state: 'available' };
              return { state: t.status, label: firstName(participantById.get(t.participant_id)?.name) };
            }}
          />
        </div>
        <div className="mt-3">
          <Legend />
        </div>
      </section>

      {modals}
    </div>
  );
}
