-- HAPUS seluruh data operasional tanggal 17 November 2026 (zona Asia/Jakarta).
-- Mencakup transaksi, pembayaran, antrean, shift, pengeluaran kas,
-- serta riwayat tambah/kurang stok. Stok bahan dikembalikan ke kondisi
-- sebelum perubahan pada tanggal tersebut.

begin;

create temporary table target_sales on commit drop as
select id, shift_id
from public.sales
where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
  and created_at <  ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta');

create temporary table target_shifts on commit drop as
select id
from public.cashier_shifts
where opened_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
  and opened_at <  ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')
union
select id
from public.cashier_shifts
where closed_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
  and closed_at <  ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')
union
select shift_id from target_sales where shift_id is not null;

-- Batalkan semua stok masuk/keluar manual yang dibuat pada 17 November.
update public.materials material
set stock = material.stock - movement.quantity
from (
  select material_id, sum(quantity) as quantity
  from public.material_stock_movements
  where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
    and created_at <  ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')
  group by material_id
) movement
where material.id = movement.material_id;

-- Batalkan pemakaian/pengembalian stok dari transaksi yang akan dihapus.
update public.materials material
set stock = material.stock + movement.net_quantity
from (
  select movement.material_id,
    sum(case when movement.movement_type = 'out' then movement.amount else -movement.amount end) as net_quantity
  from public.sale_stock_movements movement
  join target_sales sale on sale.id = movement.sale_id
  group by movement.material_id
) movement
where material.id = movement.material_id;

-- Hapus semua data relasi sebelum data induknya.
delete from public.payment_orders
where sale_id in (select id from target_sales)
   or (created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
       and created_at < ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta'));

delete from public.queue_items where sale_id in (select id from target_sales);
delete from public.sale_stock_movements where sale_id in (select id from target_sales);

delete from public.material_stock_movements
where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
  and created_at <  ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta');

delete from public.cash_expenses
where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta')
  and created_at < ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta');

delete from public.sales where id in (select id from target_sales);
-- Shift yang memiliki transaksi atau pengeluaran di luar tanggal 17 dipertahankan
-- agar data pada tanggal lain tidak ikut terhapus.
delete from public.cashier_shifts shift
where id in (select id from target_shifts)
  and not exists (select 1 from public.sales sale where sale.shift_id = shift.id)
  and not exists (select 1 from public.cash_expenses expense where expense.shift_id = shift.id);

commit;

-- Verifikasi: setiap angka di bawah seharusnya 0.
select
  (select count(*) from public.sales where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta') and created_at < ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')) as transaksi,
  (select count(*) from public.cashier_shifts where opened_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta') and opened_at < ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')) as shift_dibuka,
  (select count(*) from public.material_stock_movements where created_at >= ('2026-11-17'::date::timestamp at time zone 'Asia/Jakarta') and created_at < ('2026-11-18'::date::timestamp at time zone 'Asia/Jakarta')) as riwayat_stok;
