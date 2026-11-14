-- Jalankan SEKALI di Supabase SQL Editor.
-- Memindahkan semua resep yang menggunakan "Creamer + Aren" menjadi "Creamer".
-- Stok Creamer + Aren ikut dipindahkan ke Creamer agar tidak hilang.

do $$
declare
  v_old_stock numeric := 0;
  v_creamer_id uuid;
  v_combined_id uuid;
begin
  -- Pastikan Creamer tersedia dan aktif.
  insert into public.materials (name, unit, stock, min_stock, is_active)
  select 'Creamer', 'gram', 0, 300, true
  where not exists (
    select 1 from public.materials where lower(trim(name)) = 'creamer'
  );

  select id into v_creamer_id
  from public.materials
  where lower(trim(name)) = 'creamer'
  limit 1;

  select id, coalesce(stock, 0) into v_combined_id, v_old_stock
  from public.materials
  where lower(trim(name)) = 'creamer + aren'
  limit 1;

  if v_combined_id is not null then
    -- Hindari resep ganda sebelum mengganti bahan pada resep lama.
    delete from public.product_recipes recipe
    using public.materials material
    where recipe.material_id = material.id
      and lower(trim(material.name)) = 'creamer';

    update public.product_recipes
    set material_id = v_creamer_id
    where material_id = v_combined_id;
  end if;

  update public.materials
  set is_active = true,
      stock = coalesce(stock, 0) + coalesce(v_old_stock, 0)
  where id = v_creamer_id;

  -- Bahan lama tetap disimpan untuk riwayat, tetapi tidak aktif dan stoknya
  -- sudah dipindahkan sehingga tidak tampil sebagai persediaan terpisah.
  update public.materials
  set stock = 0, is_active = false
  where id = v_combined_id;
end;
$$;

-- Verifikasi resep Caffè Latte sekarang memakai Creamer.
select product.name as menu, recipe.variant, material.name as bahan, recipe.amount
from public.product_recipes recipe
join public.products product on product.id = recipe.product_id
join public.materials material on material.id = recipe.material_id
where product.name = 'Nescafé Caffe Latte'
order by recipe.variant, material.name;
