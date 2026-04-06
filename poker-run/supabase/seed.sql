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
    ('wp1', 'Waypoint 1', -30.642985625822085, 153.0032434784168, 20, 0, 'gps', null),
    ('wp2', 'Waypoint 2', -30.641767199198757, 153.0018180994699, 20, 1, 'gps', null),
    ('wp3', 'Waypoint 3', -30.642097320327387, 153.00372674625527, 20, 2, 'gps', null),
    ('wp4', 'Waypoint 4', -30.642386750602427, 153.0031659559446, 20, 3, 'gps', null),
    ('wp5', 'Waypoint 5', -30.642193290390235, 153.00241699750464, 20, 4, 'gps', null)
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
