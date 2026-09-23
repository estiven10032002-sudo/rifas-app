'use client';

import { useRaffle } from '@/components/raffle-context';
import { useUI } from '@/components/ui';
import { downloadFile, toCsv, today } from '@/lib/csv';
import { formatDate, formatDateTime, formatTime, STATUS_LABEL } from '@/lib/format';

export default function BackupPage() {
  const { supabase, raffle, participants, tickets, draws, participantById } = useRaffle();
  const ui = useUI();
  const stamp = today();
  const file = (kind: string, ext: string) => `${raffle.slug}-${kind}-${stamp}.${ext}`;

  function exportParticipants() {
    const rows: (string | number | null)[][] = [
      ['Participante', 'Teléfono', 'Cantidad de números', 'Números', 'Pagados', 'Reservados', 'Total pagado', 'Pendiente', 'Observaciones', 'Registrado'],
    ];
    for (const p of participants) {
      const mine = tickets.filter((t) => t.participant_id === p.id).sort((a, b) => a.number - b.number);
      rows.push([
        p.name,
        p.phone,
        mine.length,
        mine.map((t) => t.number).join(' '),
        mine.filter((t) => t.status !== 'reserved').length,
        mine.filter((t) => t.status === 'reserved').length,
        mine.reduce((s, t) => s + Number(t.amount_paid), 0),
        mine.filter((t) => t.status === 'reserved').reduce((s, t) => s + Math.max(raffle.price - Number(t.amount_paid), 0), 0),
        p.notes,
        formatDateTime(p.created_at),
      ]);
    }
    downloadFile(file('participantes', 'csv'), toCsv(rows));
    ui.toast('Participantes exportados');
  }

  function exportTickets() {
    const byNumber = new Map(tickets.map((t) => [t.number, t]));
    const rows: (string | number | null)[][] = [['Número', 'Estado', 'Participante', 'Teléfono', 'Valor pagado', 'Fecha de registro']];
    for (let n = 1; n <= raffle.total_numbers; n++) {
      const t = byNumber.get(n);
      const p = t ? participantById.get(t.participant_id) : undefined;
      rows.push([n, t ? STATUS_LABEL[t.status] : STATUS_LABEL.available, p?.name ?? null, p?.phone ?? null, t ? Number(t.amount_paid) : null, t ? formatDateTime(t.registered_at) : null]);
    }
    downloadFile(file('puestos', 'csv'), toCsv(rows));
    ui.toast('Puestos exportados');
  }

  function exportRaffle() {
    const rows: (string | number | null)[][] = [
      ['Campo', 'Valor'],
      ['Nombre', raffle.name],
      ['Enlace público', `/rifa/${raffle.slug}`],
      ['Descripción', raffle.description],
      ['Precio por puesto', raffle.price],
      ['Moneda', raffle.currency],
      ['Cantidad de puestos', raffle.total_numbers],
      ['Fecha del sorteo', raffle.draw_date ? formatDate(raffle.draw_date) : null],
      ['Hora del sorteo', formatTime(raffle.draw_time)],
      ['Premio', raffle.prize_name],
      ['Descripción del premio', raffle.prize_description],
      ['Imagen del premio', raffle.prize_image_url],
      ['Organizador', raffle.organizer_name],
      ['Contacto', raffle.contact_info],
      ['Reglas', raffle.rules],
      ['Estado', raffle.status === 'drawn' ? 'Sorteada' : raffle.status === 'closed' ? 'Cerrada' : 'Abierta'],
      ['Creada', formatDateTime(raffle.created_at)],
    ];
    downloadFile(file('informacion', 'csv'), toCsv(rows));
    ui.toast('Información de la rifa exportada');
  }

  function exportDraws() {
    const rows: (string | number | null)[][] = [['Fecha y hora', 'Número ganador', 'Ganador', 'Teléfono', 'Premio', 'Puestos habilitados', 'Incluyó reservados', 'Estado', 'Anulado el', 'Motivo de anulación']];
    for (const d of draws) {
      rows.push([
        formatDateTime(d.drawn_at),
        d.winning_number,
        d.winner_name,
        d.winner_phone,
        d.prize_name,
        d.eligible_numbers.length,
        d.include_reserved ? 'Sí' : 'No',
        d.voided_at ? 'Anulado' : 'Vigente',
        d.voided_at ? formatDateTime(d.voided_at) : null,
        d.void_reason,
      ]);
    }
    downloadFile(file('sorteos', 'csv'), toCsv(rows));
    ui.toast('Resultados del sorteo exportados');
  }

  async function exportFull() {
    const { data: audit, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('raffle_id', raffle.id)
      .order('id', { ascending: true })
      .limit(5000);
    if (error) return ui.toast(`No se pudo leer el historial: ${error.message}`, 'error');
    const backup = { exported_at: new Date().toISOString(), version: 1, raffle, participants, tickets, draws, audit_log: audit };
    downloadFile(file('respaldo-completo', 'json'), JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    ui.toast('Respaldo completo descargado');
  }

  const items = [
    { title: 'Participantes (CSV)', text: 'Una fila por persona: contacto, números, total pagado y pendiente.', action: exportParticipants },
    { title: 'Todos los puestos (CSV)', text: 'Una fila por número, del 1 al último, con su estado y dueño.', action: exportTickets },
    { title: 'Información de la rifa (CSV)', text: 'Nombre, precio, fecha, premio, organizador y reglas.', action: exportRaffle },
    { title: 'Resultados del sorteo (CSV)', text: 'Historial de sorteos con ganador, fecha y hora.', action: exportDraws },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Exportar y respaldar</h2>
        <p className="mt-1 text-sm text-slate-600">Los archivos se generan en tu dispositivo con los datos actuales de la base de datos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="card flex flex-col p-5">
            <h3 className="font-bold">{item.title}</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">{item.text}</p>
            <button type="button" className="btn btn-secondary btn-sm mt-4 self-start" onClick={item.action}>
              Descargar
            </button>
          </div>
        ))}
      </div>

      <div className="card border-brand-200 bg-brand-50/60 p-5">
        <h3 className="font-bold">Respaldo completo (JSON)</h3>
        <p className="mt-1 text-sm text-slate-700">
          Incluye la configuración, participantes, puestos, sorteos y el historial de cambios en un solo archivo. Guárdalo en tu correo o en Google Drive
          después de cada evento importante (por ejemplo, antes del sorteo).
        </p>
        <button type="button" className="btn btn-primary btn-sm mt-4" onClick={exportFull}>
          Descargar respaldo completo
        </button>
      </div>
    </div>
  );
}
