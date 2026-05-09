update public.waypoints
set
  latitude = updates.latitude,
  longitude = updates.longitude,
  updated_at = timezone('utc', now())
from public.events,
(
  values
    ('wp1', -41.4162090, 147.1423968),
    ('wp2', -41.4160989, 147.1426003),
    ('wp3', -41.4158842, 147.1426261),
    ('wp4', -41.4162774, 147.1427183),
    ('wp5', -41.4160891, 147.1429429)
) as updates(code, latitude, longitude)
where events.slug = 'poker-run-demo'
  and events.id = waypoints.event_id
  and waypoints.code = updates.code;
