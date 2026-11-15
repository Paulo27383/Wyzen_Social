-- WYZEN SOCIAL: tabela inicial do feed
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

grant select on public.posts to anon, authenticated;
grant insert on public.posts to authenticated;

drop policy if exists "Posts visiveis para todos" on public.posts;
create policy "Posts visiveis para todos"
on public.posts for select
to anon, authenticated
using (true);

drop policy if exists "Utilizador cria os seus posts" on public.posts;
create policy "Utilizador cria os seus posts"
on public.posts for insert
to authenticated
with check (auth.uid() = user_id);
