'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RaffleProvider, useRaffle } from './raffle-context';
import { useUI } from './ui';
import { formatDate } from '@/lib/format';

const TABS = [
  { href: '', label: 'Resumen' },
  { href: '/participantes', label: 'Participantes' },
  { href: '/sorteo', label: 'Sorteo' },
  { href: '/configuracion', label: 'Configuración' },
  { href: '/historial', label: 'Historial' },
  { href: '/respaldo', label: 'Respaldo' },
];

export function RaffleShell({ id, children }: { id: string; children: ReactNode }) {
  return (
    <RaffleProvider raffleId={id}>
      <ShellInner id={id}>{children}</ShellInner>
    </RaffleProvider>
  );
}

function ShellInner({ id, children }: { id: string; children: ReactNode }) {
  const { raffle } = useRaffle();
  const pathname = usePathname();
  const ui = useUI();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const base = `/admin/rifas/${id}`;
  const publicUrl = `${origin}/rifa/${raffle.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      ui.toast('Enlace copiado');
    } catch {
      ui.toast('No se pudo copiar. Cópialo manualmente: ' + publicUrl, 'error');
    }
  }

  return (
    <div>
      <Link href="/admin" className="text-sm font-semibold text-slate-500 hover:text-ink">
        ← Mis rifas
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black sm:text-3xl">{raffle.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {raffle.is_demo && <span className="chip border-violet-300 bg-violet-50 text-violet-800">Rifa de prueba</span>}
            {raffle.status === 'drawn' && <span className="chip border-amber-400 bg-amber-100 text-amber-900">Sorteo realizado</span>}
            {raffle.status === 'closed' && <span className="chip border-slate-300 bg-slate-100 text-slate-700">Cerrada</span>}
            {!raffle.is_public && <span className="chip border-slate-300 bg-slate-100 text-slate-700">Página oculta</span>}
            <span>Sorteo: {formatDate(raffle.draw_date, false)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/rifa/${raffle.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            Ver página pública
          </a>
          <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
            Copiar enlace
          </button>
        </div>
      </div>

      <nav className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Secciones de la rifa">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {TABS.map((tab) => {
            const href = base + tab.href;
            const active = pathname === href;
            return (
              <li key={tab.href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`-mb-px block border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
                    active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
