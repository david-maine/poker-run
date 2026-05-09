create or replace function public.enforce_run_display_name_registration()
returns trigger
language plpgsql
as $$
declare
  has_visits boolean;
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

    select exists (
      select 1
      from public.visits
      where run_id = old.id
    ) into has_visits;

    if has_visits then
      raise exception 'display_name cannot be set after waypoint claims have started';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists runs_enforce_display_name_registration on public.runs;

create trigger runs_enforce_display_name_registration
before insert or update of display_name
on public.runs
for each row
execute function public.enforce_run_display_name_registration();
