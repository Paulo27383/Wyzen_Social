-- WYZEN CHAT: private membership, invitations, 50-user hard limit and secure chat RPCs
create extension if not exists pgcrypto;

create table if not exists public.wyzen_settings (
  singleton boolean primary key default true check (singleton),
  admin_user_id uuid references auth.users(id) on delete set null,
  max_members integer not null default 50 check (max_members = 50)
);
insert into public.wyzen_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.wyzen_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  active boolean not null default true,
  joined_at timestamptz not null default now()
);

create table if not exists public.wyzen_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 1 check (max_uses between 1 and 50),
  uses integer not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.conversations add column if not exists title text not null default '';
alter table public.conversations add column if not exists is_group boolean not null default false;

create or replace function public.wyzen_is_member(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $ select exists(select 1 from public.wyzen_members where user_id=p_user and active); $;

create or replace function public.wyzen_is_conversation_member(p_conversation uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $ select exists(select 1 from public.conversation_members where conversation_id=p_conversation and user_id=p_user); $;

create or replace function public.wyzen_bootstrap_admin()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare cfg public.wyzen_settings%rowtype; used integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into cfg from public.wyzen_settings where singleton=true for update;
  if cfg.admin_user_id is null then
    select count(*) into used from public.wyzen_members where active;
    if used >= cfg.max_members then raise exception 'MEMBER_LIMIT_REACHED'; end if;
    update public.wyzen_settings set admin_user_id=auth.uid() where singleton=true;
    insert into public.wyzen_members(user_id,role,active) values(auth.uid(),'admin',true)
    on conflict(user_id) do update set role='admin',active=true;
    cfg.admin_user_id := auth.uid();
  end if;
  if cfg.admin_user_id <> auth.uid() and not public.wyzen_is_member(auth.uid()) then
    return jsonb_build_object('is_member',false,'is_admin',false);
  end if;
  return jsonb_build_object('is_member',public.wyzen_is_member(auth.uid()),'is_admin',cfg.admin_user_id=auth.uid());
end; $$;

create or replace function public.wyzen_redeem_invite(p_code text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare cfg public.wyzen_settings%rowtype; inv public.wyzen_invites%rowtype; used integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.wyzen_is_member(auth.uid()) then return jsonb_build_object('success',true,'already_member',true); end if;
  select * into cfg from public.wyzen_settings where singleton=true for update;
  select * into inv from public.wyzen_invites
    where code_hash=encode(digest(trim(p_code),'sha256'),'hex') and not revoked and expires_at>now() and uses<max_uses
    for update;
  if inv.id is null then raise exception 'INVITE_INVALID_OR_EXPIRED'; end if;
  select count(*) into used from public.wyzen_members where active;
  if used >= cfg.max_members then raise exception 'MEMBER_LIMIT_REACHED'; end if;
  update public.wyzen_invites set uses=uses+1 where id=inv.id;
  insert into public.wyzen_members(user_id,role,active) values(auth.uid(),'member',true)
    on conflict(user_id) do update set active=true;
  return jsonb_build_object('success',true,'already_member',false);
end; $$;

create or replace function public.wyzen_create_invite(p_max_uses integer default 1, p_valid_days integer default 7)
returns text language plpgsql security definer set search_path=public
as $$
declare code text;
begin
  if auth.uid() is null or not exists(select 1 from public.wyzen_settings where singleton=true and admin_user_id=auth.uid()) then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_max_uses < 1 or p_max_uses > 50 or p_valid_days < 1 or p_valid_days > 30 then raise exception 'INVALID_INVITE_OPTIONS'; end if;
  code := encode(gen_random_bytes(24),'hex');
  insert into public.wyzen_invites(code_hash,created_by,expires_at,max_uses)
  values(encode(digest(code,'sha256'),'hex'),auth.uid(),now()+(p_valid_days||' days')::interval,p_max_uses);
  return code;
end; $$;

create or replace function public.wyzen_create_conversation(p_title text, p_is_group boolean, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_id uuid; member_id uuid;
begin
  if auth.uid() is null or not public.wyzen_is_member(auth.uid()) then raise exception 'MEMBERS_ONLY'; end if;
  if coalesce(array_length(p_member_ids,1),0) < 1 then raise exception 'ADD_AT_LEAST_ONE_MEMBER'; end if;
  if (select count(*) from unnest(p_member_ids)) > 49 then raise exception 'TOO_MANY_MEMBERS'; end if;
  if exists(select 1 from unnest(p_member_ids) as u(member_id) where not public.wyzen_is_member(member_id)) then raise exception 'ALL_PARTICIPANTS_MUST_BE_MEMBERS'; end if;
  insert into public.conversations(created_by,title,is_group) values(auth.uid(),coalesce(p_title,''),p_is_group) returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id) values(new_id,auth.uid()) on conflict do nothing;
  foreach member_id in array p_member_ids loop
    insert into public.conversation_members(conversation_id,user_id) values(new_id,member_id) on conflict do nothing;
  end loop;
  return new_id;
end; $$;

alter table public.wyzen_settings enable row level security;
alter table public.wyzen_members enable row level security;
alter table public.wyzen_invites enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_member(profiles.id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id=auth.uid() and public.wyzen_is_member(auth.uid())) with check(id=auth.uid() and public.wyzen_is_member(auth.uid()));
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check(id=auth.uid());

drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_conversation_member(conversations.id,auth.uid()));
drop policy if exists conversations_create on public.conversations;
drop policy if exists members_read on public.conversation_members;
create policy members_read on public.conversation_members for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_conversation_member(conversation_members.conversation_id,auth.uid()));
drop policy if exists members_join on public.conversation_members;

drop policy if exists messages_read_member on public.messages;
create policy messages_read_member on public.messages for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_conversation_member(messages.conversation_id,auth.uid()));
drop policy if exists messages_send_member on public.messages;
create policy messages_send_member on public.messages for insert to authenticated
with check(sender_id=auth.uid() and public.wyzen_is_member(auth.uid()) and public.wyzen_is_conversation_member(messages.conversation_id,auth.uid()));
drop policy if exists messages_update_member on public.messages;
create policy messages_update_member on public.messages for update to authenticated
using(sender_id=auth.uid() and public.wyzen_is_member(auth.uid())) with check(sender_id=auth.uid());

revoke all on function public.wyzen_is_member(uuid) from public, anon;
revoke all on function public.wyzen_is_conversation_member(uuid,uuid) from public, anon;
revoke all on function public.wyzen_bootstrap_admin() from public, anon;
revoke all on function public.wyzen_redeem_invite(text) from public, anon;
revoke all on function public.wyzen_create_invite(integer,integer) from public, anon;
revoke all on function public.wyzen_create_conversation(text,boolean,uuid[]) from public, anon;
grant execute on function public.wyzen_is_member(uuid) to authenticated;
grant execute on function public.wyzen_is_conversation_member(uuid,uuid) to authenticated;
grant execute on function public.wyzen_bootstrap_admin() to authenticated;
grant execute on function public.wyzen_redeem_invite(text) to authenticated;
grant execute on function public.wyzen_create_invite(integer,integer) to authenticated;
grant execute on function public.wyzen_create_conversation(text,boolean,uuid[]) to authenticated;
grant select on public.wyzen_members to authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.profiles to authenticated;
grant insert on public.messages to authenticated;
grant update on public.profiles, public.messages to authenticated;

-- Realtime para mensagens novas
do $$ begin alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
