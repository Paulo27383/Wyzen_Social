-- WYZEN CHAT 3.1: repair private-chat permissions and add 24-hour status updates
-- Safe to run more than once.
create table if not exists public.wyzen_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 700),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists wyzen_statuses_expiry_idx on public.wyzen_statuses(expires_at desc);
alter table public.wyzen_statuses enable row level security;
grant select, insert, delete on public.wyzen_statuses to authenticated;
drop policy if exists wyzen_statuses_read_members on public.wyzen_statuses;
create policy wyzen_statuses_read_members on public.wyzen_statuses
for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_member(user_id) and expires_at > now());
drop policy if exists wyzen_statuses_insert_self on public.wyzen_statuses;
create policy wyzen_statuses_insert_self on public.wyzen_statuses
for insert to authenticated
with check (user_id=auth.uid() and public.wyzen_is_member(auth.uid()) and expires_at > now());
drop policy if exists wyzen_statuses_delete_self on public.wyzen_statuses;
create policy wyzen_statuses_delete_self on public.wyzen_statuses
for delete to authenticated
using (user_id=auth.uid() and public.wyzen_is_member(auth.uid()));

-- Ensure the app can read profiles only inside the private community.
grant select, update on public.profiles to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (public.wyzen_is_member(auth.uid()) and public.wyzen_is_member(profiles.id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id=auth.uid() and public.wyzen_is_member(auth.uid()))
with check (id=auth.uid() and public.wyzen_is_member(auth.uid()));

-- Explicit grants used by the native chat screens.
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;
grant execute on function public.wyzen_bootstrap_admin() to authenticated;
grant execute on function public.wyzen_redeem_invite(text) to authenticated;
grant execute on function public.wyzen_create_invite(integer,integer) to authenticated;
grant execute on function public.wyzen_create_conversation(text,boolean,uuid[]) to authenticated;
grant execute on function public.wyzen_registration_allowed(text) to anon, authenticated;
