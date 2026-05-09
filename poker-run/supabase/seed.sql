-- Seed data for local and remote testing.
-- This script is idempotent: rerunning it updates the demo event and waypoint rows.

with upserted_event as (
  insert into public.events (
    slug,
    name,
    description,
    status,
    starts_at,
    ends_at
  )
  values (
    'poker-run-demo',
    'Poker Run Demo',
    'Demo event for testing waypoint claims and leaderboard flow.',
    'active',
    timezone('utc', now()) - interval '1 hour',
    timezone('utc', now()) + interval '30 days'
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = timezone('utc', now())
  returning id
)
insert into public.waypoints (
  event_id,
  code,
  name,
  latitude,
  longitude,
  radius_meters,
  sort_order,
  proof_type,
  proof_value,
  is_active
)
select
  upserted_event.id,
  waypoint.code,
  waypoint.name,
  waypoint.latitude,
  waypoint.longitude,
  waypoint.radius_meters,
  waypoint.sort_order,
  waypoint.proof_type,
  waypoint.proof_value,
  true
from upserted_event
cross join (
  values
    ('wp1', 'Waypoint 1', -41.4162090, 147.1423968, 5, 0, 'gps', null),
    ('wp2', 'Waypoint 2', -41.4160989, 147.1426003, 5, 1, 'gps', null),
    ('wp3', 'Waypoint 3', -41.4158842, 147.1426261, 5, 2, 'gps', null),
    ('wp4', 'Waypoint 4', -41.4162774, 147.1427183, 5, 3, 'gps', null),
    ('wp5', 'Waypoint 5', -41.4160891, 147.1429429, 5, 4, 'gps', null)
) as waypoint(code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value)
on conflict (event_id, code) do update
set
  name = excluded.name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius_meters = excluded.radius_meters,
  sort_order = excluded.sort_order,
  proof_type = excluded.proof_type,
  proof_value = excluded.proof_value,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
