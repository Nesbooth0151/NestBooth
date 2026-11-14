-- Jalankan SEKALI di Supabase SQL Editor.
-- Memperbaiki label Riwayat Stok agar pengurangan manual tampil sebagai
-- "Penyesuaian keluar" dengan angka minus, bukan "Stok masuk".

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
    select movement.created_at, movement.movement_type, material.name as material_name,
      material.unit, movement.quantity,
      coalesce(nullif(movement.note, ''), case when movement.quantity < 0 then 'Pengurangan stok manual' else 'Restok manual' end) as note
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

revoke all on function public.get_stock_history(integer) from public, anon, authenticated;
grant execute on function public.get_stock_history(integer) to service_role;

-- Cek: pengurangan harus tampil dengan quantity negatif.
select * from public.get_stock_history(20);
