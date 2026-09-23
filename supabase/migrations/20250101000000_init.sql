-- =====================================================================
-- MIS RIFAS · Esquema inicial
--
-- Se puede ejecutar más de una vez sin borrar datos (todo es "if not exists"
-- o "create or replace"). NUNCA contiene DROP TABLE ni TRUNCATE.
-- Los cambios futuros se agregan como archivos NUEVOS en esta carpeta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.raffles (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete restrict,
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null check (char_length(btrim(name)) between 1 and 120),
  description       text,
  price             numeric(12,2) not null default 0 check (price >= 0),
  currency          text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  total_numbers     int not null default 100 check (total_numbers between 1 and 100),
  draw_date         date,
  draw_time         time,
  prize_name        text,
  prize_description text,
  prize_image_url   text,
  organizer_name    text,
  contact_info      text,
  rules             text,
  status            text not null default 'active' check (status in ('active', 'drawn', 'closed')),
  is_public         boolean not null default true,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.participants (
  id         uuid primary key default gen_random_uuid(),
  raffle_id  uuid not null references public.raffles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_id_raffle_unique unique (id, raffle_id)
);
create index if not exists participants_raffle_idx on public.participants (raffle_id);

-- Un puesto ocupado = una fila. Si no hay fila, el puesto está "disponible".
-- La restricción UNIQUE (raffle_id, number) es lo que garantiza, a nivel de
-- base de datos, que dos personas nunca tengan el mismo número.
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  raffle_id      uuid not null references public.raffles (id) on delete cascade,
  number         int not null check (number >= 1),
  participant_id uuid not null,
  status         text not null default 'reserved' check (status in ('reserved', 'paid', 'winner')),
  amount_paid    numeric(12,2) not null default 0 check (amount_paid >= 0),
  registered_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tickets_unique_number unique (raffle_id, number),
  -- el participante debe pertenecer a la misma rifa
  constraint tickets_participant_fk foreign key (participant_id, raffle_id)
    references public.participants (id, raffle_id) on delete cascade
);
create index if not exists tickets_participant_idx on public.tickets (participant_id);

create table if not exists public.draws (
  id               uuid primary key default gen_random_uuid(),
  raffle_id        uuid not null references public.raffles (id) on delete cascade,
  ticket_id        uuid,
  winning_number   int not null,
  participant_id   uuid,
  winner_name      text not null,
  winner_phone     text,
  prize_name       text,
  eligible_numbers int[] not null,
  include_reserved boolean not null default false,
  previous_status  text not null,
  drawn_at         timestamptz not null default now(),
  drawn_by         uuid,
  voided_at        timestamptz,
  void_reason      text
);
-- Solo puede existir UN sorteo vigente por rifa (los anulados quedan en el historial).
create unique index if not exists draws_one_active_per_raffle
  on public.draws (raffle_id) where voided_at is null;

-- Historial de cambios (lo llenan triggers automáticamente).
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  raffle_id  uuid,
  actor_id   uuid,
  table_name text not null,
  action     text not null,
  record_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_raffle_idx on public.audit_log (raffle_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. TRIGGERS DE INTEGRIDAD
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists raffles_updated_at on public.raffles;
create trigger raffles_updated_at before update on public.raffles
  for each row execute function public.set_updated_at();
drop trigger if exists participants_updated_at on public.participants;
create trigger participants_updated_at before update on public.participants
  for each row execute function public.set_updated_at();
drop trigger if exists tickets_updated_at on public.tickets;
create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

-- Reglas de los puestos:
--  * el número debe existir en la rifa (1..total_numbers)
--  * solo el sorteo puede crear/quitar el estado "winner"
--  * un puesto ganador no se puede editar ni borrar por accidente
create or replace function public.guard_tickets()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_draw_mode boolean := coalesce(current_setting('app.draw_mode', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status = 'winner' and not v_draw_mode then
      raise exception 'El puesto ganador está protegido. Si necesitas cambiarlo, anula el sorteo desde la sección Sorteo.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'winner' and not v_draw_mode then
      raise exception 'El puesto ganador está protegido. Si necesitas cambiarlo, anula el sorteo desde la sección Sorteo.';
    end if;
  end if;

  if new.status = 'winner' and not v_draw_mode then
    raise exception 'Solo el sorteo puede asignar un ganador.';
  end if;

  select total_numbers into v_total from public.raffles where id = new.raffle_id;
  if v_total is null then
    raise exception 'La rifa no existe.';
  end if;
  if new.number > v_total then
    raise exception 'El número % no existe en esta rifa (van del 1 al %).', new.number, v_total;
  end if;

  return new;
end $$;

drop trigger if exists tickets_guard on public.tickets;
create trigger tickets_guard before insert or update or delete on public.tickets
  for each row execute function public.guard_tickets();

create or replace function public.guard_raffles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'No se puede cambiar el propietario de la rifa.';
  end if;
  if new.total_numbers < old.total_numbers
     and exists (select 1 from public.tickets where raffle_id = new.id and number > new.total_numbers) then
    raise exception 'Hay números asignados por encima del %. Libéralos antes de reducir la cantidad de puestos.', new.total_numbers;
  end if;
  return new;
end $$;

drop trigger if exists raffles_guard on public.raffles;
create trigger raffles_guard before update on public.raffles
  for each row execute function public.guard_raffles();

-- Historial automático de cambios
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_raffle uuid;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  if tg_table_name = 'raffles' then
    v_raffle := (v_row ->> 'id')::uuid;
  else
    v_raffle := (v_row ->> 'raffle_id')::uuid;
  end if;

  insert into public.audit_log (raffle_id, actor_id, table_name, action, record_id, old_data, new_data)
  values (
    v_raffle,
    auth.uid(),
    tg_table_name,
    tg_op,
    (v_row ->> 'id')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

drop trigger if exists raffles_audit on public.raffles;
create trigger raffles_audit after insert or update or delete on public.raffles
  for each row execute function public.log_change();
drop trigger if exists participants_audit on public.participants;
create trigger participants_audit after insert or update or delete on public.participants
  for each row execute function public.log_change();
drop trigger if exists tickets_audit on public.tickets;
create trigger tickets_audit after insert or update or delete on public.tickets
  for each row execute function public.log_change();
drop trigger if exists draws_audit on public.draws;
create trigger draws_audit after insert or update or delete on public.draws
  for each row execute function public.log_change();

-- ---------------------------------------------------------------------
-- 3. SEGURIDAD (Row Level Security)
--    El público (anon) NO puede leer ni escribir tablas directamente.
--    Solo ve lo que expone get_public_raffle() (más abajo).
-- ---------------------------------------------------------------------

alter table public.raffles      enable row level security;
alter table public.participants enable row level security;
alter table public.tickets      enable row level security;
alter table public.draws        enable row level security;
alter table public.audit_log    enable row level security;

drop policy if exists raffles_owner_all on public.raffles;
create policy raffles_owner_all on public.raffles
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists participants_owner_all on public.participants;
create policy participants_owner_all on public.participants
  for all to authenticated
  using (exists (select 1 from public.raffles r where r.id = participants.raffle_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.raffles r where r.id = participants.raffle_id and r.owner_id = (select auth.uid())));

drop policy if exists tickets_owner_all on public.tickets;
create policy tickets_owner_all on public.tickets
  for all to authenticated
  using (exists (select 1 from public.raffles r where r.id = tickets.raffle_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.raffles r where r.id = tickets.raffle_id and r.owner_id = (select auth.uid())));

-- Sorteos e historial: solo lectura para el dueño. Se escriben únicamente
-- mediante las funciones run_draw() / void_draw() y los triggers.
drop policy if exists draws_owner_select on public.draws;
create policy draws_owner_select on public.draws
  for select to authenticated
  using (exists (select 1 from public.raffles r where r.id = draws.raffle_id and r.owner_id = (select auth.uid())));

drop policy if exists audit_owner_select on public.audit_log;
create policy audit_owner_select on public.audit_log
  for select to authenticated
  using (exists (select 1 from public.raffles r where r.id = audit_log.raffle_id and r.owner_id = (select auth.uid())));

-- Permisos de tabla (explícitos, funcionan igual en proyectos nuevos y viejos)
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.raffles, public.participants, public.tickets to authenticated;
grant select on public.draws, public.audit_log to authenticated;

-- ---------------------------------------------------------------------
-- 4. FUNCIONES DE LA APLICACIÓN
-- ---------------------------------------------------------------------

-- 4.1 Guardar participante + sus números en UNA sola transacción.
--     Si algún número ya está ocupado, no se guarda nada.
create or replace function public.save_participant(
  p_raffle_id      uuid,
  p_participant_id uuid,
  p_name           text,
  p_phone          text,
  p_notes          text,
  p_numbers        int[],
  p_new_status     text default 'reserved',
  p_new_amount     numeric default 0
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_participant uuid;
  v_taken int[];
  v_status text := coalesce(p_new_status, 'reserved');
  v_numbers int[] := coalesce(p_numbers, '{}');
begin
  if v_status not in ('reserved', 'paid') then
    raise exception 'Estado inválido.';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio.';
  end if;
  -- (con RLS, solo el dueño "ve" la rifa)
  if not exists (select 1 from public.raffles where id = p_raffle_id) then
    raise exception 'Rifa no encontrada.';
  end if;

  if p_participant_id is null then
    insert into public.participants (raffle_id, name, phone, notes)
    values (p_raffle_id, btrim(p_name), nullif(btrim(p_phone), ''), nullif(btrim(p_notes), ''))
    returning id into v_participant;
  else
    update public.participants
       set name = btrim(p_name), phone = nullif(btrim(p_phone), ''), notes = nullif(btrim(p_notes), '')
     where id = p_participant_id and raffle_id = p_raffle_id
    returning id into v_participant;
    if v_participant is null then
      raise exception 'Participante no encontrado.';
    end if;
    -- liberar los números que ya no están en la lista
    delete from public.tickets
     where participant_id = v_participant and not (number = any (v_numbers));
  end if;

  select coalesce(array_agg(t.number order by t.number), '{}') into v_taken
    from public.tickets t
   where t.raffle_id = p_raffle_id and t.number = any (v_numbers) and t.participant_id <> v_participant;

  if coalesce(array_length(v_taken, 1), 0) > 0 then
    raise exception 'Los números % ya están ocupados por otra persona.', array_to_string(v_taken, ', ')
      using errcode = '23505';
  end if;

  insert into public.tickets (raffle_id, number, participant_id, status, amount_paid)
  select p_raffle_id, n, v_participant, v_status, greatest(coalesce(p_new_amount, 0), 0)
    from (select distinct unnest(v_numbers) as n) s
   where not exists (
     select 1 from public.tickets t
      where t.raffle_id = p_raffle_id and t.number = s.n and t.participant_id = v_participant
   );

  return v_participant;
end $$;

-- 4.2 Sorteo. El ganador se elige DENTRO de la base de datos con aleatoriedad
--     criptográficamente segura (gen_random_uuid) y queda guardado en la misma
--     transacción. La animación del navegador es solo visual.
create or replace function public.run_draw(p_raffle_id uuid, p_include_reserved boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_raffle public.raffles%rowtype;
  v_eligible int[];
  v_ticket public.tickets%rowtype;
  v_person public.participants%rowtype;
  v_draw public.draws%rowtype;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;

  select * into v_raffle from public.raffles where id = p_raffle_id and owner_id = v_uid for update;
  if not found then raise exception 'Rifa no encontrada.'; end if;

  if exists (select 1 from public.draws where raffle_id = p_raffle_id and voided_at is null) then
    raise exception 'Esta rifa ya tiene un sorteo realizado. Para repetirlo, primero debes anularlo.';
  end if;

  select coalesce(array_agg(number order by number), '{}') into v_eligible
    from public.tickets
   where raffle_id = p_raffle_id
     and (status = 'paid' or (p_include_reserved and status = 'reserved'));

  if coalesce(array_length(v_eligible, 1), 0) = 0 then
    raise exception 'No hay puestos habilitados para participar en el sorteo.';
  end if;

  select * into v_ticket from public.tickets
   where raffle_id = p_raffle_id and number = any (v_eligible)
   order by gen_random_uuid()
   limit 1;

  select * into v_person from public.participants where id = v_ticket.participant_id;

  perform set_config('app.draw_mode', 'on', true);
  update public.tickets set status = 'winner' where id = v_ticket.id;

  insert into public.draws (raffle_id, ticket_id, winning_number, participant_id, winner_name, winner_phone,
                            prize_name, eligible_numbers, include_reserved, previous_status, drawn_by)
  values (p_raffle_id, v_ticket.id, v_ticket.number, v_person.id, v_person.name, v_person.phone,
          v_raffle.prize_name, v_eligible, p_include_reserved, v_ticket.status, v_uid)
  returning * into v_draw;

  update public.raffles set status = 'drawn' where id = p_raffle_id;
  perform set_config('app.draw_mode', 'off', true);

  return to_jsonb(v_draw);
end $$;

-- 4.3 Anular un sorteo (acción deliberada, exige motivo y queda en el historial).
create or replace function public.void_draw(p_raffle_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_draw public.draws%rowtype;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;

  select d.* into v_draw
    from public.draws d
    join public.raffles r on r.id = d.raffle_id
   where d.raffle_id = p_raffle_id and d.voided_at is null and r.owner_id = v_uid
   for update of d;
  if not found then raise exception 'No hay un sorteo vigente para anular.'; end if;

  perform set_config('app.draw_mode', 'on', true);
  update public.tickets set status = v_draw.previous_status where id = v_draw.ticket_id and status = 'winner';
  update public.draws set voided_at = now(), void_reason = btrim(p_reason) where id = v_draw.id;
  update public.raffles set status = 'active' where id = p_raffle_id;
  perform set_config('app.draw_mode', 'off', true);
end $$;

-- 4.4 Borrar una rifa completa (con todo lo que contiene).
create or replace function public.delete_raffle(p_raffle_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from public.raffles where id = p_raffle_id and owner_id = v_uid) then
    raise exception 'Rifa no encontrada.';
  end if;
  perform set_config('app.draw_mode', 'on', true);
  delete from public.raffles where id = p_raffle_id and owner_id = v_uid;
  delete from public.audit_log where raffle_id = p_raffle_id;
  perform set_config('app.draw_mode', 'off', true);
end $$;

-- 4.5 Datos de ejemplo: crea una rifa de prueba con 100 puestos y ~24 ocupados.
create or replace function public.create_demo_raffle()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_raffle uuid;
  v_slug text := 'rifa-de-prueba';
  v_pid uuid;
  i int;
  v_names text[] := array[
    'María Fernanda Rojas', 'Carlos Andrés Gómez', 'Luz Marina Pérez', 'Juan Camilo Torres',
    'Diana Carolina Ruiz', 'Andrés Felipe Castro', 'Paola Andrea Ríos', 'Jorge Iván Méndez',
    'Sandra Milena Vargas', 'Óscar Eduardo Salazar', 'Natalia Herrera', 'Felipe Ortiz'
  ];
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;

  if exists (select 1 from public.raffles where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.raffles (owner_id, slug, name, description, price, currency, total_numbers,
                              draw_date, draw_time, prize_name, prize_description,
                              organizer_name, contact_info, rules, is_demo)
  values (v_uid, v_slug, 'Rifa de prueba',
          'Esta es una rifa de ejemplo para que pruebes la aplicación. Puedes borrarla cuando quieras.',
          10000, 'COP', 100, current_date + 30, '20:00',
          'Televisor 50" 4K',
          'Televisor Smart TV de 50 pulgadas, nuevo y con garantía.',
          'Organizador de prueba', E'WhatsApp: 300 000 0000',
          E'1. El sorteo se realiza en la fecha indicada.\n2. Solo participan los puestos pagados.\n3. El premio se entrega personalmente al ganador.',
          true)
  returning id into v_raffle;

  for i in 1 .. array_length(v_names, 1) loop
    insert into public.participants (raffle_id, name, phone)
    values (v_raffle, v_names[i], '300' || lpad((1000000 + i * 7919)::text, 7, '0'))
    returning id into v_pid;

    insert into public.tickets (raffle_id, number, participant_id, status, amount_paid) values
      (v_raffle, i * 8 - 7, v_pid, case when i % 3 = 0 then 'reserved' else 'paid' end,
                                   case when i % 3 = 0 then 0 else 10000 end),
      (v_raffle, i * 8 - 3, v_pid, case when i % 2 = 0 then 'paid' else 'reserved' end,
                                   case when i % 2 = 0 then 10000 else 0 end);
  end loop;

  return v_raffle;
end $$;

-- 4.6 Borrar TODAS las rifas de prueba del usuario de un solo clic.
create or replace function public.delete_demo_data()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  perform set_config('app.draw_mode', 'on', true);
  for v_id in select id from public.raffles where owner_id = v_uid and is_demo loop
    delete from public.raffles where id = v_id;
    delete from public.audit_log where raffle_id = v_id;
    v_count := v_count + 1;
  end loop;
  perform set_config('app.draw_mode', 'off', true);
  return v_count;
end $$;

-- 4.7 Lo ÚNICO que ve el público: datos de la rifa + estado de cada número.
--     Nunca incluye teléfonos, observaciones ni pagos.
create or replace function public.get_public_raffle(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.raffles%rowtype;
  v_tickets jsonb;
  v_winner jsonb;
begin
  select * into r from public.raffles where slug = lower(p_slug) and is_public;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('n', number, 's', status) order by number), '[]'::jsonb)
    into v_tickets
    from public.tickets where raffle_id = r.id;

  select jsonb_build_object('number', d.winning_number, 'name', d.winner_name, 'drawn_at', d.drawn_at)
    into v_winner
    from public.draws d where d.raffle_id = r.id and d.voided_at is null;

  return jsonb_build_object(
    'name', r.name,
    'slug', r.slug,
    'description', r.description,
    'price', r.price,
    'currency', r.currency,
    'total_numbers', r.total_numbers,
    'draw_date', r.draw_date,
    'draw_time', r.draw_time,
    'prize_name', r.prize_name,
    'prize_description', r.prize_description,
    'prize_image_url', r.prize_image_url,
    'organizer_name', r.organizer_name,
    'contact_info', r.contact_info,
    'rules', r.rules,
    'status', r.status,
    'tickets', v_tickets,
    'winner', v_winner
  );
end $$;

-- 4.8 "Latido": evita que Supabase pause el proyecto gratis por inactividad.
create or replace function public.ping()
returns timestamptz
language sql stable as $$ select now() $$;

-- Permisos de ejecución
revoke all on function public.save_participant(uuid, uuid, text, text, text, int[], text, numeric) from public, anon;
revoke all on function public.run_draw(uuid, boolean) from public, anon;
revoke all on function public.void_draw(uuid, text) from public, anon;
revoke all on function public.delete_raffle(uuid) from public, anon;
revoke all on function public.create_demo_raffle() from public, anon;
revoke all on function public.delete_demo_data() from public, anon;
grant execute on function public.save_participant(uuid, uuid, text, text, text, int[], text, numeric) to authenticated;
grant execute on function public.run_draw(uuid, boolean) to authenticated;
grant execute on function public.void_draw(uuid, text) to authenticated;
grant execute on function public.delete_raffle(uuid) to authenticated;
grant execute on function public.create_demo_raffle() to authenticated;
grant execute on function public.delete_demo_data() to authenticated;
grant execute on function public.get_public_raffle(text) to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. ALMACENAMIENTO DE IMÁGENES DEL PREMIO
--    Bucket público (cualquiera puede VER la imagen), pero solo el
--    administrador autenticado puede subir o borrar, y solo en su carpeta.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prize-images', 'prize-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists prize_images_insert_own on storage.objects;
create policy prize_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prize-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists prize_images_delete_own on storage.objects;
create policy prize_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'prize-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
