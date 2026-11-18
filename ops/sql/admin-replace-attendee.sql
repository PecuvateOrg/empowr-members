begin;

-- Staff-only attendance history; payment and public ticket ownership never move.
create table public.mem_booking_attendee_replacements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.mem_bookings(id) on delete cascade,
  participant_id uuid references public.mem_participants(id) on delete set null,
  staff_user_id uuid references auth.users(id) on delete set null,
  previous_status text not null check (previous_status in ('confirmed','attended','no_show')),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (char_length(btrim(reversal_reason)) between 3 and 300)
);
create unique index mem_booking_attendee_replacements_active
  on public.mem_booking_attendee_replacements(booking_id) where reversed_at is null;
alter table public.mem_booking_attendee_replacements enable row level security;
revoke all on public.mem_booking_attendee_replacements from public, anon, authenticated;
grant select on public.mem_booking_attendee_replacements to service_role;

create function public.mem_admin_replace_attendee(
  p_booking_id uuid, p_participant_id uuid, p_staff_user_id uuid,
  p_reason text, p_expected_participant_id uuid, p_waiver_response_id uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare
  b mem_bookings%rowtype;
  attendee mem_participants%rowtype;
  occurrence_id uuid;
  session_start timestamptz;
  offering uuid;
  bounds_min integer;
  bounds_max integer;
  attendee_age integer;
  signer uuid;
begin
  if p_staff_user_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception 'mem_replacement_invalid';
  end if;
  -- Match the existing hold RPC's occurrence-before-booking lock order.
  select x.occurrence_id into occurrence_id from mem_bookings x where x.id=p_booking_id;
  perform 1 from mem_occurrences where id=occurrence_id for update;
  select * into b from mem_bookings where id=p_booking_id for update;
  if not found then raise exception 'mem_booking_not_found'; end if;
  if b.participant_id is distinct from p_expected_participant_id
     or b.occurrence_id is distinct from occurrence_id or occurrence_id is null
     or b.course_run_id is not null or b.source::text='member'
     or b.status::text not in ('confirmed','attended','no_show')
     or exists(select 1 from mem_booking_attendee_replacements where booking_id=b.id and reversed_at is null) then
    raise exception 'mem_replacement_not_allowed';
  end if;
  if p_participant_id=b.participant_id then raise exception 'mem_replacement_same_person'; end if;
  select o.starts_at, o.offering_id, f.age_min, f.age_max into session_start,offering,bounds_min,bounds_max
    from mem_occurrences o join mem_offerings f on f.id=o.offering_id
    where o.id=b.occurrence_id and o.status::text in ('scheduled','completed');
  if not found or session_start>now() then raise exception 'mem_replacement_not_allowed'; end if;
  select * into attendee from mem_participants where id=p_participant_id for update;
  if not found then raise exception 'mem_replacement_participant_missing'; end if;
  attendee_age := extract(year from age((session_start at time zone 'Europe/London')::date,attendee.dob))::integer;
  if attendee_age is null or attendee_age<0
    or (bounds_min is not null and attendee_age<bounds_min)
    or (bounds_max is not null and attendee_age>bounds_max) then
    raise exception 'mem_replacement_age_ineligible';
  end if;
  if exists(select 1 from mem_bookings x
    left join mem_booking_attendee_replacements r on r.booking_id=x.id and r.reversed_at is null
    where x.occurrence_id=b.occurrence_id and x.id<>b.id
      and x.status::text in ('pending_payment','confirmed','attended','no_show')
      and (x.participant_id=p_participant_id or r.participant_id=p_participant_id)) then
    raise exception 'mem_duplicate_booking';
  end if;
  -- Recheck live subscription cover inside the mutation, including UK slot matching.
  if exists(select 1 from mem_memberships m
    join mem_membership_plans plan on plan.id=m.plan_id and plan.active
    join mem_plan_entitlements e on e.plan_id=m.plan_id
    where m.participant_id=attendee.id and m.status::text='active' and e.offering_id=offering
      and (e.weekday is null or e.starts_at_local is null or (
        e.weekday=extract(isodow from session_start at time zone 'Europe/London')
        and left(e.starts_at_local::text,5)=to_char(session_start at time zone 'Europe/London','HH24:MI')
      ))) then raise exception 'mem_replacement_subscription_cover'; end if;

  -- Same primary consent + active-version fallback as checkWaivers(). Lock
  -- the evidence against concurrent revocation. The signer-link write below
  -- share this transaction and roll back if any correction step fails.
  perform 1 from mem_waiver_consents c where c.participant_id=attendee.id
    and c.revoked_at is null and (c.expires_at is null or c.expires_at>now()) for share;
  if not found then
    select w.person_id into signer from waiver_responses w
      join form_versions v on v.id=w.form_version_id and v.active
      join people p on p.id=w.person_id
      join mem_accounts a on a.id=attendee.account_id
      join auth.users u on u.id=a.user_id
      where w.id=p_waiver_response_id and w.submitted_at>=now()-interval '1 year'
        and (w.person_id=attendee.person_id or (
          lower(p.email)=lower(u.email) and (
            lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g'))
              =lower(regexp_replace(btrim(attendee.name),'\s+',' ','g'))
            or exists(select 1 from unnest(w.skater_names) n where
              lower(regexp_replace(btrim(n),'\s+',' ','g'))=lower(regexp_replace(btrim(attendee.name),'\s+',' ','g')))
          )
        )) for share of w,v,p;
    if not found then raise exception 'mem_replacement_waiver_required'; end if;
    update mem_participants set person_id=signer where id=attendee.id;
  end if;
  insert into mem_booking_attendee_replacements(booking_id,participant_id,staff_user_id,previous_status,reason)
    values(b.id,p_participant_id,p_staff_user_id,b.status::text,btrim(p_reason));
  update mem_bookings set status='attended',updated_at=now() where id=b.id;
end;
$$;
revoke all on function public.mem_admin_replace_attendee(uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mem_admin_replace_attendee(uuid,uuid,uuid,text,uuid,uuid) to service_role;

create function public.mem_admin_reverse_attendee_replacement(
  p_booking_id uuid,p_replacement_id uuid,p_staff_user_id uuid,p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare b mem_bookings%rowtype; r mem_booking_attendee_replacements%rowtype;
begin
  if p_staff_user_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception 'mem_replacement_invalid';
  end if;
  select * into b from mem_bookings where id=p_booking_id for update;
  if not found or b.status::text<>'attended' then raise exception 'mem_replacement_not_allowed'; end if;
  select * into r from mem_booking_attendee_replacements
    where id=p_replacement_id and booking_id=b.id and reversed_at is null for update;
  if not found then raise exception 'mem_replacement_not_allowed'; end if;
  update mem_booking_attendee_replacements set reversed_at=now(),reversed_by=p_staff_user_id,
    reversal_reason=btrim(p_reason) where id=r.id;
  b.status := r.previous_status;
  update mem_bookings set status=b.status,updated_at=now() where id=b.id;
end;
$$;
revoke all on function public.mem_admin_reverse_attendee_replacement(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mem_admin_reverse_attendee_replacement(uuid,uuid,uuid,text) to service_role;

create function public.mem_guard_replaced_attendee_booking()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Only the event is fixed. Account/participant anonymisation and deletion
  -- must remain possible; FK cascade/SET NULL preserve the existing erasure paths.
  if TG_OP='UPDATE' then
    if exists(select 1 from mem_booking_attendee_replacements where booking_id=old.id and reversed_at is null)
      and (new.occurrence_id is distinct from old.occurrence_id
        or (old.status::text='attended' and new.status::text in ('confirmed','no_show'))) then
      raise exception 'mem_replacement_locked';
    end if;
    -- A payment confirmation or check-in of an existing live seat claims no
    -- new participant/place. Never add row locks to that normal payment path.
    if new.occurrence_id is not distinct from old.occurrence_id
      and new.participant_id is not distinct from old.participant_id
      and old.status::text in ('pending_payment','confirmed','attended') then return new; end if;
  end if;
  if new.occurrence_id is not null and new.status::text in ('pending_payment','confirmed','attended')
    and exists(select 1 from mem_booking_attendee_replacements r join mem_bookings b on b.id=r.booking_id
      where b.occurrence_id=new.occurrence_id and r.reversed_at is null) then
    -- Only corrected events need this extra serialisation. Ordinary inserts,
    -- Stripe confirmations, cancellations and refunds take no new locks.
    perform 1 from mem_occurrences where id=new.occurrence_id for update;
    if exists(select 1 from mem_booking_attendee_replacements r
      join mem_bookings b on b.id=r.booking_id
      where b.id<>new.id and b.occurrence_id=new.occurrence_id and r.reversed_at is null
        and r.participant_id=new.participant_id
        and b.status::text in ('pending_payment','confirmed','attended','no_show')) then
      raise exception 'mem_duplicate_booking';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.mem_guard_replaced_attendee_booking() from public,anon,authenticated;
create trigger mem_guard_replaced_attendee_booking
  before insert or update on public.mem_bookings
  for each row execute function public.mem_guard_replaced_attendee_booking();
commit;
