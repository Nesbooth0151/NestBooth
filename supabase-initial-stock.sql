-- Jalankan di Supabase SQL Editor untuk menetapkan stok awal NesBooth.
-- Nilai di bawah MENGGANTIKAN stok yang ada, bukan menambahkannya.
-- Creamer dipakai langsung oleh seluruh resep Caffè Latte aktif.

update public.materials as material
set stock = source.stock
from (values
  ('Nescafé Ice Roast Sachet', 300::numeric),
  ('Susu Kental Manis', 11027::numeric),
  ('Bubuk Lemonade', 4387::numeric),
  ('Bubuk Lemon Tea', 6690::numeric),
  ('Bubuk Blackcurrant', 1350::numeric),
  ('Creamer', 1878::numeric),
  ('Milo Bubuk', 5520::numeric)
) as source(name, stock)
where lower(trim(material.name)) = lower(source.name)
  and material.is_active is distinct from false;

-- Verifikasi hasilnya.
select name, stock, unit
from public.materials
where lower(trim(name)) in (
  'nescafé ice roast sachet', 'susu kental manis',
  'bubuk lemonade', 'bubuk lemon tea', 'bubuk blackcurrant',
  'creamer', 'milo bubuk'
)
order by name;
