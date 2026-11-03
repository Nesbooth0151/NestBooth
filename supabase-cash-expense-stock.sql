-- Jalankan sekali SETELAH supabase-cash-expenses.sql.
-- Pengeluaran untuk belanja bahan dapat sekaligus menambah stok secara atomik.
alter table public.cash_expenses add column if not exists material_id uuid references public.materials(id) on delete restrict;
alter table public.cash_expenses add column if not exists stock_quantity numeric check (stock_quantity > 0);

create or replace function public.add_pos_cash_expense(
  p_shift_id uuid, p_category text, p_description text, p_amount integer, p_created_by text,
  p_material_id uuid default null, p_stock_quantity numeric default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_shift public.cashier_shifts; v_expense public.cash_expenses; v_material public.materials;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal pengeluaran tidak valid'; end if;
  if length(trim(coalesce(p_category, ''))) < 2 then raise exception 'Kategori pengeluaran wajib diisi'; end if;
  if length(trim(coalesce(p_description, ''))) < 3 then raise exception 'Keterangan pengeluaran minimal 3 karakter'; end if;
  if length(trim(coalesce(p_created_by, ''))) < 2 then raise exception 'Nama petugas wajib diisi'; end if;
  if (p_material_id is null) <> (p_stock_quantity is null) then raise exception 'Pilih bahan dan jumlah stok secara bersamaan'; end if;
  if p_stock_quantity is not null and p_stock_quantity <= 0 then raise exception 'Jumlah stok masuk tidak valid'; end if;
  select * into v_shift from public.cashier_shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Shift aktif tidak ditemukan'; end if;
  if p_material_id is not null then
    update public.materials set stock = stock + p_stock_quantity where id = p_material_id returning * into v_material;
    if not found then raise exception 'Bahan baku tidak ditemukan'; end if;
  end if;
  insert into public.cash_expenses(shift_id, category, description, amount, created_by, material_id, stock_quantity)
  values (p_shift_id, left(trim(p_category), 80), left(trim(p_description), 300), p_amount, left(trim(p_created_by), 120), p_material_id, p_stock_quantity)
  returning * into v_expense;
  if p_material_id is not null and to_regclass('public.material_stock_movements') is not null then
    insert into public.material_stock_movements(material_id, quantity, movement_type, note)
    values (p_material_id, p_stock_quantity, 'in', 'Belanja kas: ' || v_expense.description);
  end if;
  if to_regclass('public.user_activity_logs') is not null then
    insert into public.user_activity_logs(actor_name, action, details)
    values (v_expense.created_by, 'Pengeluaran kas', v_expense.category || ' — Rp' || v_expense.amount::text || ': ' || v_expense.description || case when p_material_id is null then '' else ' (stok +' || p_stock_quantity::text || ' ' || v_material.unit || ')' end);
  end if;
  return to_jsonb(v_expense);
end;
$$;

revoke all on function public.add_pos_cash_expense(uuid, text, text, integer, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.add_pos_cash_expense(uuid, text, text, integer, text, uuid, numeric) to service_role;
