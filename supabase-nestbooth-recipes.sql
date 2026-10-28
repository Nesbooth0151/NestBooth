-- Jalankan SEKALI di Supabase SQL Editor setelah deploy versi resep ini.
-- Resep di bawah memakai stok satuan: gram, ml, dan pcs/sachet.

create table if not exists public.product_recipes (
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  variant text not null default '',
  amount numeric not null check (amount > 0),
  primary key (product_id, material_id, variant)
);

-- Migrasi aman untuk tabel resep versi sebelumnya (yang belum punya varian).
alter table public.product_recipes add column if not exists variant text not null default '';
alter table public.product_recipes drop constraint if exists product_recipes_pkey;
alter table public.product_recipes add primary key (product_id, material_id, variant);

create table if not exists public.sale_stock_movements (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  amount numeric not null check (amount > 0),
  movement_type text not null check (movement_type in ('out', 'return')),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.product_recipes, public.sale_stock_movements to service_role;

-- Tambahkan bahan bila belum ada. Stok awal sengaja 0 agar Anda mengisinya
-- sesuai stok fisik yang benar sebelum mulai berjualan.
insert into public.materials (name, unit, stock, min_stock)
select source.name, source.unit, 0, 0
from (values
  ('Nescafé Ice Roast Sachet 4 g', 'pcs'),
  ('Creamer', 'gram'),
  ('Gula Aren', 'gram'),
  ('Air', 'ml'),
  ('Milo 3 in 1 Sachet', 'pcs'),
  ('Susu Kental Manis', 'gram'),
  ('Bubuk Lemonade', 'gram'),
  ('Bubuk Lemon Tea', 'gram'),
  ('Bubuk Blackcurrant', 'gram')
) as source(name, unit)
where not exists (select 1 from public.materials material where material.name = source.name);

-- Resep dari daftar NesBooth. Varian kosong berarti berlaku untuk semua
-- varian menu tersebut. Es tidak dipotong karena takarannya belum disebutkan.
insert into public.product_recipes (product_id, material_id, variant, amount)
select product.id, material.id, recipe.variant, recipe.amount
from (values
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet 4 g', '', 2),
  ('Nescafé Caffe Latte', 'Creamer', '', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', '', 25),
  ('Nescafé Caffe Latte', 'Air', '', 120),

  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '1 Shot Dingin', 1),
  ('Nescafé Ice Roast', 'Air', '1 Shot Dingin', 150),
  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '2 Shot Dingin', 2),
  ('Nescafé Ice Roast', 'Air', '2 Shot Dingin', 150),
  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '3 Shot Dingin', 3),
  ('Nescafé Ice Roast', 'Air', '3 Shot Dingin', 175),
  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '1 Shot Panas', 1),
  ('Nescafé Ice Roast', 'Air', '1 Shot Panas', 150),
  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '2 Shot Panas', 2),
  ('Nescafé Ice Roast', 'Air', '2 Shot Panas', 150),
  ('Nescafé Ice Roast', 'Nescafé Ice Roast Sachet 4 g', '3 Shot Panas', 3),
  ('Nescafé Ice Roast', 'Air', '3 Shot Panas', 175),

  ('NESLO', 'Milo 3 in 1 Sachet', '', 1),
  ('NESLO', 'Air', '', 100),
  ('NESLO', 'Nescafé Ice Roast Sachet 4 g', '', 1),
  ('NESLO', 'Susu Kental Manis', '', 15),

  ('Nestlé Milo', 'Milo 3 in 1 Sachet', '', 1),
  ('Nestlé Milo', 'Susu Kental Manis', '', 15),
  ('Nestlé Milo', 'Air', '', 150),

  ('Nestlé Lemonade', 'Bubuk Lemonade', '', 15),
  ('Nestea Lemon Tea', 'Bubuk Lemon Tea', '', 22),
  ('Nestlé Blackcurrant', 'Bubuk Blackcurrant', '', 25)
) as recipe(product_name, material_name, variant, amount)
join public.products product on product.name = recipe.product_name
join public.materials material on material.name = recipe.material_name
on conflict (product_id, material_id, variant) do update set amount = excluded.amount;

-- Membuat transaksi, nomor antrean, dan pengurangan stok sebagai satu proses.
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
  perform pg_advisory_xact_lock(hashtext('nesbooth:' || p_queue_date::text || ':' || p_queue_prefix));

  for v_need in
    with order_items as (
      select item.ord,
        split_part(item.value->>'name', ' — ', 1) as product_name,
        coalesce(nullif(split_part(item.value->>'name', ' — ', 2), ''), '') as variant,
        (item.value->>'qty')::numeric as qty
      from jsonb_array_elements(p_items) with ordinality as item(value, ord)
    ), candidates as (
      select item.ord, recipe.material_id, recipe.amount, item.qty,
        row_number() over (
          partition by item.ord, recipe.material_id
          order by case when recipe.variant = item.variant then 0 else 1 end
        ) as priority
      from order_items item
      join public.products product on product.name = item.product_name and product.is_active = true
      join public.product_recipes recipe on recipe.product_id = product.id
      where recipe.variant = item.variant or recipe.variant = ''
    )
    select material_id, sum(amount * qty) as amount
    from candidates where priority = 1
    group by material_id order by material_id
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
    with order_items as (
      select item.ord,
        split_part(item.value->>'name', ' — ', 1) as product_name,
        coalesce(nullif(split_part(item.value->>'name', ' — ', 2), ''), '') as variant,
        (item.value->>'qty')::numeric as qty
      from jsonb_array_elements(p_items) with ordinality as item(value, ord)
    ), candidates as (
      select item.ord, recipe.material_id, recipe.amount, item.qty,
        row_number() over (
          partition by item.ord, recipe.material_id
          order by case when recipe.variant = item.variant then 0 else 1 end
        ) as priority
      from order_items item
      join public.products product on product.name = item.product_name and product.is_active = true
      join public.product_recipes recipe on recipe.product_id = product.id
      where recipe.variant = item.variant or recipe.variant = ''
    )
    select material_id, sum(amount * qty) as amount
    from candidates where priority = 1
    group by material_id
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

revoke all on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) from public, anon, authenticated;
grant execute on function public.create_pos_sale(jsonb, integer, integer, integer, text, text, text, date) to service_role;
