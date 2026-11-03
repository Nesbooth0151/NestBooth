-- Jalankan sekali di Supabase SQL Editor.
-- Transaksi tidak dihapus: pembatalan/refund menyimpan alasan dan petugas.
alter table public.sales add column if not exists cancelled_at timestamptz;
alter table public.sales add column if not exists cancelled_by text;
alter table public.sales add column if not exists cancellation_reason text;
alter table public.sales add column if not exists refunded_at timestamptz;
alter table public.sales add column if not exists refunded_by text;
alter table public.sales add column if not exists refund_reason text;

create or replace function public.manage_pos_sale(
  p_sale_id uuid,
  p_action text,
  p_payment_method text default null,
  p_staff_name text default null,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_sale public.sales; v_move record; v_action text := lower(trim(coalesce(p_action, '')));
        v_staff text := left(trim(coalesce(p_staff_name, '')), 120); v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if v_action in ('cancel', 'refund') then
    if v_sale.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat dibatalkan atau direfund'; end if;
    if length(v_staff) < 2 then raise exception 'Nama petugas wajib diisi'; end if;
    if length(v_reason) < 3 then raise exception 'Alasan pembatalan/refund minimal 3 karakter'; end if;

    -- Kembalikan bahan baku bila modul resep/stok otomatis telah digunakan.
    if to_regclass('public.sale_stock_movements') is not null then
      for v_move in select material_id, amount from public.sale_stock_movements where sale_id = p_sale_id and movement_type = 'out' loop
        update public.materials set stock = stock + v_move.amount where id = v_move.material_id;
        insert into public.sale_stock_movements (sale_id, material_id, amount, movement_type)
        values (p_sale_id, v_move.material_id, v_move.amount, 'return');
      end loop;
    end if;

    if v_action = 'cancel' then
      update public.sales set payment_status = 'cancelled', cancelled_at = now(), cancelled_by = v_staff, cancellation_reason = v_reason
      where id = p_sale_id returning * into v_sale;
    else
      update public.sales set payment_status = 'refunded', refunded_at = now(), refunded_by = v_staff, refund_reason = v_reason
      where id = p_sale_id returning * into v_sale;
    end if;
    update public.queue_items set status = 'Selesai' where sale_id = p_sale_id;
    if to_regclass('public.user_activity_logs') is not null then
      insert into public.user_activity_logs(actor_name, action, details)
      values (v_staff, case when v_action = 'cancel' then 'Batalkan transaksi' else 'Refund transaksi' end,
        coalesce(v_sale.receipt_number, v_sale.id::text) || ' — ' || v_reason);
    end if;
  elsif v_action = 'payment_method' then
    if v_sale.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat diubah'; end if;
    if p_payment_method not in ('Tunai', 'QRIS') then raise exception 'Metode pembayaran tidak valid'; end if;
    update public.sales set payment_method = p_payment_method where id = p_sale_id returning * into v_sale;
  else
    raise exception 'Aksi transaksi tidak valid';
  end if;
  return to_jsonb(v_sale);
end;
$$;

revoke all on function public.manage_pos_sale(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.manage_pos_sale(uuid, text, text, text, text) to service_role;
