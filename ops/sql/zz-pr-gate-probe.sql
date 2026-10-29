-- pr-gate end-to-end probe; never applied (report-only test). PR closed after the test.
begin;
create table public.mem_zz_pr_gate_probe (id int primary key);
alter table public.mem_zz_pr_gate_probe enable row level security;
commit;
COMMIT;
drop table public.waiver_responses;
