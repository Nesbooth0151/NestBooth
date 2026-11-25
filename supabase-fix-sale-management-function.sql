-- Jalankan SEKALI di Supabase SQL Editor.
-- Menghapus dua versi fungsi lama yang menyebabkan PostgREST tidak dapat
-- memilih fungsi saat Admin mengubah metode pembayaran.

drop function if exists public.manage_pos_sale(uuid, text, text);
drop function if exists public.manage_pos_sale(uuid, text, text, text, text);

-- Kolom audit dibuat bila belum ada, agar pembatalan dan refund tetap tercatat.
alter table public.sales add column if not exists cancelled_by text;
alter table public.sales add column if not exists cancellation_reason text;
alter table public.sales add column if not exists cancelled_at timestamptz;
alter table public.sales add column if not exists refunded_by text;
alter table public.sales add column if not exists refund_reason text;
alter table public.sales add column if not exists refunded_at timestamptz;

create function public.manage_pos_sale(
  p_sale_id uuid,
  p_action text,
  p_payment_method text default null,
  p_staff_name text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_staff text := nullif(trim(coalesce(p_staff_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if p_action = 'payment_method' then
    if v_sale.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat diubah'; end if;
    if p_payment_method not in ('Tunai', 'QRIS', 'Transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
    update public.sales
    set payment_method = p_payment_method
    where id = p_sale_id
    returning * into v_sale;

  elsif p_action = 'cancel' then
    if v_sale.payment_status <> 'paid' then raise exception 'Transaksi ini tidak dapat dibatalkan'; end if;
    if v_staff is null or length(v_staff) < 2 then raise exception 'Nama petugas wajib diisi'; end if;
    if v_reason is null or length(v_reason) < 3 then raise exception 'Alasan pembatalan minimal 3 karakter'; end if;
    update public.sales
    set payment_status = 'cancelled', cancelled_by = left(v_staff, 120),
      cancellation_reason = left(v_reason, 300), cancelled_at = now()
    where id = p_sale_id
    returning * into v_sale;
    update public.queue_items set status = 'Selesai' where sale_id = p_sale_id;

  elsif p_action = 'refund' then
    if v_sale.payment_status <> 'paid' then raise exception 'Transaksi ini tidak dapat direfund'; end if;
    if v_staff is null or length(v_staff) < 2 then raise exception 'Nama petugas wajib diisi'; end if;
    if v_reason is null or length(v_reason) < 3 then raise exception 'Alasan refund minimal 3 karakter'; end if;
    update public.sales
    set payment_status = 'refunded', refunded_by = left(v_staff, 120),
      refund_reason = left(v_reason, 300), refunded_at = now()
    where id = p_sale_id
    returning * into v_sale;
    update public.queue_items set status = 'Selesai' where sale_id = p_sale_id;

  else
    raise exception 'Aksi transaksi tidak valid';
  end if;

  return to_jsonb(v_sale);
end;
$$;

revoke all on function public.manage_pos_sale(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.manage_pos_sale(uuid, text, text, text, text) to service_role;
