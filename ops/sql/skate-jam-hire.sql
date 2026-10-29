-- Rollout input: review against the shared schema ledger before applying.
begin;
create table public.mem_skate_jam_hire_sizes (
  size smallint primary key check (size between 3 and 10),
  quantity integer not null check (quantity >= 0)
);
insert into public.mem_skate_jam_hire_sizes(size,quantity) values
  (3,0),(4,0),(5,0),(6,0),(7,0),(8,0),(9,0),(10,0);
-- Actual stock is operational configuration: seed from the private deployment
-- input before rollout. Zero defaults must never advertise nonexistent stock.
create table public.mem_skate_jam_hire_stock (
  occurrence_id uuid not null references public.mem_occurrences(id) on delete cascade,
  size smallint not null references public.mem_skate_jam_hire_sizes(size),
  reserved integer not null default 0 check (reserved >= 0),
  primary key (occurrence_id,size)
);
alter table public.mem_skate_jam_hire_sizes enable row level security;
alter table public.mem_skate_jam_hire_stock enable row level security;
revoke all on public.mem_skate_jam_hire_sizes, public.mem_skate_jam_hire_stock from public, anon, authenticated;
grant select on public.mem_skate_jam_hire_sizes, public.mem_skate_jam_hire_stock to service_role;

alter table public.mem_bookings
  add column jam_hire_requested boolean,
  add column jam_skate_size smallint references public.mem_skate_jam_hire_sizes(size),
  add constraint mem_bookings_jam_hire_check check ((
    (jam_hire_requested is null and jam_skate_size is null) or
    (jam_hire_requested = false and jam_skate_size is null) or
    (jam_hire_requested = true and jam_skate_size between 3 and 10)
  ) is true);

-- Atomic counters serialize claims of the last pair. Count pending holds until
-- the existing expiry job CANCELS them, including the payment grace interval.
-- Status/size/date changes (including transfers and failed-refund restoration)
-- go through this trigger too. Never release solely because wall time passed.
create function public.mem_track_skate_jam_hire() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_live boolean := false; new_live boolean := false; cap integer;
begin
  if tg_op <> 'INSERT' then
    old_live := old.jam_hire_requested is true and old.status::text in ('pending_payment','confirmed','attended','no_show');
  end if;
  if tg_op <> 'DELETE' then
    if new.jam_hire_requested is not null and (
      new.source::text <> 'online' or new.course_run_id is not null or
      not exists(select 1 from mem_occurrences o join mem_offerings f on f.id=o.offering_id
        where o.id=new.occurrence_id and f.slug='skate-jam')
    ) then raise exception 'mem_jam_hire_not_allowed'; end if;
    new_live := new.jam_hire_requested is true and new.status::text in ('pending_payment','confirmed','attended','no_show');
  end if;
  if tg_op='UPDATE' and old_live and new_live and old.occurrence_id=new.occurrence_id and old.jam_skate_size=new.jam_skate_size then return new; end if;
  if old_live then
    update mem_skate_jam_hire_stock set reserved=reserved-1 where occurrence_id=old.occurrence_id and size=old.jam_skate_size;
  end if;
  if new_live then
    -- The catalogue row lock also protects a quantity edit from racing a claim.
    select quantity into cap from mem_skate_jam_hire_sizes where size=new.jam_skate_size for share;
    if cap is null then raise exception 'mem_jam_hire_not_allowed'; end if;
    insert into mem_skate_jam_hire_stock(occurrence_id,size) values(new.occurrence_id,new.jam_skate_size) on conflict do nothing;
    update mem_skate_jam_hire_stock set reserved=reserved+1
      where occurrence_id=new.occurrence_id and size=new.jam_skate_size and reserved<cap;
    if not found then raise exception 'mem_jam_hire_sold_out'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger mem_bookings_track_jam_hire before insert or delete or update of
  jam_hire_requested,jam_skate_size,occurrence_id,course_run_id,source,status
  on public.mem_bookings for each row execute function public.mem_track_skate_jam_hire();
revoke all on function public.mem_track_skate_jam_hire() from public,anon,authenticated;

create function public.mem_reserve_skate_jam_hire(p_account_id uuid,p_choices jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare choice record;
begin
  if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'mem_jam_hire_invalid'; end if;
  if jsonb_array_length(p_choices) not between 1 and 10 then raise exception 'mem_jam_hire_invalid'; end if;
  if (select count(distinct value->>'booking_id') from jsonb_array_elements(p_choices)) <> jsonb_array_length(p_choices) then
    raise exception 'mem_jam_hire_invalid';
  end if;
  for choice in select * from jsonb_to_recordset(p_choices) as c(booking_id uuid,size smallint) order by booking_id loop
    update mem_bookings set jam_hire_requested=(choice.size is not null),jam_skate_size=choice.size
      where id=choice.booking_id and account_id=p_account_id and status='pending_payment'
        and expires_at>now() and source='online' and stripe_checkout_session_id is null;
    if not found then raise exception 'mem_jam_hire_invalid'; end if;
  end loop;
end;
$$;
revoke all on function public.mem_reserve_skate_jam_hire(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mem_reserve_skate_jam_hire(uuid,jsonb) to service_role;

create function public.mem_skate_jam_hire_availability(p_occurrence_id uuid)
returns table(size smallint,available integer) language sql stable security definer set search_path=public as $$
  select s.size,greatest(0,s.quantity-coalesce(h.reserved,0)) from mem_skate_jam_hire_sizes s
  left join mem_skate_jam_hire_stock h on h.size=s.size and h.occurrence_id=p_occurrence_id
  where exists(select 1 from mem_occurrences o join mem_offerings f on f.id=o.offering_id
    where o.id=p_occurrence_id and f.slug='skate-jam') order by s.size;
$$;
revoke all on function public.mem_skate_jam_hire_availability(uuid) from public,anon,authenticated;
grant execute on function public.mem_skate_jam_hire_availability(uuid) to service_role;
commit;
