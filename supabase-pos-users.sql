-- Jalankan sekali di Supabase SQL Editor untuk login PIN POS.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pos_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin', 'kasir', 'bar')),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists pos_users_one_role_name on public.pos_users(role, name);
alter table public.pos_users enable row level security;
revoke all on table public.pos_users from public, anon, authenticated;
grant select, insert, update, delete on table public.pos_users to service_role;

create or replace function public.login_pos_user(p_role text, p_pin text)
returns table(user_name text, user_role text)
language sql security definer set search_path = public
as $$
  select name, role from public.pos_users
  where role = lower(trim(p_role))
    and is_active = true
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  order by created_at asc
  limit 1;
$$;

revoke all on function public.login_pos_user(text, text) from public, anon, authenticated;
grant execute on function public.login_pos_user(text, text) to service_role;

-- PIN awal untuk setup. Ganti segera setelah dapat masuk.
insert into public.pos_users (name, role, pin_hash)
select name, role, extensions.crypt(pin, extensions.gen_salt('bf'))
from (values
  ('Admin NesBooth', 'admin', '123456'),
  ('Kasir NesBooth', 'kasir', '222222'),
  ('Bar NesBooth', 'bar', '333333')
) as seed(name, role, pin)
where not exists (select 1 from public.pos_users);
