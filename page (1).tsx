'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useRaffle } from '@/components/raffle-context';
import { friendlyError } from '@/components/raffle-modals';
import { useUI } from '@/components/ui';
import { CURRENCIES, MAX_NUMBERS } from '@/lib/config';
import { slugify } from '@/lib/format';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export default function SettingsPage() {
  const { supabase, raffle, tickets, reload } = useRaffle();
  const ui = useUI();
  const router = useRouter();

  const [f, setF] = useState({
    name: raffle.name,
    slug: raffle.slug,
    description: raffle.description ?? '',
    price: String(raffle.price),
    currency: raffle.currency,
    total_numbers: String(raffle.total_numbers),
    draw_date: raffle.draw_date ?? '',
    draw_time: raffle.draw_time?.slice(0, 5) ?? '',
    prize_name: raffle.prize_name ?? '',
    prize_description: raffle.prize_description ?? '',
    prize_image_url: raffle.prize_image_url ?? '',
    organizer_name: raffle.organizer_name ?? '',
    contact_info: raffle.contact_info ?? '',
    rules: raffle.rules ?? '',
    status: raffle.status === 'closed' ? 'closed' : 'active',
    is_public: raffle.is_public,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const highestTaken = tickets.reduce((m, t) => Math.max(m, t.number), 0);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function uploadImage(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return ui.toast('Usa una imagen JPG, PNG o WebP.', 'error');
    if (file.size > MAX_IMAGE_BYTES) return ui.toast('La imagen pesa más de 3 MB. Usa una más liviana.', 'error');
    setUploading(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${raffle.owner_id}/${raffle.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('prize-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) {
      setUploading(false);
      return ui.toast(`No se pudo subir la imagen: ${error.message}`, 'error');
    }
    const { data } = supabase.storage.from('prize-images').getPublicUrl(path);
    set('prize_image_url', data.publicUrl);
    setUploading(false);
    ui.toast('Imagen subida. Guarda los cambios para publicarla.');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const total = Number(f.total_numbers);
    const price = Number(f.price.replace(/[^\d.]/g, ''));
    const slug = slugify(f.slug);
    if (!f.name.trim()) return ui.toast('El nombre de la rifa es obligatorio.', 'error');
    if (!slug) return ui.toast('El enlace de la rifa no es válido.', 'error');
    if (!Number.isInteger(total) || total < 1 || total > MAX_NUMBERS) return ui.toast(`La cantidad de puestos debe estar entre 1 y ${MAX_NUMBERS}.`, 'error');
    if (total < highestTaken) return ui.toast(`Hay números asignados hasta el ${highestTaken}. Libéralos antes de reducir los puestos.`, 'error');
    if (Number.isNaN(price) || price < 0) return ui.toast('El precio no es válido.', 'error');

    setSaving(true);
    const { error } = await supabase
      .from('raffles')
      .update({
        name: f.name.trim(),
        slug,
        description: f.description.trim() || null,
        price,
        currency: f.currency,
        total_numbers: total,
        draw_date: f.draw_date || null,
        draw_time: f.draw_time || null,
        prize_name: f.prize_name.trim() || null,
        prize_description: f.prize_description.trim() || null,
        prize_image_url: f.prize_image_url || null,
        organizer_name: f.organizer_name.trim() || null,
        contact_info: f.contact_info.trim() || null,
        rules: f.rules.trim() || null,
        // si ya se sorteó, el estado lo maneja el sorteo
        ...(raffle.status === 'drawn' ? {} : { status: f.status }),
        is_public: f.is_public,
      })
      .eq('id', raffle.id);
    setSaving(false);
    if (error) {
      return ui.toast(error.code === '23505' ? 'Ese enlace ya lo usa otra rifa. Elige otro.' : friendlyError(error), 'error');
    }
    set('slug', slug);
    await reload();
    ui.toast('Cambios guardados');
  }

  async function deleteRaffle() {
    const ok = await ui.confirm({
      title: '¿Eliminar esta rifa?',
      message: (
        <>
          Se borrarán la rifa, sus participantes, números, sorteos e historial. <strong>No se puede deshacer.</strong> Antes de continuar, descarga un respaldo en la pestaña Respaldo.
        </>
      ),
      confirmText: 'Eliminar rifa',
      danger: true,
      requireText: 'ELIMINAR',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('delete_raffle', { p_raffle_id: raffle.id });
    if (error) return ui.toast(friendlyError(error), 'error');
    ui.toast('Rifa eliminada');
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="La rifa">
        <Field label="Nombre de la rifa" id="name">
          <input id="name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Descripción" id="description">
          <textarea id="description" className="input min-h-[5.5rem]" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio de cada puesto" id="price">
            <input id="price" className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Moneda" id="currency">
            <select id="currency" className="input" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              {(CURRENCIES.includes(f.currency) ? CURRENCIES : [f.currency, ...CURRENCIES]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad de puestos" id="total" hint={`De 1 a ${MAX_NUMBERS}`}>
            <input id="total" className="input" inputMode="numeric" value={f.total_numbers} onChange={(e) => set('total_numbers', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha del sorteo" id="date">
            <input id="date" type="date" className="input" value={f.draw_date} onChange={(e) => set('draw_date', e.target.value)} />
          </Field>
          <Field label="Hora del sorteo" id="time">
            <input id="time" type="time" className="input" value={f.draw_time} onChange={(e) => set('draw_time', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Premio">
        <Field label="Premio ganador" id="prize">
          <input id="prize" className="input" value={f.prize_name} onChange={(e) => set('prize_name', e.target.value)} placeholder="Ej: Moto Yamaha 2026" />
        </Field>
        <Field label="Descripción del premio" id="prize-desc">
          <textarea id="prize-desc" className="input min-h-[5rem]" value={f.prize_description} onChange={(e) => set('prize_description', e.target.value)} />
        </Field>
        <div>
          <p className="label">Imagen del premio</p>
          {f.prize_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.prize_image_url} alt="Vista previa del premio" className="mb-3 aspect-[4/3] w-full max-w-xs rounded-2xl border border-slate-200 object-cover" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`btn btn-secondary btn-sm cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Subiendo…' : f.prize_image_url ? 'Cambiar imagen' : 'Subir imagen'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) uploadImage(file);
                }}
              />
            </label>
            {f.prize_image_url && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => set('prize_image_url', '')}>
                Quitar
              </button>
            )}
          </div>
          <p className="hint">JPG, PNG o WebP de hasta 3 MB.</p>
        </div>
      </Section>

      <Section title="Organizador">
        <Field label="Nombre del organizador" id="org">
          <input id="org" className="input" value={f.organizer_name} onChange={(e) => set('organizer_name', e.target.value)} />
        </Field>
        <Field label="Información de contacto" id="contact" hint="Se muestra en la página pública. Si incluyes un celular, aparece un botón de WhatsApp.">
          <textarea id="contact" className="input min-h-[4.5rem]" value={f.contact_info} onChange={(e) => set('contact_info', e.target.value)} placeholder="WhatsApp: 300 123 4567" />
        </Field>
        <Field label="Reglas o condiciones" id="rules">
          <textarea id="rules" className="input min-h-[7rem]" value={f.rules} onChange={(e) => set('rules', e.target.value)} />
        </Field>
      </Section>

      <Section title="Publicación">
        <Field label="Enlace de la rifa" id="slug" hint={`Quedará así: ${origin}/rifa/${slugify(f.slug) || '…'}`}>
          <input id="slug" className="input" value={f.slug} onChange={(e) => set('slug', e.target.value)} autoCapitalize="none" />
        </Field>
        {slugify(f.slug) !== raffle.slug && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Si cambias el enlace, el anterior dejará de funcionar. Avisa a quienes ya lo recibieron.
          </p>
        )}
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.is_public} onChange={(e) => set('is_public', e.target.checked)} />
          <span>
            <strong>Página pública visible</strong>
            <span className="block text-slate-500">Si la desactivas, quien tenga el enlace verá “no encontrada”.</span>
          </span>
        </label>
        {raffle.status !== 'drawn' && (
          <Field label="Estado de la rifa" id="status">
            <select id="status" className="input sm:max-w-xs" value={f.status} onChange={(e) => set('status', e.target.value as 'active' | 'closed')}>
              <option value="active">Abierta</option>
              <option value="closed">Cerrada (ya no se venden números)</option>
            </select>
          </Field>
        )}
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" disabled={saving} className="btn btn-primary w-full sm:w-auto sm:px-10">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <h2 className="text-lg font-bold text-red-800">Zona de peligro</h2>
        <p className="mt-1 text-sm text-slate-600">Eliminar la rifa borra también sus participantes, números, sorteos e historial.</p>
        <button type="button" className="btn btn-danger mt-3" onClick={deleteRaffle}>
          Eliminar esta rifa
        </button>
      </section>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
