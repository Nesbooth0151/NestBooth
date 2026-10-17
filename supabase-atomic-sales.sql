-- Jalankan SEKALI di Supabase SQL Editor.
-- Satu fungsi ini membuat penjualan dan antrean dalam satu transaksi database.
create or replace function public.create_pos_sale(
  p_items jsonb,
  p_subtotal integer,
  p_tax_amount integer,
  p_total integer,
  p_payment_method text,
  p_receipt_number text,
  p_queue_prefix text,
  p_queue_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_queue public.queue_items;
  v_queue_number text;
  v_count integer;
begin
  -- Mengunci nomor antrean untuk tanggal tersebut sehingga dua kasir tidak
  -- dapat memperoleh nomor yang sama pada waktu bersamaan.
  perform pg_advisory_xact_lock(hashtext('nesbooth:' || p_queue_date::text || ':' || p_queue_prefix));

  select count(*) into v_count
  from public.queue_items
  where queue_date = p_queue_date;

  v_queue_number := upper(left(p_queue_prefix, 4)) || lpad((v_count + 1)::text, 3, '0');

  insert into public.sales (
    receipt_number, items, subtotal, tax_amount, total, payment_method, payment_status
  ) values (
    p_receipt_number, p_items, p_subtotal, p_tax_amount, p_total, p_payment_method, 'paid'
  ) returning * into v_sale;

  insert into public.queue_items (
    queue_number, queue_date, item_count, sale_id, status
  ) values (
    v_queue_number, p_queue_date,
    coalesce((select sum((item->>'qty')::integer) from jsonb_array_elements(p_items) item), 0),
    v_sale.id, 'Menunggu'
  ) returning * into v_queue;

  return jsonb_build_object('sale', to_jsonb(v_sale), 'queue', to_jsonb(v_queue));
end;
$$;

revoke all on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) from public, anon, authenticated;
grant execute on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) to service_role;
