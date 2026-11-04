-- Jalankan SEKALI di Supabase SQL Editor.
-- Menetapkan batas minimum standar untuk seluruh bahan yang sudah tersimpan.
-- Batas per bahan tetap dapat diubah lagi dari halaman Produk & Stok > Peringatan Stok.
update public.materials
set min_stock = case lower(unit)
  when 'ml' then 2000
  when 'gram' then 300
  when 'pcs' then 50
  else coalesce(min_stock, 0)
end;

-- Verifikasi hasil (opsional).
select name, unit, stock, min_stock
from public.materials
order by unit, name;
