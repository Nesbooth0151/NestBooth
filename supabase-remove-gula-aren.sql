-- Jalankan SEKALI di Supabase SQL Editor.
-- NESLO dan Nestlé Milo tidak lagi menggunakan Gula Aren.
-- Bahan lama tidak dihapus fisik agar riwayat transaksi tetap aman.

delete from public.product_recipes recipe
using public.materials material
where recipe.material_id = material.id
  and lower(trim(material.name)) = 'gula aren';

update public.materials
set is_active = false
where lower(trim(name)) = 'gula aren';

-- Verifikasi: query ini seharusnya tidak menampilkan baris apa pun.
select product.name as menu, recipe.variant, material.name as bahan
from public.product_recipes recipe
join public.products product on product.id = recipe.product_id
join public.materials material on material.id = recipe.material_id
where product.name in ('NESLO', 'Nestlé Milo')
  and lower(trim(material.name)) = 'gula aren';
