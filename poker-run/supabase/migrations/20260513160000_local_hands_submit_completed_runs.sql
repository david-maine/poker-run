create or replace function public.enforce_run_display_name_registration()
returns trigger
language plpgsql
as $$
begin
  if new.display_name is not null then
    new.display_name := btrim(new.display_name);

    if char_length(new.display_name) = 0 then
      raise exception 'display_name cannot be blank';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.display_name is distinct from old.display_name then
    if old.display_name is not null then
      raise exception 'display_name cannot be changed once set';
    end if;

    if old.visit_count > 0 or old.status <> 'active' then
      raise exception 'display_name cannot be set after a hand has been submitted';
    end if;
  end if;

  return new;
end;
$$;

drop table if exists public.visits cascade;

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
      r.finished_at asc,
      r.started_at asc,
      r.id asc
  ) as leaderboard_rank
from public.runs r
join public.events e on e.id = r.event_id
where e.status in ('active', 'closed')
  and r.status = 'completed'
  and r.visit_count > 0;

grant select on public.leaderboard_entries to anon, authenticated;
