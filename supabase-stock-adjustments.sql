-- Jalankan SEKALI di Supabase SQL Editor.
-- Menyediakan pengurangan/penyesuaian stok atomik dengan riwayat alasan.

alter table public.material_stock_movements
  drop constraint if exists material_stock_movements_quantity_check;
alter table public.material_stock_movements
  drop constraint if exists material_stock_movements_quantity_not_zero_check;
alter table public.material_stock_movements
  add constraint material_stock_movements_quantity_not_zero_check
  check (quantity <> 0);

create or replace function public.adjust_material_stock(
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
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Jumlah penyesuaian stok tidak boleh nol';
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Alasan penyesuaian stok minimal 3 karakter';
  end if;

  select * into v_material from public.materials where id = p_material_id for update;
  if not found then raise exception 'Bahan baku tidak ditemukan'; end if;
  if v_material.stock + p_quantity < 0 then
    raise exception 'Stok tidak mencukupi untuk dikurangi';
  end if;

  update public.materials
  set stock = stock + p_quantity
  where id = p_material_id
  returning * into v_material;

  insert into public.material_stock_movements(material_id, quantity, movement_type, note)
  values (p_material_id, p_quantity, 'adjustment', left(trim(p_note), 160));

  return to_jsonb(v_material);
end;
$$;

revoke all on function public.adjust_material_stock(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.adjust_material_stock(uuid, numeric, text) to service_role;
