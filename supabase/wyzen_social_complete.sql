-- WYZEN SOCIAL - esquema completo inicial (Supabase PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  media_type text check (media_type in ('image','video') or media_type is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(content) <= 5000),
  check (content <> '' or media_url is not null)
);
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check(follower_id <> following_id)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  kind text not null check(kind in ('like','comment','follow','message')),
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(conversation_id,user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check(content <> '' or media_url is not null)
);

create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists comments_post_idx on public.comments(post_id,created_at);
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);

-- Perfil automático no registo
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id, username, full_name)
  values (new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1) || '_' || substr(new.id::text,1,5)),
    coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_wyzen on auth.users;
create trigger on_auth_user_created_wyzen after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Notificações automáticas
create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path=public
as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.posts where id=new.post_id;
 if owner_id is not null and owner_id <> new.user_id then
  insert into public.notifications(recipient_id,actor_id,post_id,kind,body)
  values(owner_id,new.user_id,new.post_id,'like','Gostou da tua publicação');
 end if;
 return new;
end; $$;
drop trigger if exists post_like_notification on public.post_likes;
create trigger post_like_notification after insert on public.post_likes
for each row execute procedure public.notify_post_like();

create or replace function public.notify_new_comment()
returns trigger language plpgsql security definer set search_path=public
as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.posts where id=new.post_id;
 if owner_id is not null and owner_id <> new.user_id then
  insert into public.notifications(recipient_id,actor_id,post_id,kind,body)
  values(owner_id,new.user_id,new.post_id,'comment','Comentou a tua publicação');
 end if;
 return new;
end; $$;
drop trigger if exists comment_notification on public.comments;
create trigger comment_notification after insert on public.comments
for each row execute procedure public.notify_new_comment();

create or replace function public.notify_new_follow()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.notifications(recipient_id,actor_id,kind,body)
 values(new.following_id,new.follower_id,'follow','Começou a seguir-te');
 return new;
end; $$;
drop trigger if exists follow_notification on public.follows;
create trigger follow_notification after insert on public.follows
for each row execute procedure public.notify_new_follow();

-- RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select,insert,update on public.profiles to authenticated;
grant select,insert,update,delete on public.posts to authenticated;
grant select,insert,delete on public.post_likes to authenticated;
grant select,insert,delete on public.comments to authenticated;
grant select,insert,delete on public.follows to authenticated;
grant select,update on public.notifications to authenticated;
grant select,insert on public.conversations to authenticated;
grant select,insert,delete on public.conversation_members to authenticated;
grant select,insert,update on public.messages to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check(id=auth.uid());

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using(true);
drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts for insert to authenticated with check(user_id=auth.uid());
drop policy if exists posts_update_self on public.posts;
create policy posts_update_self on public.posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists posts_delete_self on public.posts;
create policy posts_delete_self on public.posts for delete to authenticated using(user_id=auth.uid());

drop policy if exists likes_read on public.post_likes;
create policy likes_read on public.post_likes for select to authenticated using(true);
drop policy if exists likes_self on public.post_likes;
create policy likes_self on public.post_likes for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using(true);
drop policy if exists comments_self on public.comments;
create policy comments_self on public.comments for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using(true);
drop policy if exists follows_self on public.follows;
create policy follows_self on public.follows for all to authenticated using(follower_id=auth.uid()) with check(follower_id=auth.uid());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());

alter table public.conversations add column if not exists created_by uuid references public.profiles(id) on delete cascade;
drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select to authenticated using(
 created_by=auth.uid() or id in (select conversation_id from public.conversation_members where user_id=auth.uid()));
drop policy if exists conversations_create on public.conversations;
create policy conversations_create on public.conversations for insert to authenticated with check(true);

drop policy if exists members_read on public.conversation_members;
create policy members_read on public.conversation_members for select to authenticated using(user_id=auth.uid());
drop policy if exists members_join on public.conversation_members;
create policy members_join on public.conversation_members for insert to authenticated with check(user_id=auth.uid());

drop policy if exists messages_read_member on public.messages;
create policy messages_read_member on public.messages for select to authenticated using(
 exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
drop policy if exists messages_send_member on public.messages;
create policy messages_send_member on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(
 select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
drop policy if exists messages_update_member on public.messages;
create policy messages_update_member on public.messages for update to authenticated using(
 exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));

-- Bucket público para fotos/vídeos de posts e avatares. Escrita só na pasta do próprio utilizador.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wyzen-media','wyzen-media',true,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict(id) do update set public=true,file_size_limit=104857600,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists wyzen_media_public_read on storage.objects;
create policy wyzen_media_public_read on storage.objects for select using(bucket_id='wyzen-media');
drop policy if exists wyzen_media_upload_own on storage.objects;
create policy wyzen_media_upload_own on storage.objects for insert to authenticated with check(bucket_id='wyzen-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists wyzen_media_update_own on storage.objects;
create policy wyzen_media_update_own on storage.objects for update to authenticated using(bucket_id='wyzen-media' and owner_id=auth.uid()::text) with check(bucket_id='wyzen-media' and owner_id=auth.uid()::text);
drop policy if exists wyzen_media_delete_own on storage.objects;
create policy wyzen_media_delete_own on storage.objects for delete to authenticated using(bucket_id='wyzen-media' and owner_id=auth.uid()::text);

-- Ativar Realtime para mensagens/notificações/feed
do $$ begin
 alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
 alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
