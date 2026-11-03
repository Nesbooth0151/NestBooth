-- Jalankan sekali SETELAH supabase-pos-users.sql di Supabase SQL Editor.
-- Manajemen pengguna POS: hanya server Render (service_role) yang boleh mengaksesnya.
create extension if not exists pgcrypto with schema extensions;

alter table public.pos_users add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.pos_users(id) on delete set null,
  actor_name text not null,
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists user_activity_logs_created_at_idx on public.user_activity_logs(created_at desc);
alter table public.user_activity_logs enable row level security;
revoke all on table public.user_activity_logs from public, anon, authenticated;
grant select, insert on table public.user_activity_logs to service_role;

-- Login hanya menerima akun yang aktif, lalu mencatat aktivitas masuk.
create or replace function public.login_pos_user(p_role text, p_pin text)
returns table(user_name text, user_role text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_user public.pos_users;
begin
  select * into v_user from public.pos_users
  where role = lower(trim(p_role)) and is_active = true
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  order by created_at asc limit 1;
  if not found then return; end if;
  insert into public.user_activity_logs(user_id, actor_name, action, details)
  values (v_user.id, v_user.name, 'Login', 'Masuk sebagai ' || v_user.role);
  return query select v_user.name, v_user.role;
end;
$$;

-- Membuat Kasir/Bar, mengganti PIN, atau mengaktifkan/nonaktifkan akun.
create or replace function public.manage_pos_user(
  p_action text, p_actor text, p_user_id uuid default null,
  p_name text default null, p_role text default null, p_pin text default null,
  p_is_active boolean default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_user public.pos_users; v_role text := lower(trim(coalesce(p_role, ''))); v_action text := lower(trim(p_action));
begin
  if length(trim(coalesce(p_actor, ''))) = 0 then raise exception 'Nama Admin wajib diisi'; end if;
  if v_action = 'create' then
    if v_role not in ('kasir', 'bar') then raise exception 'Peran hanya boleh Kasir atau Bar'; end if;
    if length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Nama pengguna tidak valid'; end if;
    if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4–6 digit angka'; end if;
    insert into public.pos_users(name, role, pin_hash, is_active, updated_at)
    values (trim(p_name), v_role, extensions.crypt(p_pin, extensions.gen_salt('bf')), true, now())
    returning * into v_user;
    insert into public.user_activity_logs(user_id, actor_name, action, details)
    values (v_user.id, trim(p_actor), 'Buat akun', v_user.name || ' (' || v_user.role || ')');
    return jsonb_build_object('id', v_user.id, 'name', v_user.name, 'role', v_user.role, 'is_active', v_user.is_active);
  end if;

  select * into v_user from public.pos_users where id = p_user_id;
  if not found then raise exception 'Akun tidak ditemukan'; end if;
  if v_action = 'change_pin' then
    if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4–6 digit angka'; end if;
    update public.pos_users set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now() where id = v_user.id;
    insert into public.user_activity_logs(user_id, actor_name, action, details)
    values (v_user.id, trim(p_actor), 'Ganti PIN', v_user.name || ' (' || v_user.role || ')');
  elsif v_action = 'set_active' then
    if p_is_active is null then raise exception 'Status akun tidak valid'; end if;
    if not p_is_active and v_user.role = 'admin' and v_user.is_active and (select count(*) from public.pos_users where role = 'admin' and is_active) <= 1 then
      raise exception 'Admin aktif terakhir tidak dapat dinonaktifkan';
    end if;
    update public.pos_users set is_active = p_is_active, updated_at = now() where id = v_user.id;
    insert into public.user_activity_logs(user_id, actor_name, action, details)
    values (v_user.id, trim(p_actor), case when p_is_active then 'Aktifkan akun' else 'Nonaktifkan akun' end, v_user.name || ' (' || v_user.role || ')');
  else
    raise exception 'Aksi pengguna tidak dikenal';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.login_pos_user(text, text) from public, anon, authenticated;
grant execute on function public.login_pos_user(text, text) to service_role;
revoke all on function public.manage_pos_user(text, text, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.manage_pos_user(text, text, uuid, text, text, text, boolean) to service_role;
