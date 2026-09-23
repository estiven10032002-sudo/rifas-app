import { TIMEZONE } from './config';
import type { TicketStatus } from './types';

export function formatMoney(value: number | null | undefined, currency = 'COP'): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('es-CO')}`;
  }
}

/** Recibe "2026-10-25" y lo muestra sin corrimientos de zona horaria. */
export function formatDate(date: string | null | undefined, long = true): string {
  if (!date) return 'Por definir';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' }
  ).format(new Date(y, m - 1, d));
}

/** Recibe "20:00:00" y muestra "8:00 p. m." */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const [h, mi] = time.split(':').map(Number);
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(2000, 0, 1, h, mi));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIMEZONE }).format(new Date(iso));
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Minúsculas y sin tildes, para buscar. */
export function normalize(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export const STATUS_LABEL: Record<TicketStatus | 'available', string> = {
  available: 'Disponible',
  reserved: 'Reservado',
  paid: 'Pagado',
  winner: 'Ganador',
};

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Enlace de WhatsApp. Si el número tiene 10 dígitos se asume Colombia (+57). */
export function whatsappLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}`;
}
