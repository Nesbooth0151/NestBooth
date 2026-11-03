-- Jalankan sekali SETELAH supabase-shifts.sql.
-- Pengeluaran kas dicatat per shift dan tidak memengaruhi angka penjualan.
create table if not exists public.cash_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.cashier_shifts(id) on delete restrict,
  category text not null,
  description text not null,
  amount integer not null check (amount > 0),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists cash_expenses_shift_id_idx on public.cash_expenses(shift_id, created_at desc);
alter table public.cashier_shifts add column if not exists cash_expenses integer not null default 0;
alter table public.cash_expenses enable row level security;
revoke all on public.cash_expenses from public, anon, authenticated;
grant select, insert on public.cash_expenses to service_role;

create or replace function public.add_pos_cash_expense(
  p_shift_id uuid, p_category text, p_description text, p_amount integer, p_created_by text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_shift public.cashier_shifts; v_expense public.cash_expenses;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal pengeluaran tidak valid'; end if;
  if length(trim(coalesce(p_category, ''))) < 2 then raise exception 'Kategori pengeluaran wajib diisi'; end if;
  if length(trim(coalesce(p_description, ''))) < 3 then raise exception 'Keterangan pengeluaran minimal 3 karakter'; end if;
  if length(trim(coalesce(p_created_by, ''))) < 2 then raise exception 'Nama petugas wajib diisi'; end if;
  select * into v_shift from public.cashier_shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Shift aktif tidak ditemukan'; end if;
  insert into public.cash_expenses(shift_id, category, description, amount, created_by)
  values (p_shift_id, left(trim(p_category), 80), left(trim(p_description), 300), p_amount, left(trim(p_created_by), 120))
  returning * into v_expense;
  if to_regclass('public.user_activity_logs') is not null then
    insert into public.user_activity_logs(actor_name, action, details)
    values (v_expense.created_by, 'Pengeluaran kas', v_expense.category || ' — Rp' || v_expense.amount::text || ': ' || v_expense.description);
  end if;
  return to_jsonb(v_expense);
end;
$$;

-- Ganti fungsi tutup shift agar pengeluaran kas mengurangi kas seharusnya.
create or replace function public.close_pos_shift(p_shift_id uuid, p_closed_by text, p_counted_cash integer, p_notes text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_shift public.cashier_shifts; v_cash integer; v_qris integer; v_expenses integer; v_expected integer;
begin
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Kas akhir tidak valid'; end if;
  select * into v_shift from public.cashier_shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Shift aktif tidak ditemukan'; end if;
  select coalesce(sum(total) filter (where payment_method = 'Tunai'), 0), coalesce(sum(total) filter (where payment_method = 'QRIS'), 0)
  into v_cash, v_qris from public.sales where shift_id = p_shift_id and payment_status = 'paid';
  select coalesce(sum(amount), 0) into v_expenses from public.cash_expenses where shift_id = p_shift_id;
  v_expected := v_shift.opening_cash + v_cash - v_expenses;
  update public.cashier_shifts set status = 'closed', closed_at = now(),
    closed_by = left(trim(coalesce(p_closed_by, v_shift.cashier_name)), 100), counted_cash = p_counted_cash,
    cash_sales = v_cash, qris_sales = v_qris, cash_expenses = v_expenses,
    expected_cash = v_expected, cash_difference = p_counted_cash - v_expected, notes = left(coalesce(p_notes, ''), 300)
  where id = p_shift_id returning * into v_shift;
  return to_jsonb(v_shift);
end;
$$;

revoke all on function public.add_pos_cash_expense(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.add_pos_cash_expense(uuid, text, text, integer, text) to service_role;
revoke all on function public.close_pos_shift(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.close_pos_shift(uuid, text, integer, text) to service_role;
