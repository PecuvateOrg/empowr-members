-- 2026-11-01: admin-only message groups ("segment" audiences). First use: the emergency contact
-- relationship follow-up (ops/sql/members-contact-relationship-backfill.sql). The function body is the
-- live one (pg_get_functiondef, 2026-11-01) with only the segment branch added.
begin;

alter table public.mem_messages drop constraint mem_messages_audience_type_check;
alter table public.mem_messages add constraint mem_messages_audience_type_check
  check (audience_type in ('occurrence', 'offering', 'account', 'segment'));

create or replace function public.mem_message_audience(p_type text, p_id uuid)
returns table (account_id uuid, account_name text, participant_names text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'account' then
    return query
      select a.id, a.name, '{}'::text[] from public.mem_accounts a where a.id = p_id;
    return;
  end if;
  -- Admin-only groups (ids fixed in src/lib/message-core.ts SEGMENTS).
  if p_type = 'segment' then
    if p_id = '00000000-0000-4000-8000-0000000000e1' then
      return query
        select a.id, a.name, array_agg(p.name order by p.name)
          from public.mem_participants p
          join public.mem_accounts a on a.id = p.account_id
         where p.name <> 'Deleted skater'
           and (p.emergency_contact_relationship is null or p.emergency_contact_relationship = 'Other: Other')
         group by a.id, a.name
         order by a.name;
      return;
    end if;
    if p_id = '00000000-0000-4000-8000-0000000000e2' then
      return query
        select a.id, a.name, array_agg(p.name order by p.name)
          from public.mem_contact_relationship_backfill b
          join public.mem_participants p on p.id = b.participant_id
          join public.mem_accounts a on a.id = b.account_id
         where p.name <> 'Deleted skater'
         group by a.id, a.name
         order by a.name;
      return;
    end if;
    raise exception 'unknown segment %', p_id;
  end if;
  if p_type not in ('occurrence', 'offering') then
    raise exception 'unknown audience type %', p_type;
  end if;

  return query
    with occ as (
      select o.id, o.course_run_id
        from public.mem_occurrences o
       where (p_type = 'occurrence' and o.id = p_id)
          or (p_type = 'offering' and o.offering_id = p_id and o.status = 'scheduled' and o.starts_at >= now())
    ),
    hits as (
      select b.account_id as acc, p.name as pname
        from public.mem_bookings b
        join public.mem_participants p on p.id = b.participant_id
       where b.status in ('confirmed', 'attended')
         and (
           b.occurrence_id in (select id from occ)
           or b.course_run_id in (select course_run_id from occ where course_run_id is not null)
         )
    )
    select a.id, a.name, array_agg(distinct h.pname order by h.pname)
      from hits h
      join public.mem_accounts a on a.id = h.acc
     group by a.id, a.name
     order by a.name;
end;
$$;
revoke execute on function public.mem_message_audience(text, uuid) from public, anon, authenticated;
grant execute on function public.mem_message_audience(text, uuid) to service_role;

commit;
