update public.waypoints
set
  radius_meters = 5,
  updated_at = timezone('utc', now())
from public.events
where events.slug = 'poker-run-demo'
  and events.id = waypoints.event_id
  and waypoints.code in ('wp1', 'wp2', 'wp3', 'wp4', 'wp5');
