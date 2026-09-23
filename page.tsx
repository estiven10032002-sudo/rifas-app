'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ErrorBox, Modal, Spinner, useUI } from '@/components/ui';
import { friendlyError } from '@/components/raffle-modals';
import { formatDate, formatMoney, slugify } from '@/lib/format';
import type { Raffle } from '@/lib/types';

export default function AdminHome() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const ui = useUI();
  const [raffles, setRaffles] = useState<Raffle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('raffles').select('*').order('created_at', { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRaffles((data ?? []) as Raffle[]);
    }
  }, [supabase]);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  async function createDemo() {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('create_demo_raffle');
    setBusy(false);
    if (err) return ui.toast(friendlyError(err), 'error');
    ui.toast('Rifa de prueba creada');
    router.push(`/admin/rifas/${data as string}`);
  }

  async function deleteDemo() {
    const ok = await ui.confirm({
      title: '¿Borrar los datos de prueba?',
      message: 'Se eliminarán las rifas marcadas como “de prueba” con todos sus participantes y números. Tus rifas reales no se tocan.',
      confirmText: 'Borrar datos de prueba',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('delete_demo_data');
    setBusy(false);
    if (err) return ui.toast(friendlyError(err), 'error');
    ui.toast('Datos de prueba eliminados');
    load();
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(`${origin}/rifa/${slug}`);
      ui.toast('Enlace copiado');
    } catch {
      ui.toast('No se pudo copiar el enlace.', 'error');
    }
  }

  const hasDemo = raffles?.some((r) => r.is_demo) ?? false;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Mis rifas</h1>
          <p className="mt-1 text-sm text-slate-600">Crea una rifa, comparte su enlace y administra los números.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Nueva rifa
        </button>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBox>
            No se pudieron cargar tus rifas: {error}. Si acabas de configurar el proyecto, revisa que ejecutaste el archivo SQL de la carpeta supabase/migrations.
          </ErrorBox>
        </div>
      )}
      {!raffles && !error && <Spinner />}

      {raffles && raffles.length === 0 && (
        <div className="card mt-8 p-8 text-center">
          <p className="text-lg font-bold">Aún no tienes rifas</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            Crea tu primera rifa o carga una de prueba con 100 puestos y participantes de ejemplo para explorar la aplicación.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Crear mi rifa
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={createDemo}>
              Cargar rifa de prueba
            </button>
          </div>
        </div>
      )}

      {raffles && raffles.length > 0 && (
        <>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {raffles.map((r) => (
              <li key={r.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-snug">{r.name}</h2>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {r.is_demo && <span className="chip border-violet-300 bg-violet-50 text-violet-800">Prueba</span>}
                    {r.status === 'drawn' && <span className="chip border-amber-400 bg-amber-100 text-amber-900">Sorteada</span>}
                    {r.status === 'closed' && <span className="chip border-slate-300 bg-slate-100 text-slate-700">Cerrada</span>}
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {formatMoney(r.price, r.currency)} por puesto · {r.total_numbers} puestos
                </p>
                <p className="text-sm text-slate-600">Sorteo: {formatDate(r.draw_date, false)}</p>
                <p className="mt-2 truncate text-xs text-slate-400">/rifa/{r.slug}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/rifas/${r.id}`} className="btn btn-primary btn-sm">
                    Administrar
                  </Link>
                  <a href={`/rifa/${r.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    Ver pública
                  </a>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyLink(r.slug)}>
                    Copiar enlace
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            {hasDemo ? (
              <>
                <span className="flex-1">Tienes datos de prueba. Cuando termines de explorar, bórralos y empieza con tu rifa real.</span>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={deleteDemo}>
                  Borrar datos de prueba
                </button>
              </>
            ) : (
              <>
                <span className="flex-1">¿Quieres explorar la aplicación con datos de ejemplo?</span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={createDemo}>
                  Cargar rifa de prueba
                </button>
              </>
            )}
          </div>
        </>
      )}

      {creating && <NewRaffleModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewRaffleModal({ onClose }: { onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const ui = useUI();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('10000');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return ui.toast('Ponle un nombre a la rifa.', 'error');
    setBusy(true);
    const base = slugify(name) || 'rifa';
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('raffles')
        .insert({ name: name.trim(), slug, price: Number(price.replace(/[^\d.]/g, '')) || 0 })
        .select('id')
        .single();
      if (!error && data) {
        ui.toast('Rifa creada. Completa los datos del premio y del sorteo.');
        router.push(`/admin/rifas/${data.id}/configuracion`);
        return;
      }
      if (error?.code !== '23505') {
        setBusy(false);
        return ui.toast(friendlyError(error), 'error');
      }
    }
    setBusy(false);
    ui.toast('No se pudo crear un enlace único. Intenta con otro nombre.', 'error');
  }

  return (
    <Modal title="Nueva rifa" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="n-name">Nombre de la rifa</label>
          <input id="n-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Gran rifa del televisor" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="n-price">Precio de cada puesto (COP)</label>
          <input id="n-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          <p className="hint">Tendrá 100 puestos. Luego puedes cambiar todo en Configuración.</p>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? 'Creando…' : 'Crear rifa'}
        </button>
      </form>
    </Modal>
  );
}
