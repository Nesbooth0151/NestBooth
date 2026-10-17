-- Jalankan SEKALI di Supabase SQL Editor.
-- Pembatalan/refund dan perubahan metode pembayaran dilakukan secara atomik.
create or replace function public.manage_pos_sale(
  p_sale_id uuid,
  p_action text,
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if p_action = 'cancel' then
    if v_sale.payment_status <> 'paid' then raise exception 'Transaksi ini tidak dapat dibatalkan'; end if;
    update public.sales set payment_status = 'cancelled' where id = p_sale_id returning * into v_sale;
    update public.queue_items set status = 'Selesai' where sale_id = p_sale_id;
  elsif p_action = 'refund' then
    if v_sale.payment_status <> 'paid' then raise exception 'Transaksi ini tidak dapat direfund'; end if;
    update public.sales set payment_status = 'refunded' where id = p_sale_id returning * into v_sale;
    update public.queue_items set status = 'Selesai' where sale_id = p_sale_id;
  elsif p_action = 'payment_method' then
    if v_sale.payment_status <> 'paid' then raise exception 'Hanya transaksi lunas yang dapat diubah'; end if;
    if p_payment_method not in ('Tunai', 'QRIS') then raise exception 'Metode pembayaran tidak valid'; end if;
    update public.sales set payment_method = p_payment_method where id = p_sale_id returning * into v_sale;
  else
    raise exception 'Aksi transaksi tidak valid';
  end if;

  return to_jsonb(v_sale);
end;
$$;

revoke all on function public.manage_pos_sale(uuid, text, text) from public, anon, authenticated;
grant execute on function public.manage_pos_sale(uuid, text, text) to service_role;
