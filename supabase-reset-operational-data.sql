-- Jalankan SEKALI di Supabase SQL Editor.
-- Mengosongkan data operasional agar Dashboard, laporan, antrean, dan shift
-- kembali dari nol. Menu, resep, stok bahan, pengaturan, dan akun TIDAK berubah.
-- Pastikan tidak ada pembayaran QRIS yang masih tertunda sebelum menjalankannya.

begin;

-- Hapus pesanan pembayaran lebih dahulu karena terhubung ke transaksi.
delete from public.payment_orders;

-- Hapus antrean dan jejak pemakaian bahan dari transaksi lama.
delete from public.queue_items;
delete from public.sale_stock_movements;
delete from public.material_stock_movements;

-- Hapus pengeluaran dan shift sebelum menghapus transaksi penjualan.
delete from public.cash_expenses;
delete from public.sales;
delete from public.cashier_shifts;

commit;

-- Verifikasi: semua angka di bawah seharusnya 0.
select
  (select count(*) from public.sales) as transaksi,
  (select count(*) from public.queue_items) as antrean,
  (select count(*) from public.payment_orders) as pesanan_qris,
  (select count(*) from public.cashier_shifts) as shift,
  (select count(*) from public.material_stock_movements) as riwayat_stok_manual,
  (select count(*) from public.sale_stock_movements) as riwayat_stok_penjualan;
