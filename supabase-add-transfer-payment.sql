-- Jalankan SEKALI di Supabase SQL Editor.
-- Mengizinkan metode pembayaran: Tunai, QRIS, dan Transfer.
-- Transaksi lama tidak diubah.

begin;

alter table public.sales
  drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('Tunai', 'QRIS', 'Transfer'));

commit;
