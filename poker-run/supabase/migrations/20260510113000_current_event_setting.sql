create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  current_event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop trigger if exists touch_app_settings_updated_at on public.app_settings;
create trigger touch_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.touch_updated_at();

drop policy if exists "app settings are readable" on public.app_settings;
create policy "app settings are readable"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "admins can create app settings" on public.app_settings;
create policy "admins can create app settings"
on public.app_settings
for insert
to authenticated
with check (public.is_event_admin());

drop policy if exists "admins can update app settings" on public.app_settings;
create policy "admins can update app settings"
on public.app_settings
for update
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());

grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
