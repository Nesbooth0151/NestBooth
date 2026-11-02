-- Jalankan sekali di Supabase SQL Editor sebelum mengaktifkan Midtrans.
-- Tabel ini menyimpan pesanan QRIS yang masih menunggu pembayaran.
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  midtrans_status text,
  midtrans_transaction_id text,
  gross_amount integer not null check (gross_amount > 0),
  items jsonb not null,
  receipt_number text not null unique,
  queue_prefix text not null,
  queue_date date not null,
  payment_method text not null default 'QRIS',
  sale_id uuid references public.sales(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_sale_id_idx on public.payment_orders(sale_id);
create index if not exists payment_orders_status_idx on public.payment_orders(status, created_at desc);

-- Browser tidak boleh bisa membaca atau mengubah pesanan pembayaran.
alter table public.payment_orders enable row level security;
revoke all on table public.payment_orders from public, anon, authenticated;
grant select, insert, update on table public.payment_orders to service_role;

-- Menjaga kolom updated_at selalu berubah saat webhook Midtrans diproses.
create or replace function public.set_payment_order_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_orders_updated_at on public.payment_orders;
create trigger payment_orders_updated_at
before update on public.payment_orders
for each row execute function public.set_payment_order_updated_at();
