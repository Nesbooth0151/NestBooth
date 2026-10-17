-- Jalankan SEKALI di Supabase SQL Editor.
-- Menyimpan resep pusat dan memotong/restock bahan dalam transaksi yang sama.
create table if not exists public.product_recipes (
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  amount numeric not null check (amount > 0),
  primary key (product_id, material_id)
);

create table if not exists public.sale_stock_movements (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  amount numeric not null check (amount > 0),
  movement_type text not null check (movement_type in ('out', 'return')),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.product_recipes, public.sale_stock_movements to service_role;

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
  v_need record;
  v_stock numeric;
begin
  -- Kunci nomor antrean dan bahan resep dalam transaksi yang sama.
  perform pg_advisory_xact_lock(hashtext('nesbooth:' || p_queue_date::text || ':' || p_queue_prefix));

  for v_need in
    select pr.material_id, sum(pr.amount * (item->>'qty')::numeric) as amount
    from jsonb_array_elements(p_items) item
    join public.products p on p.name = split_part(item->>'name', ' — ', 1) and p.is_active = true
    join public.product_recipes pr on pr.product_id = p.id
    group by pr.material_id
    order by pr.material_id
  loop
    select stock into v_stock from public.materials where id = v_need.material_id for update;
    if v_stock is null or v_stock < v_need.amount then
      raise exception 'Stok bahan baku tidak cukup';
    end if;
  end loop;

  select count(*) into v_count from public.queue_items where queue_date = p_queue_date;
  v_queue_number := upper(left(p_queue_prefix, 4)) || lpad((v_count + 1)::text, 3, '0');

  insert into public.sales (receipt_number, items, subtotal, tax_amount, total, payment_method, payment_status)
  values (p_receipt_number, p_items, p_subtotal, p_tax_amount, p_total, p_payment_method, 'paid')
  returning * into v_sale;

  for v_need in
    select pr.material_id, sum(pr.amount * (item->>'qty')::numeric) as amount
    from jsonb_array_elements(p_items) item
    join public.products p on p.name = split_part(item->>'name', ' — ', 1) and p.is_active = true
    join public.product_recipes pr on pr.product_id = p.id
    group by pr.material_id
  loop
    update public.materials set stock = stock - v_need.amount where id = v_need.material_id;
    insert into public.sale_stock_movements (sale_id, material_id, amount, movement_type)
    values (v_sale.id, v_need.material_id, v_need.amount, 'out');
  end loop;

  insert into public.queue_items (queue_number, queue_date, item_count, sale_id, status)
  values (v_queue_number, p_queue_date,
    coalesce((select sum((item->>'qty')::integer) from jsonb_array_elements(p_items) item), 0),
    v_sale.id, 'Menunggu')
  returning * into v_queue;

  return jsonb_build_object('sale', to_jsonb(v_sale), 'queue', to_jsonb(v_queue));
end;
$$;

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
  v_move record;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if p_action in ('cancel', 'refund') then
    if v_sale.payment_status <> 'paid' then raise exception 'Transaksi ini tidak dapat diproses'; end if;
    for v_move in select material_id, amount from public.sale_stock_movements where sale_id = p_sale_id and movement_type = 'out' loop
      update public.materials set stock = stock + v_move.amount where id = v_move.material_id;
      insert into public.sale_stock_movements (sale_id, material_id, amount, movement_type)
      values (p_sale_id, v_move.material_id, v_move.amount, 'return');
    end loop;
    update public.sales set payment_status = case when p_action = 'cancel' then 'cancelled' else 'refunded' end where id = p_sale_id returning * into v_sale;
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

revoke all on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) from public, anon, authenticated;
grant execute on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) to service_role;
revoke all on function public.manage_pos_sale(uuid, text, text) from public, anon, authenticated;
grant execute on function public.manage_pos_sale(uuid, text, text) to service_role;
