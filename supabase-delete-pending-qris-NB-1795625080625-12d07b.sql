-- Menghapus satu order QRIS pending yang tampil pada Notifikasi Operasional.
-- Order ini belum menjadi transaksi/penjualan karena statusnya masih pending.

delete from public.payment_orders
where order_id = 'NB-1795625080625-12d07b'
  and status = 'pending'
  and sale_id is null;

-- Verifikasi: hasilnya harus 0.
select count(*) as sisa_order_pending
from public.payment_orders
where order_id = 'NB-1795625080625-12d07b';
