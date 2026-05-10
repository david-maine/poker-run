create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'event_admin' check (role in ('event_admin', 'owner')),
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;

create or replace function public.is_event_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  );
$$;

grant execute on function public.is_event_admin() to authenticated;

drop policy if exists "admins can read admin profiles" on public.admin_users;
create policy "admins can read admin profiles"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid() or public.is_event_admin());

drop policy if exists "admins can read all events" on public.events;
create policy "admins can read all events"
on public.events
for select
to authenticated
using (public.is_event_admin());

drop policy if exists "admins can create events" on public.events;
create policy "admins can create events"
on public.events
for insert
to authenticated
with check (public.is_event_admin());

drop policy if exists "admins can update events" on public.events;
create policy "admins can update events"
on public.events
for update
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());

drop policy if exists "admins can delete events" on public.events;
create policy "admins can delete events"
on public.events
for delete
to authenticated
using (public.is_event_admin());

drop policy if exists "admins can read all waypoints" on public.waypoints;
create policy "admins can read all waypoints"
on public.waypoints
for select
to authenticated
using (public.is_event_admin());

drop policy if exists "admins can create waypoints" on public.waypoints;
create policy "admins can create waypoints"
on public.waypoints
for insert
to authenticated
with check (public.is_event_admin());

drop policy if exists "admins can update waypoints" on public.waypoints;
create policy "admins can update waypoints"
on public.waypoints
for update
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());

drop policy if exists "admins can delete waypoints" on public.waypoints;
create policy "admins can delete waypoints"
on public.waypoints
for delete
to authenticated
using (public.is_event_admin());

drop policy if exists "admins can read all runs" on public.runs;
create policy "admins can read all runs"
on public.runs
for select
to authenticated
using (public.is_event_admin());

drop policy if exists "admins can read all visits" on public.visits;
create policy "admins can read all visits"
on public.visits
for select
to authenticated
using (public.is_event_admin());

grant select on public.admin_users to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, update, delete on public.waypoints to authenticated;
