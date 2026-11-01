// Fixture contract tests for ops/sql/shared-skate-hire.sql (issue #144), on
// top of skate-jam-hire.sql. Live behaviour was also checked in a rolled-back
// transaction on the shared database before rollout.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table mem_offerings(id uuid primary key default gen_random_uuid(),slug text);
create table mem_occurrences(id uuid primary key default gen_random_uuid(),offering_id uuid references mem_offerings);
create table mem_course_runs(id uuid primary key default gen_random_uuid(),offering_id uuid references mem_offerings);
create table mem_bookings(id uuid primary key default gen_random_uuid(),account_id uuid not null,participant_id uuid,
 occurrence_id uuid references mem_occurrences,course_run_id uuid references mem_course_runs,status text not null default 'pending_payment',
 source text not null default 'online',expires_at timestamptz default now()+interval '1 hour',stripe_checkout_session_id text);
`);
for (const file of ['skate-jam-hire.sql','shared-skate-hire.sql'])
  await db.exec(readFileSync(new URL(`../sql/${file}`,import.meta.url),'utf8'));
await db.exec('update mem_skate_jam_hire_sizes set quantity=1');
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const fails=async(promise,code)=>{await assert.rejects(promise,e=>e.message.includes(code));checks++;};
const account='00000000-0000-4000-8000-000000000001';
const synk=await scalar("insert into mem_offerings(slug) values('synkron8') returning id");
const course=await scalar("insert into mem_offerings(slug) values('beginners-foundation') returning id");
const date=await scalar('insert into mem_occurrences(offering_id) values($1) returning id',[synk]);
const level1=await scalar('insert into mem_course_runs(offering_id) values($1) returning id',[course]);
const level2=await scalar('insert into mem_course_runs(offering_id) values($1) returning id',[course]);
await db.query('update mem_course_runs set free_skate_hire=true where id=$1',[level1]);
const hire=(col,id,size,source='online')=>db.query(`insert into mem_bookings(account_id,${col},source,jam_hire_requested,jam_skate_size) values($1,$2,$3,true,$4) returning id`,[account,id,source,size]);
const runLeft=async(run,size)=>(await db.query('select available from mem_skate_hire_run_availability($1) where size=$2',[run,size])).rows[0]?.available;
let checks=0;

// SYNKRON8 PAYG now qualifies; subscriber bookings still do not.
await hire('occurrence_id',date,5); checks++;
await fails(hire('occurrence_id',date,5),'mem_jam_hire_sold_out');
await fails(hire('occurrence_id',date,6,'member'),'mem_jam_hire_not_allowed');

// Level 1 run has its own pool; Level 2 (unflagged) refuses hire.
assert.equal(await runLeft(level1,5),1); checks++;
const b=(await hire('course_run_id',level1,5)).rows[0].id;
assert.equal(await runLeft(level1,5),0); checks++;
await fails(hire('course_run_id',level1,5),'mem_jam_hire_sold_out');
await fails(hire('course_run_id',level2,5),'mem_jam_hire_not_allowed');
assert.equal((await db.query('select * from mem_skate_hire_run_availability($1)',[level2])).rows.length,0); checks++;

// Cancelling releases the pair, even after the run stops offering hire.
await db.query('update mem_course_runs set free_skate_hire=false where id=$1',[level1]);
await db.query("update mem_bookings set status='cancelled' where id=$1",[b]);
await db.query('update mem_course_runs set free_skate_hire=true where id=$1',[level1]);
assert.equal(await runLeft(level1,5),1); checks++;

// The reserve RPC sets hire on a pending course booking through the same trigger.
const pending=await scalar('insert into mem_bookings(account_id,course_run_id) values($1,$2) returning id',[account,level1]);
await db.query('select mem_reserve_skate_jam_hire($1,$2::jsonb)',[account,JSON.stringify([{booking_id:pending,size:5}])]);
assert.equal(await runLeft(level1,5),0); checks++;

console.log(`shared skate hire SQL: ${checks} checks passed`);
