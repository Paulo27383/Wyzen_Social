-- WYZEN CHAT: allow first-owner bootstrap, then require a valid invitation before creating auth accounts.
create or replace function public.wyzen_registration_allowed(p_code text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.wyzen_settings%rowtype;
begin
  select * into cfg
  from public.wyzen_settings
  where singleton = true;

  -- The first account is reserved for the owner/admin bootstrap.
  if cfg.admin_user_id is null then
    return true;
  end if;

  -- Once the owner exists, every new account must present an active invite.
  if p_code is null or length(trim(p_code)) = 0 then
    return false;
  end if;

  return exists (
    select 1
    from public.wyzen_invites
    where code_hash = encode(digest(trim(p_code), 'sha256'), 'hex')
      and not revoked
      and expires_at > now()
      and uses < max_uses
  );
end;
$$;

revoke all on function public.wyzen_registration_allowed(text) from public;
grant execute on function public.wyzen_registration_allowed(text) to anon, authenticated;
