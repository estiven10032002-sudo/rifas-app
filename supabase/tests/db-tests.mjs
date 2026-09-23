import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

const db = new PGlite();
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✔', msg); } else { fail++; console.log('  ✘ FAIL:', msg); } };

async function as(role, uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); ${role === 'postgres' ? '' : `set role ${role};`}`);
}
async function q(sql, params) { return db.query(sql, params); }
async function fails(sql, params, match) {
  try { await q(sql, params); return false; } catch (e) { return match ? String(e.message).match(match) || e.code === match : true; }
}

// --- stubs de Supabase ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  grant usage on schema auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');
`);

const sql = fs.readFileSync(path.join(here, '../migrations/20250101000000_init.sql'), 'utf8');
console.log('1. Migración');
await db.exec(sql);
ok(true, 'se ejecuta sin errores');
await db.exec(sql);
ok(true, 'se puede ejecutar por segunda vez (idempotente)');

console.log('2. Datos de prueba');
await as('authenticated', A);
const demo = (await q('select public.create_demo_raffle() as id')).rows[0].id;
ok(!!demo, 'create_demo_raffle devuelve id');
let r = (await q('select count(*)::int c from tickets where raffle_id=$1', [demo])).rows[0].c;
ok(r === 24, `24 puestos ocupados (${r})`);
r = (await q('select count(*)::int c from participants where raffle_id=$1', [demo])).rows[0].c;
ok(r === 12, `12 participantes (${r})`);
const slug = (await q('select slug from raffles where id=$1', [demo])).rows[0].slug;

console.log('3. Seguridad para el público (anon)');
await as('anon', '');
const pub = (await q('select public.get_public_raffle($1) as d', [slug])).rows[0].d;
ok(pub && pub.tickets.length === 24 && pub.total_numbers === 100, 'anon ve la rifa pública con 24 números ocupados');
ok(!JSON.stringify(pub).includes('phone') && !JSON.stringify(pub).includes('María'), 'la respuesta pública no incluye teléfonos ni nombres');
ok(await fails('select * from tickets'), 'anon NO puede leer tickets');
ok(await fails('select * from participants'), 'anon NO puede leer participantes');
ok(await fails('select * from raffles'), 'anon NO puede leer rifas directamente');
ok(await fails(`insert into tickets(raffle_id, number, participant_id) values ('${demo}', 99, gen_random_uuid())`), 'anon NO puede insertar tickets');
ok(await fails(`select public.run_draw('${demo}')`), 'anon NO puede ejecutar run_draw');
ok(await fails(`select public.create_demo_raffle()`), 'anon NO puede crear rifa demo');
ok((await q('select public.get_public_raffle($1) as d', ['no-existe'])).rows[0].d === null, 'slug inexistente devuelve null');

console.log('4. Aislamiento entre usuarios (RLS)');
await as('authenticated', B);
ok((await q('select count(*)::int c from raffles')).rows[0].c === 0, 'usuario B no ve rifas de A');
ok((await q('select count(*)::int c from tickets')).rows[0].c === 0, 'usuario B no ve tickets de A');
ok(await fails(`select public.run_draw('${demo}')`, [], /no encontrada/i), 'usuario B no puede sortear la rifa de A');
ok(await fails(`select public.save_participant('${demo}', null, 'X', null, null, array[2], 'reserved', 0)`, [], /no encontrada/i), 'usuario B no puede agregar participantes a la rifa de A');
ok(await fails(`select public.delete_raffle('${demo}')`, [], /no encontrada/i), 'usuario B no puede borrar la rifa de A');

console.log('5. Números únicos');
await as('authenticated', A);
ok(await fails(`select public.save_participant('${demo}', null, 'Intruso', null, null, array[1, 2], 'reserved', 0)`, [], /ocupados/), 'no permite asignar un número ya ocupado (1)');
ok((await q(`select count(*)::int c from participants where name='Intruso'`)).rows[0].c === 0, 'la transacción falló completa: no quedó participante huérfano');
ok((await q(`select count(*)::int c from tickets where raffle_id=$1 and number=2`, [demo])).rows[0].c === 0, 'el número libre (2) tampoco quedó asignado');
const newP = (await q(`select public.save_participant('${demo}', null, '  Pedro Nuevo ', ' 3001112222 ', 'obs', array[2, 4, 4], 'paid', 10000) as id`)).rows[0].id;
ok((await q(`select count(*)::int c from tickets where participant_id=$1`, [newP])).rows[0].c === 2, 'asigna varios números a una persona (dedup)');
ok((await q(`select name from participants where id=$1`, [newP])).rows[0].name === 'Pedro Nuevo', 'recorta espacios del nombre');
ok(await fails(`insert into tickets(raffle_id, number, participant_id) values ('${demo}', 2, '${newP}')`, [], /tickets_unique_number/), 'UNIQUE(raffle_id, number) bloquea duplicados directos');
ok(await fails(`insert into tickets(raffle_id, number, participant_id) values ('${demo}', 101, '${newP}')`, [], /no existe en esta rifa/), 'rechaza número fuera de rango');
ok(await fails(`select public.save_participant('${demo}', null, '', null, null, array[5], 'reserved', 0)`, [], /nombre/i), 'rechaza nombre vacío');
// editar: quitar el 4, agregar el 5
await q(`select public.save_participant('${demo}', '${newP}', 'Pedro Nuevo', null, null, array[2, 6], 'reserved', 0)`);
const nums = (await q(`select array_agg(number order by number) n from tickets where participant_id=$1`, [newP])).rows[0].n;
ok(JSON.stringify(nums) === '[2,6]', `editar libera (4) y agrega (6) ([${nums}])`);
ok((await q(`select status from tickets where raffle_id=$1 and number=2`, [demo])).rows[0].status === 'paid', 'los números existentes conservan su estado');

console.log('6. Sorteo');
ok(await fails(`select public.run_draw('${demo}')`) === false, 'run_draw funciona');
const d1 = (await q(`select * from draws where raffle_id=$1 and voided_at is null`, [demo])).rows;
ok(d1.length === 1, 'quedó 1 sorteo guardado');
const won = d1[0];
const wt = (await q(`select status from tickets where raffle_id=$1 and number=$2`, [demo, won.winning_number])).rows[0];
ok(wt.status === 'winner', `el puesto ganador (#${won.winning_number}) quedó en estado winner`);
ok(won.eligible_numbers.every((n) => true) && won.eligible_numbers.includes(won.winning_number), 'el ganador estaba entre los habilitados');
const reservedNums = (await q(`select number from tickets where raffle_id=$1 and status='reserved'`, [demo])).rows.map(x => x.number);
ok(!reservedNums.includes(won.winning_number) && won.eligible_numbers.every(n => !reservedNums.includes(n)), 'los reservados no participan (por defecto)');
ok((await q(`select status from raffles where id=$1`, [demo])).rows[0].status === 'drawn', 'la rifa pasó a estado drawn');
ok(await fails(`select public.run_draw('${demo}')`, [], /ya tiene un sorteo/), 'no permite un segundo sorteo');
ok(await fails(`update tickets set status='reserved' where id='${won.ticket_id}'`, [], /protegido/), 'no permite editar el puesto ganador');
ok(await fails(`delete from tickets where id='${won.ticket_id}'`, [], /protegido/), 'no permite borrar el puesto ganador');
ok(await fails(`delete from participants where id='${won.participant_id}'`, [], /protegido/), 'no permite borrar al participante ganador');
ok(await fails(`update tickets set status='winner' where raffle_id='${demo}' and status='paid' limit 1`) , 'no se puede asignar "winner" a mano');
ok(await fails(`insert into draws(raffle_id, winning_number, winner_name, eligible_numbers, previous_status) values ('${demo}', 1, 'x', '{1}', 'paid')`), 'no se puede insertar un sorteo a mano');
ok(await fails(`update draws set winner_name='Otro' where id='${won.id}'`), 'no se puede editar un sorteo a mano');
const pub2 = (await (async () => { await as('anon', ''); return (await q('select public.get_public_raffle($1) as d', [slug])).rows[0].d; })());
ok(pub2.winner && pub2.winner.number === won.winning_number, 'la página pública muestra el ganador');
await as('authenticated', A);
ok(await fails(`select public.void_draw('${demo}', 'x')`, [], /motivo/), 'anular exige motivo');
await q(`select public.void_draw('${demo}', 'Prueba de anulación')`);
ok((await q(`select status from tickets where id='${won.ticket_id}'`)).rows[0].status === 'paid', 'al anular se restaura el estado previo del puesto');
ok((await q(`select count(*)::int c from draws where raffle_id=$1`, [demo])).rows[0].c === 1 && (await q(`select voided_at from draws where id='${won.id}'`)).rows[0].voided_at, 'el sorteo anulado queda en el historial');
await q(`select public.run_draw('${demo}', true)`);
const d2 = (await q(`select * from draws where raffle_id=$1 and voided_at is null`, [demo])).rows[0];
ok(d2.include_reserved === true && d2.eligible_numbers.length === 26, `sorteo con reservados incluidos: ${d2.eligible_numbers.length} habilitados`);
ok((await q(`select count(*)::int c from draws where raffle_id=$1`, [demo])).rows[0].c === 2, 'historial de sorteos: 2 registros');

console.log('7. Distribución del sorteo (100 sorteos sobre 10 números)');
const rid = (await q(`insert into raffles(slug, name) values ('dist','Dist') returning id`)).rows[0].id;
const pid = (await q(`insert into participants(raffle_id, name) values ($1,'P') returning id`, [rid])).rows[0].id;
for (let n = 1; n <= 10; n++) await q(`insert into tickets(raffle_id, number, participant_id, status) values ($1,$2,$3,'paid')`, [rid, n, pid]);
const counts = {};
for (let i = 0; i < 200; i++) {
  await q(`select public.run_draw($1)`, [rid]);
  const w = (await q(`select winning_number w from draws where raffle_id=$1 and voided_at is null`, [rid])).rows[0].w;
  counts[w] = (counts[w] || 0) + 1;
  await q(`select public.void_draw($1, 'test')`, [rid]);
}
const vals = Object.values(counts);
ok(Object.keys(counts).length === 10 && Math.min(...vals) > 5, `los 10 números salen (min ${Math.min(...vals)}, max ${Math.max(...vals)} de 200)`);

console.log('8. Otras reglas');
ok(await fails(`update raffles set total_numbers=50 where id='${demo}'`, [], /Libéralos/), 'no deja reducir puestos por debajo de un número asignado');
ok(await fails(`update raffles set owner_id='${B}' where id='${demo}'`), 'no se puede cambiar el dueño');
ok(await fails(`insert into raffles(slug, name, total_numbers) values ('otra','x',101)`), 'máximo 100 puestos');
ok(await fails(`insert into raffles(slug, name) values ('Mala Slug','x')`), 'slug inválido rechazado');
const logs = (await q(`select count(*)::int c from audit_log where raffle_id=$1`, [demo])).rows[0].c;
ok(logs > 50, `historial de cambios registrado (${logs} entradas)`);
ok(await fails(`delete from audit_log`), 'nadie puede borrar el historial desde el cliente');
ok(await fails(`insert into audit_log(table_name, action) values ('x','y')`), 'nadie puede escribir en el historial desde el cliente');

console.log('9. Borrado de datos de prueba');
const cnt = (await q(`select public.delete_demo_data() as c`)).rows[0].c;
ok(cnt === 1, `delete_demo_data borró ${cnt} rifa demo (incluida la que tenía ganador)`);
await as('postgres');
ok((await q(`select count(*)::int c from raffles where is_demo`)).rows[0].c === 0, 'no quedan rifas demo');
ok((await q(`select count(*)::int c from tickets where raffle_id='${demo}'`)).rows[0].c === 0, 'sin tickets huérfanos');
ok((await q(`select count(*)::int c from audit_log where raffle_id='${demo}'`)).rows[0].c === 0, 'historial de la rifa demo limpiado');
ok((await q(`select count(*)::int c from raffles where slug='dist'`)).rows[0].c === 1, 'la rifa NO demo sobrevive');
await as('authenticated', A);
await q(`select public.delete_raffle('${rid}')`);
await as('postgres');
ok((await q(`select count(*)::int c from raffles`)).rows[0].c === 0, 'delete_raffle borra rifa real con todo su contenido');

console.log(`\nResultado: ${pass} OK, ${fail} fallos`);
process.exit(fail ? 1 : 0);
