-- 2026-11-01 (owner permission): fill a skater's missing emergency contact relationship from their own
-- waiver when that waiver names the SAME contact (name, or last 9 digits of phone) with exactly one
-- relationship from the app's list ("Other", "Other: …" and blank are left to the member). Everyone else is still asked to set it themselves.
-- The log table records every row changed: the audit trail, the undo list, and the audience for the
-- "we updated this, please check it" message.
begin;

create table if not exists public.mem_contact_relationship_backfill (
  participant_id uuid primary key references public.mem_participants(id) on delete cascade,
  account_id uuid not null references public.mem_accounts(id) on delete cascade,
  relationship text not null,
  filled_at timestamptz not null default now()
);
alter table public.mem_contact_relationship_backfill enable row level security;
revoke all on public.mem_contact_relationship_backfill from public, anon, authenticated;
grant select on public.mem_contact_relationship_backfill to service_role;

insert into public.mem_contact_relationship_backfill (participant_id, account_id, relationship)
select id, account_id, rel from (
  select p.id, p.account_id,
    -- Waivers use the older wording; store the app's own options (lib/ec-relationships.ts).
    (select string_agg(distinct case wr.emergency_contact_relationship
                                  when 'Parent' then 'Parent / Guardian'
                                  when 'Sibling' then 'Other family member'
                                  else wr.emergency_contact_relationship end, '|')
       from public.waiver_responses wr
      where wr.person_id = p.person_id
        and wr.emergency_contact_relationship in ('Parent', 'Parent / Guardian', 'Sibling', 'Partner / Spouse',
                                                  'Son / Daughter', 'Other family member', 'Carer', 'Friend')
        and (lower(trim(wr.emergency_contact_name)) = lower(trim(p.emergency_contact_name))
             or right(regexp_replace(wr.emergency_contact_phone, '[^0-9]', '', 'g'), 9)
              = right(regexp_replace(p.emergency_contact_phone, '[^0-9]', '', 'g'), 9))) as rel
    from public.mem_participants p
   where p.emergency_contact_relationship is null
     and p.name <> 'Deleted skater'
     and p.person_id is not null
) c
where rel is not null and rel not like '%|%'
on conflict do nothing;

update public.mem_participants p
   set emergency_contact_relationship = b.relationship, updated_at = now()
  from public.mem_contact_relationship_backfill b
 where b.participant_id = p.id and p.emergency_contact_relationship is null;

commit;
