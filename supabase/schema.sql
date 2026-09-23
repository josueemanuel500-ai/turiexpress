-- Esquema de la base de datos de Turi Express MX.
-- Aplicado en el proyecto Supabase del sitio. Se guarda aquí como referencia
-- versionada; para reproducirlo en otro proyecto, ejecútalo en el SQL Editor
-- de Supabase (o con `apply_migration` si usas el MCP de Supabase).

-- Units: the 3 Nissan Urvan vans
create table public.units (
  id smallint primary key,
  name text not null
);

insert into public.units (id, name) values (1, 'Unidad 1'), (2, 'Unidad 2'), (3, 'Unidad 3');

alter table public.units enable row level security;

create policy "units are readable by anyone"
  on public.units for select
  using (true);

-- Bookings: both public rental requests and staff-entered occupations
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  unit_id smallint not null references public.units(id),
  start_date date not null,
  end_date date not null,
  client_name text not null,
  client_phone text not null,
  note text,
  pending boolean not null default false,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index bookings_unit_range_idx on public.bookings (unit_id, start_date, end_date);

alter table public.bookings enable row level security;

-- Server-side validation: overrides who/pending fields regardless of client input,
-- rejects past-dated public requests, and rejects overlapping bookings for the unit.
create or replace function public.set_booking_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_count int;
begin
  if new.end_date < new.start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  if auth.uid() is not null then
    new.created_by := auth.uid();
    select coalesce(u.raw_user_meta_data->>'name', u.email)
      into new.created_by_name
      from auth.users u where u.id = auth.uid();
    new.pending := false;
  else
    if new.start_date < current_date then
      raise exception 'start_date cannot be in the past';
    end if;
    new.created_by := null;
    new.created_by_name := null;
    new.pending := true;
  end if;

  select count(*) into conflict_count
    from public.bookings b
    where b.unit_id = new.unit_id
      and b.start_date <= new.end_date
      and b.end_date >= new.start_date;
  if conflict_count > 0 then
    raise exception 'Selected unit is already booked for part of this date range';
  end if;

  return new;
end;
$$;

create trigger trg_set_booking_fields
  before insert on public.bookings
  for each row execute function public.set_booking_fields();

revoke execute on function public.set_booking_fields() from public, anon, authenticated;

-- Insert validation is fully handled by the trigger above (it overwrites
-- created_by/created_by_name/pending and enforces business rules), so both
-- anonymous visitors and logged-in staff may attempt an insert.
create policy "anyone can submit a booking"
  on public.bookings for insert
  with check (true);

-- Only logged-in staff can see customer PII (name/phone/notes) or delete bookings.
create policy "staff can read bookings"
  on public.bookings for select
  to authenticated
  using (true);

create policy "staff can delete bookings"
  on public.bookings for delete
  to authenticated
  using (true);

-- Permite al personal marcar una reserva pública como confirmada (pending
-- true -> false) o corregir un dato capturado, sin borrar y recapturar la fila.
create policy "staff can update bookings"
  on public.bookings for update
  to authenticated
  using (true)
  with check (true);

-- Public-safe view: exposes only date ranges, never customer PII, for the
-- public availability calendar. Intentionally SECURITY DEFINER (default for
-- views) so it can read the underlying table despite the anon-restrictive RLS
-- policy above.
create view public.public_availability as
  select unit_id, start_date, end_date from public.bookings;

comment on view public.public_availability is
  'Intentional SECURITY DEFINER view: exposes only unit_id/start_date/end_date from bookings so the public calendar can show occupied ranges without exposing customer_name/client_phone/note, which stay restricted to authenticated staff via RLS on public.bookings.';

grant select on public.public_availability to anon, authenticated;
grant select on public.units to anon, authenticated;
grant insert on public.bookings to anon, authenticated;
grant select, update, delete on public.bookings to authenticated;

-- ============================================================
-- Retención de datos: borrado automático a los 12 meses
-- ============================================================
-- Cumple la promesa del aviso de privacidad (/aviso-privacidad.html):
-- los datos del cliente se eliminan solos, sin depender de que alguien
-- se acuerde de borrarlos a mano.

create extension if not exists pg_cron;

create or replace function public.delete_expired_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.bookings
  where end_date < current_date - interval '12 months';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Solo la tarea programada debe ejecutarla, nunca un visitante vía /rest/v1/rpc.
revoke execute on function public.delete_expired_bookings() from public, anon, authenticated;

comment on function public.delete_expired_bookings() is
  'Elimina reservas cuya fecha de fin tiene más de 12 meses, según el plazo de conservación publicado en /aviso-privacidad.html. Se ejecuta diariamente vía pg_cron (job: delete-expired-bookings).';

-- Corre todos los días a las 09:00 UTC (03:00 en Mérida).
select cron.schedule(
  'delete-expired-bookings',
  '0 9 * * *',
  $$select public.delete_expired_bookings()$$
);
