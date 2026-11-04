-- Jalankan di Supabase SQL Editor untuk memperbarui resep menu NesBooth.
-- Aman dijalankan ulang: bahan tidak akan digandakan dan resep lama menu ini
-- akan diganti dengan takaran di bawah.

-- Bahan lama ini tidak dihapus fisik agar riwayat transaksi tetap utuh.
-- Setelah SQL dijalankan, bahan tersebut tidak muncul lagi pada stok aktif.
alter table public.materials add column if not exists is_active boolean not null default true;
update public.materials set is_active = false
where lower(name) = lower('Milo 3 in 1 Sachet');
delete from public.product_recipes recipe
using public.materials material
where recipe.material_id = material.id
  and lower(material.name) = lower('Milo 3 in 1 Sachet');

-- Tambahkan bahan yang belum ada. Stok awal 0 agar diisi sesuai stok fisik.
insert into public.materials (name, unit, stock, min_stock)
select source.name, source.unit, 0, 0
from (values
  ('Bubuk Blackcurrant', 'gram'),
  ('Bubuk Lemonade', 'gram'),
  ('Bubuk Lemon Tea', 'gram'),
  ('Es', 'gram'),
  ('Air', 'ml'),
  ('Gula Aren', 'gram'),
  ('Creamer', 'gram'),
  ('Milo Bubuk', 'gram'),
  ('Nescafé Ice Roast Sachet', 'pcs'),
  ('Susu Kental Manis', 'gram')
) as source(name, unit)
where not exists (
  select 1 from public.materials material
  where lower(material.name) = lower(source.name)
);

-- Ganti resep lama untuk menu yang diperbarui agar tidak ada takaran ganda.
delete from public.product_recipes recipe
using public.products product
where recipe.product_id = product.id
  and product.name in (
    'Nestlé Blackcurrant', 'Nestlé Lemonade', 'Nestea Lemon Tea',
    'NESLO', 'Nescafé Caffe Latte', 'Nestlé Milo'
  );

-- Simpan resep baru. Varian Panas Caffe Latte sengaja tidak memakai Es.
insert into public.product_recipes (product_id, material_id, variant, amount)
select product.id, material.id, recipe.variant, recipe.amount
from (values
  -- Blackcurrant
  ('Nestlé Blackcurrant', 'Bubuk Blackcurrant', '', 20),
  ('Nestlé Blackcurrant', 'Es', '', 160),
  ('Nestlé Blackcurrant', 'Air', '', 120),

  -- Lemonade
  ('Nestlé Lemonade', 'Bubuk Lemonade', '', 22),
  ('Nestlé Lemonade', 'Es', '', 160),
  ('Nestlé Lemonade', 'Air', '', 150),

  -- Lemon Tea
  ('Nestea Lemon Tea', 'Bubuk Lemon Tea', '', 22),
  ('Nestea Lemon Tea', 'Es', '', 160),
  ('Nestea Lemon Tea', 'Air', '', 150),

  -- NESLO
  ('NESLO', 'Gula Aren', '', 10),
  ('NESLO', 'Milo Bubuk', '', 20),
  ('NESLO', 'Nescafé Ice Roast Sachet', '', 2),
  ('NESLO', 'Susu Kental Manis', '', 15),
  ('NESLO', 'Air', '', 100),
  ('NESLO', 'Es', '', 160),

  -- Caffe Latte: Normal dan Less (dingin)
  ('Nescafé Caffe Latte', 'Creamer', 'Normal Dingin', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Normal Dingin', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Normal Dingin', 2),
  ('Nescafé Caffe Latte', 'Air', 'Normal Dingin', 120),
  ('Nescafé Caffe Latte', 'Es', 'Normal Dingin', 160),
  ('Nescafé Caffe Latte', 'Creamer', 'Less Dingin', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Less Dingin', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Less Dingin', 2),
  ('Nescafé Caffe Latte', 'Air', 'Less Dingin', 120),
  ('Nescafé Caffe Latte', 'Es', 'Less Dingin', 160),

  -- Caffe Latte: Nano (45 g creamer + gula aren, dibagi rata)
  ('Nescafé Caffe Latte', 'Creamer', 'Nano Dingin', 22.5),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Nano Dingin', 22.5),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Nano Dingin', 2),
  ('Nescafé Caffe Latte', 'Air', 'Nano Dingin', 120),
  ('Nescafé Caffe Latte', 'Es', 'Nano Dingin', 160),

  -- Caffe Latte: Strong (3 sachet Ice Roast)
  ('Nescafé Caffe Latte', 'Creamer', 'Strong Dingin', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Strong Dingin', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Strong Dingin', 3),
  ('Nescafé Caffe Latte', 'Air', 'Strong Dingin', 120),
  ('Nescafé Caffe Latte', 'Es', 'Strong Dingin', 160),

  -- Caffe Latte panas: takaran sama, tanpa Es
  ('Nescafé Caffe Latte', 'Creamer', 'Normal Panas', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Normal Panas', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Normal Panas', 2),
  ('Nescafé Caffe Latte', 'Air', 'Normal Panas', 120),
  ('Nescafé Caffe Latte', 'Creamer', 'Less Panas', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Less Panas', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Less Panas', 2),
  ('Nescafé Caffe Latte', 'Air', 'Less Panas', 120),
  ('Nescafé Caffe Latte', 'Creamer', 'Nano Panas', 22.5),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Nano Panas', 22.5),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Nano Panas', 2),
  ('Nescafé Caffe Latte', 'Air', 'Nano Panas', 120),
  ('Nescafé Caffe Latte', 'Creamer', 'Strong Panas', 25),
  ('Nescafé Caffe Latte', 'Gula Aren', 'Strong Panas', 25),
  ('Nescafé Caffe Latte', 'Nescafé Ice Roast Sachet', 'Strong Panas', 3),
  ('Nescafé Caffe Latte', 'Air', 'Strong Panas', 120),

  -- Milo
  ('Nestlé Milo', 'Milo Bubuk', '', 20),
  ('Nestlé Milo', 'Susu Kental Manis', '', 15),
  ('Nestlé Milo', 'Gula Aren', '', 10),
  ('Nestlé Milo', 'Air', '', 150),
  ('Nestlé Milo', 'Es', '', 160)
) as recipe(product_name, material_name, variant, amount)
-- Hanya hubungkan ke menu aktif yang tampil pada kasir.
join public.products product on product.name = recipe.product_name and product.is_active = true
join public.materials material on lower(material.name) = lower(recipe.material_name)
on conflict (product_id, material_id, variant)
do update set amount = excluded.amount;

-- Verifikasi: hasil query ini harus menampilkan setiap menu, varian, dan
-- jumlah bahan resepnya. Jika hasilnya kosong, kirimkan hasil SQL Editor.
select
  product.name as menu,
  coalesce(nullif(recipe.variant, ''), 'Standar') as varian,
  count(*) as jumlah_bahan
from public.product_recipes recipe
join public.products product on product.id = recipe.product_id
where product.is_active = true
  and product.name in (
  'Nestlé Blackcurrant', 'Nestlé Lemonade', 'Nestea Lemon Tea',
  'NESLO', 'Nescafé Caffe Latte', 'Nestlé Milo'
)
group by product.name, recipe.variant
order by product.name, recipe.variant;
