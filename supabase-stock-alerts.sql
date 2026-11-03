-- Jalankan SEKALI di Supabase SQL Editor.
-- Riwayat stok masuk manual dan fungsi restok yang aman untuk semua perangkat.
create table if not exists public.material_stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  movement_type text not null check (movement_type in ('in', 'adjustment')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists material_stock_movements_created_at_idx
  on public.material_stock_movements(created_at desc);

grant select, insert on public.material_stock_movements to service_role;

create or replace function public.restock_material(
  p_material_id uuid,
  p_quantity numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.materials;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Jumlah restok harus lebih dari nol';
  end if;

  update public.materials
  set stock = stock + p_quantity
  where id = p_material_id
  returning * into v_material;

  if not found then raise exception 'Bahan baku tidak ditemukan'; end if;

  insert into public.material_stock_movements(material_id, quantity, movement_type, note)
  values (p_material_id, p_quantity, 'in', left(coalesce(p_note, ''), 160));

  return to_jsonb(v_material);
end;
$$;

create or replace function public.get_stock_history(p_limit integer default 100)
returns table (
  created_at timestamptz,
  movement_type text,
  material_name text,
  unit text,
  quantity numeric,
  note text
)
language sql
security definer
set search_path = public
as $$
  select * from (
    select movement.created_at, 'in'::text as movement_type, material.name as material_name,
      material.unit, movement.quantity, coalesce(nullif(movement.note, ''), 'Restok manual') as note
    from public.material_stock_movements movement
    join public.materials material on material.id = movement.material_id
    union all
    select movement.created_at,
      case when movement.movement_type = 'return' then 'return' else 'out' end,
      material.name, material.unit, movement.amount,
      case when movement.movement_type = 'return' then 'Pengembalian transaksi' else 'Penjualan #' || sale.receipt_number end
    from public.sale_stock_movements movement
    join public.materials material on material.id = movement.material_id
    join public.sales sale on sale.id = movement.sale_id
  ) history
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;

revoke all on function public.restock_material(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.restock_material(uuid, numeric, text) to service_role;
revoke all on function public.get_stock_history(integer) from public, anon, authenticated;
grant execute on function public.get_stock_history(integer) to service_role;
