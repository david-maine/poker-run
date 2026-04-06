create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.haversine_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) *
      cos(radians(lat2)) *
      power(sin(radians((lng2 - lng1) / 2)), 2)
    )
  );
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.waypoints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 20 check (radius_meters > 0),
  sort_order integer not null check (sort_order >= 0),
  proof_type text not null default 'gps' check (proof_type in ('gps', 'qr', 'code', 'staff')),
  proof_value text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, code),
  unique (event_id, sort_order)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  last_claim_at timestamptz,
  visit_count integer not null default 0 check (visit_count >= 0),
  best_hand_name text not null default 'Unranked',
  best_hand_rank integer not null default 0 check (best_hand_rank between 0 and 10),
  best_hand_cards text[] not null default '{}'::text[],
  tiebreaker integer[] not null default '{}'::integer[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, user_id)
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  waypoint_id uuid not null references public.waypoints(id) on delete cascade,
  claimed_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz not null default timezone('utc', now()),
  claimed_lat double precision not null,
  claimed_lng double precision not null,
  gps_accuracy_meters double precision,
  distance_meters double precision check (distance_meters is null or distance_meters >= 0),
  proof_value text,
  assigned_card text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (run_id, waypoint_id),
  unique (run_id, assigned_card)
);

create index events_status_idx on public.events (status);
create index waypoints_event_order_idx on public.waypoints (event_id, sort_order);
create index waypoints_event_active_idx on public.waypoints (event_id, is_active);
create index runs_event_idx on public.runs (event_id);
create index runs_user_idx on public.runs (user_id);
create index runs_event_status_idx on public.runs (event_id, status);
create index visits_run_idx on public.visits (run_id);
create index visits_waypoint_idx on public.visits (waypoint_id);
create index visits_claimed_at_idx on public.visits (claimed_at desc);

create trigger touch_events_updated_at
before update on public.events
for each row
execute function public.touch_updated_at();

create trigger touch_waypoints_updated_at
before update on public.waypoints
for each row
execute function public.touch_updated_at();

create trigger touch_runs_updated_at
before update on public.runs
for each row
execute function public.touch_updated_at();

alter table public.events enable row level security;
alter table public.waypoints enable row level security;
alter table public.runs enable row level security;
alter table public.visits enable row level security;

create policy "events are readable when published"
on public.events
for select
to anon, authenticated
using (status in ('active', 'closed'));

create policy "waypoints are readable for published events"
on public.waypoints
for select
to anon, authenticated
using (
  is_active
  and exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.status in ('active', 'closed')
  )
);

create policy "players can read their own runs"
on public.runs
for select
to authenticated
using (user_id = auth.uid());

create policy "players can create their own run shell"
on public.runs
for insert
to authenticated
with check (user_id = auth.uid());

create policy "players can update their own run metadata"
on public.runs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "players can read their own visits"
on public.visits
for select
to authenticated
using (
  exists (
    select 1
    from public.runs
    where runs.id = visits.run_id
      and runs.user_id = auth.uid()
  )
);

create or replace view public.leaderboard_entries as
select
  e.id as event_id,
  e.slug as event_slug,
  e.name as event_name,
  r.id as run_id,
  r.user_id,
  coalesce(r.display_name, 'Player ' || left(r.user_id::text, 8)) as player_label,
  r.status as run_status,
  r.started_at,
  r.finished_at,
  r.visit_count,
  r.best_hand_name,
  r.best_hand_rank,
  r.best_hand_cards,
  r.tiebreaker,
  row_number() over (
    partition by r.event_id
    order by
      r.best_hand_rank desc,
      r.tiebreaker desc,
      r.visit_count desc,
      coalesce(r.finished_at, 'infinity'::timestamptz) asc,
      r.started_at asc,
      r.id asc
  ) as leaderboard_rank
from public.runs r
join public.events e on e.id = r.event_id
where e.status in ('active', 'closed')
  and r.visit_count > 0;

grant select on public.events to anon, authenticated;
grant select on public.waypoints to anon, authenticated;
grant select, insert, update on public.runs to authenticated;
grant select on public.visits to authenticated;
grant select on public.leaderboard_entries to anon, authenticated;
