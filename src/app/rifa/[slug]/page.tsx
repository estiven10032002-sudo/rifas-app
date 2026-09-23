import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Board, Legend, type CellState } from '@/components/board';
import { AutoRefresh } from '@/components/auto-refresh';
import { formatDate, formatDateTime, formatMoney, formatTime, whatsappLink } from '@/lib/format';
import type { PublicRaffle } from '@/lib/types';

export const dynamic = 'force-dynamic';

const getRaffle = cache(async (slug: string): Promise<PublicRaffle | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },global:{feach:input,init)=>fetch(input,{...(init??{}),cahce:'no-store'}),},});
  const { data, error } = await supabase.rpc('get_public_raffle', { p_slug: slug });
  if (error || !data) return null;
  return data as PublicRaffle;
});

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const raffle = await getRaffle(params.slug);
  if (!raffle) return { title: 'Rifa no encontrada' };
  const desc = raffle.prize_name
    ? `Premio: ${raffle.prize_name}. ${formatMoney(raffle.price, raffle.currency)} por puesto.`
    : raffle.description ?? undefined;
  return {
    title: raffle.name,
    description: desc,
    openGraph: { title: raffle.name, description: desc, images: raffle.prize_image_url ? [raffle.prize_image_url] : undefined },
  };
}

export default async function PublicRafflePage({ params }: { params: { slug: string } }) {
  const raffle = await getRaffle(params.slug);
  if (!raffle) notFound();

  const byNumber = new Map(raffle.tickets.map((t) => [t.n, t.s]));
  const taken = raffle.tickets.length;
  const available = raffle.total_numbers - taken;
  const phoneInContact = raffle.contact_info?.match(/\+?\d[\d\s().-]{6,}\d/)?.[0] ?? null;
  const wa = whatsappLink(phoneInContact);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <AutoRefresh seconds={30} />

      <section className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
        <div className="overflow-hidden rounded-3xl bg-ink shadow-lg">
          {raffle.prize_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={raffle.prize_image_url} alt={raffle.prize_name ?? raffle.name} className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-brand-700 to-ink text-7xl font-black text-white/25">
              #
            </div>
          )}
        </div>

        <div>
          {raffle.status === 'drawn' && (
            <p className="mb-3 inline-block rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-950">Sorteo realizado</p>
          )}
          {raffle.status === 'closed' && (
            <p className="mb-3 inline-block rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">Rifa cerrada</p>
          )}
          <h1 className="text-4xl font-black leading-[1.05] sm:text-5xl">{raffle.name}</h1>
          {raffle.prize_name && <p className="mt-3 text-xl font-bold text-brand-700">{raffle.prize_name}</p>}
          {raffle.prize_description && <p className="mt-2 whitespace-pre-line text-slate-600">{raffle.prize_description}</p>}
          {raffle.description && <p className="mt-3 whitespace-pre-line text-slate-600">{raffle.description}</p>}

          <div className="stub mt-6 grid grid-cols-2 divide-x-2 divide-dashed divide-white/25 rounded-2xl bg-ink text-white">
            <div className="px-5 py-4">
              <p className="text-xs text-white/60">Valor por puesto</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{formatMoney(raffle.price, raffle.currency)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-white/60">Sorteo</p>
              <p className="mt-1 text-base font-bold capitalize leading-snug">{formatDate(raffle.draw_date, false)}</p>
              {raffle.draw_time && <p className="text-sm text-white/80">{formatTime(raffle.draw_time)}</p>}
            </div>
          </div>
        </div>
      </section>

      {raffle.winner && (
        <section className="mt-8 rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-yellow-100 to-amber-200 p-6 text-center shadow-md">
          <p className="text-sm font-bold text-amber-900">¡Tenemos ganador!</p>
          <p className="mt-1 text-6xl font-black tabular-nums text-amber-950">#{raffle.winner.number}</p>
          <p className="mt-2 text-xl font-bold text-amber-950">{raffle.winner.name}</p>
          {raffle.prize_name && <p className="text-amber-900">Premio: {raffle.prize_name}</p>}
          <p className="mt-1 text-sm text-amber-900/80">Sorteo del {formatDateTime(raffle.winner.drawn_at)}</p>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-black">Tablero de números</h2>
            <p className="text-sm text-slate-600">
              {available > 0 ? (
                <>
                  <strong>{available}</strong> de {raffle.total_numbers} puestos disponibles
                </>
              ) : (
                'Todos los puestos están ocupados'
              )}
            </p>
          </div>
          <Legend />
        </div>
        <div className="card p-3 sm:p-5">
          <Board
            total={raffle.total_numbers}
            getCell={(n) => {
              const s = byNumber.get(n);
              return { state: (s ?? 'available') as CellState };
            }}
          />
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-bold">¿Cómo participar?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Escríbele al organizador, dile qué número quieres y confirma tu pago. Tu puesto aparecerá en el tablero.
          </p>
          {raffle.organizer_name && <p className="mt-3 text-sm font-semibold">Organiza: {raffle.organizer_name}</p>}
          {raffle.contact_info && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{raffle.contact_info}</p>}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-4">
              Escribir por WhatsApp
            </a>
          )}
        </div>
        {raffle.rules && (
          <div className="card p-5">
            <h2 className="text-lg font-bold">Reglas y condiciones</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{raffle.rules}</p>
          </div>
        )}
      </section>

      <p className="mt-10 text-center text-xs text-slate-400">El tablero se actualiza solo cada 30 segundos.</p>
    </main>
  );
}
