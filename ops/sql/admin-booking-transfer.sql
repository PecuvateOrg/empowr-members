begin;

create table if not exists public.mem_booking_transfer_audit (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.mem_bookings(id),
  from_occurrence_id uuid not null references public.mem_occurrences(id),
  to_occurrence_id uuid not null references public.mem_occurrences(id),
  staff_user_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);
alter table public.mem_booking_transfer_audit enable row level security;
revoke all on public.mem_booking_transfer_audit from public, anon, authenticated;
grant select, insert on public.mem_booking_transfer_audit to service_role;

create or replace function public.mem_admin_transfer_booking(
  p_booking_id uuid,
  p_target_occurrence_id uuid,
  p_staff_user_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path=public as $$
declare
  b mem_bookings%rowtype;
  source_offering uuid;
  target_offering uuid;
  target_capacity integer;
  target_status text;
  target_starts timestamptz;
  occupied integer;
begin
  if p_staff_user_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception 'mem_booking_not_transferable';
  end if;

  select * into b from mem_bookings where id=p_booking_id for update;
  if not found then raise exception 'mem_booking_not_found'; end if;
  if b.occurrence_id is null or b.status::text not in ('confirmed','no_show') then
    raise exception 'mem_booking_not_transferable';
  end if;

  select offering_id into source_offering from mem_occurrences where id=b.occurrence_id;
  select offering_id,capacity,status::text,starts_at
    into target_offering,target_capacity,target_status,target_starts
    from mem_occurrences where id=p_target_occurrence_id for update;
  if not found or target_status <> 'scheduled' or target_starts <= now()
     or target_offering is distinct from source_offering then
    raise exception 'mem_target_not_bookable';
  end if;
  if b.occurrence_id=p_target_occurrence_id then raise exception 'mem_same_occurrence'; end if;

  if exists(select 1 from mem_bookings where participant_id=b.participant_id
    and occurrence_id=p_target_occurrence_id and id<>b.id
    and status::text in ('pending_payment','confirmed','attended')) then
    raise exception 'mem_duplicate_booking';
  end if;

  if target_capacity is not null then
    select count(*) into occupied from mem_bookings where occurrence_id=p_target_occurrence_id
      and id<>b.id and status::text in ('pending_payment','confirmed','attended');
    if occupied >= target_capacity then raise exception 'mem_capacity_exceeded'; end if;
  end if;

  update mem_bookings set occurrence_id=p_target_occurrence_id,
    status='confirmed', transferred_at=now(), updated_at=now()
    where id=b.id;

  insert into mem_booking_transfer_audit(
    booking_id,from_occurrence_id,to_occurrence_id,staff_user_id,reason
  ) values(b.id,b.occurrence_id,p_target_occurrence_id,p_staff_user_id,btrim(p_reason));
end;
$$;
revoke all on function public.mem_admin_transfer_booking(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mem_admin_transfer_booking(uuid,uuid,uuid,text) to service_role;
commit;
