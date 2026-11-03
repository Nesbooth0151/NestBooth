-- Jalankan SEKALI di Supabase SQL Editor.
-- Satu shift aktif untuk satu POS. Penjualan baru otomatis masuk ke shift aktif.
create table if not exists public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  cashier_name text not null,
  opened_at timestamptz not null default now(),
  opening_cash integer not null check (opening_cash >= 0),
  closed_at timestamptz,
  closed_by text,
  counted_cash integer,
  cash_sales integer not null default 0,
  qris_sales integer not null default 0,
  expected_cash integer,
  cash_difference integer,
  notes text not null default ''
);

create unique index if not exists cashier_shifts_one_open_idx
  on public.cashier_shifts ((status)) where status = 'open';
create index if not exists cashier_shifts_opened_at_idx
  on public.cashier_shifts(opened_at desc);

alter table public.sales add column if not exists shift_id uuid references public.cashier_shifts(id);
create index if not exists sales_shift_id_idx on public.sales(shift_id);

create or replace function public.assign_open_shift_to_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.shift_id is null then
    select id into new.shift_id from public.cashier_shifts where status = 'open' limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_assign_open_shift on public.sales;
create trigger sales_assign_open_shift
before insert on public.sales
for each row execute function public.assign_open_shift_to_sale();

create or replace function public.open_pos_shift(p_cashier_name text, p_opening_cash integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_shift public.cashier_shifts;
begin
  if length(trim(coalesce(p_cashier_name, ''))) = 0 then raise exception 'Nama kasir wajib diisi'; end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'Kas awal tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtext('nesbooth:cashier-shift'));
  if exists (select 1 from public.cashier_shifts where status = 'open') then
    raise exception 'Masih ada shift yang aktif';
  end if;
  insert into public.cashier_shifts(cashier_name, opening_cash)
  values (left(trim(p_cashier_name), 100), p_opening_cash)
  returning * into v_shift;
  return to_jsonb(v_shift);
end;
$$;

create or replace function public.close_pos_shift(p_shift_id uuid, p_closed_by text, p_counted_cash integer, p_notes text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.cashier_shifts;
  v_cash integer;
  v_qris integer;
  v_expected integer;
begin
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Kas akhir tidak valid'; end if;
  select * into v_shift from public.cashier_shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Shift aktif tidak ditemukan'; end if;
  select coalesce(sum(total) filter (where payment_method = 'Tunai'), 0),
         coalesce(sum(total) filter (where payment_method = 'QRIS'), 0)
  into v_cash, v_qris
  from public.sales where shift_id = p_shift_id and payment_status = 'paid';
  v_expected := v_shift.opening_cash + v_cash;
  update public.cashier_shifts set
    status = 'closed', closed_at = now(), closed_by = left(trim(coalesce(p_closed_by, v_shift.cashier_name)), 100),
    counted_cash = p_counted_cash, cash_sales = v_cash, qris_sales = v_qris,
    expected_cash = v_expected, cash_difference = p_counted_cash - v_expected,
    notes = left(coalesce(p_notes, ''), 300)
  where id = p_shift_id returning * into v_shift;
  return to_jsonb(v_shift);
end;
$$;

alter table public.cashier_shifts enable row level security;
revoke all on public.cashier_shifts from public, anon, authenticated;
grant select, insert, update on public.cashier_shifts to service_role;
revoke all on function public.open_pos_shift(text, integer) from public, anon, authenticated;
grant execute on function public.open_pos_shift(text, integer) to service_role;
revoke all on function public.close_pos_shift(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.close_pos_shift(uuid, text, integer, text) to service_role;
