-- Jalankan SEKALI di Supabase SQL Editor untuk mengosongkan isi Riwayat Stok.
-- Stok bahan saat ini, daftar bahan, resep, penjualan, dan antrean TIDAK diubah.

delete from public.material_stock_movements;
delete from public.sale_stock_movements;

-- Verifikasi: hasil kedua angka harus 0.
select
  (select count(*) from public.material_stock_movements) as riwayat_stok_manual,
  (select count(*) from public.sale_stock_movements) as riwayat_pemakaian_penjualan;
