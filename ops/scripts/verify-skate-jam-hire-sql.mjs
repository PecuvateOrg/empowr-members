// Fixture contract tests; production ledger/trigger integration and independent
// PostgreSQL connection races must still be verified before rollout.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table mem_offerings(id uuid primary key default gen_random_uuid(),slug text);
create table mem_occurrences(id uuid primary key default gen_random_uuid(),offering_id uuid references mem_offerings);
create table mem_bookings(id uuid primary key default gen_random_uuid(),account_id uuid not null,participant_id uuid,
 occurrence_id uuid references mem_occurrences,course_run_id uuid,status text not null default 'pending_payment',
 source text not null default 'online',expires_at timestamptz default now()+interval '1 hour',stripe_checkout_session_id text);
`);
await db.exec(readFileSync(new URL('../sql/skate-jam-hire.sql',import.meta.url),'utf8'));
// Synthetic fixture quantities; production counts live in private configuration.
await db.exec('update mem_skate_jam_hire_sizes s set quantity=v.quantity from (values (3,1),(4,2),(5,0),(6,2),(7,2),(8,0),(9,3),(10,1)) v(size,quantity) where s.size=v.size');
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const account='00000000-0000-4000-8000-000000000001';
const offer=await scalar("insert into mem_offerings(slug) values('skate-jam') returning id");
const other=await scalar("insert into mem_offerings(slug) values('sk8-skool-kidz') returning id");
const date=await scalar('insert into mem_occurrences(offering_id) values($1) returning id',[offer]);
const date2=await scalar('insert into mem_occurrences(offering_id) values($1) returning id',[offer]);
const otherDate=await scalar('insert into mem_occurrences(offering_id) values($1) returning id',[other]);
const booking=async(occ=date,source='online')=>scalar('insert into mem_bookings(account_id,occurrence_id,source) values($1,$2,$3) returning id',[account,occ,source]);
const reserve=(choices,owner=account)=>db.query('select mem_reserve_skate_jam_hire($1,$2::jsonb)',[owner,JSON.stringify(choices)]);
const remaining=async(occ,size)=>(await db.query('select available from mem_skate_jam_hire_availability($1) where size=$2',[occ,size])).rows[0].available;
const status=(id,value)=>db.query('update mem_bookings set status=$2 where id=$1',[id,value]);
let checks=0;
assert.deepEqual((await db.query('select * from mem_skate_jam_hire_availability($1)',[date])).rows.map(r=>[r.size,r.available]),[[3,1],[4,2],[5,0],[6,2],[7,2],[8,0],[9,3],[10,1]]); checks++;
const a=await booking(),b=await booking();
await reserve([{booking_id:a,size:10}]); assert.equal(await remaining(date,10),0); checks++;
await assert.rejects(reserve([{booking_id:b,size:10}]),/mem_jam_hire_sold_out/); checks++;
await status(a,'confirmed'); await status(a,'attended'); assert.equal(await remaining(date,10),0); checks++;
await status(a,'cancelled'); assert.equal(await remaining(date,10),1); checks++;
// A paid booking restored after its pair was resold (late payment rescue) must
// confirm: it over-allocates rather than fail after the money is taken.
await reserve([{booking_id:b,size:10}]); await status(a,'confirmed'); assert.equal(await remaining(date,10),0);
assert.equal(await scalar('select reserved from mem_skate_jam_hire_stock where occurrence_id=$1 and size=10',[date]),2);
await status(a,'credited'); assert.equal(await remaining(date,10),0); await status(a,'confirmed');
assert.equal(await scalar('select reserved from mem_skate_jam_hire_stock where occurrence_id=$1 and size=10',[date]),2);
await status(a,'cancelled'); assert.equal(await remaining(date,10),0); checks++;
await status(b,'refunded'); assert.equal(await remaining(date,10),1); checks++;
const own=await booking(); await reserve([{booking_id:own,size:null}]); assert.equal(await remaining(date,10),1); checks++;
const sub=await booking(date,'member'); await assert.rejects(reserve([{booking_id:sub,size:6}]),/mem_jam_hire_invalid/); checks++;
const unrelated=await booking(otherDate); await assert.rejects(reserve([{booking_id:unrelated,size:6}]),/mem_jam_hire_not_allowed/); checks++;
const bad=await booking(); for (const size of [2,11]) await assert.rejects(reserve([{booking_id:bad,size}]),/mem_jam_hire_not_allowed/); checks++;
await assert.rejects(reserve([{booking_id:bad,size:6}],'00000000-0000-4000-8000-000000000002'),/mem_jam_hire_invalid/); checks++;
const c=await booking(),d=await booking(),e=await booking();
await assert.rejects(reserve([{booking_id:c,size:7},{booking_id:d,size:7},{booking_id:e,size:7}]),/mem_jam_hire_sold_out/);
assert.equal(await remaining(date,7),2); assert.equal(await scalar('select jam_hire_requested from mem_bookings where id=$1',[c]),null); checks++;
await reserve([{booking_id:c,size:7},{booking_id:d,size:7}]); assert.equal(await remaining(date,7),0); checks++;
await reserve([{booking_id:c,size:7}]); assert.equal(await remaining(date,7),0); checks++;
await reserve([{booking_id:c,size:6}]); assert.equal(await remaining(date,7),1); assert.equal(await remaining(date,6),1); checks++;
await db.query('update mem_bookings set occurrence_id=$2 where id=$1',[c,date2]); assert.equal(await remaining(date,6),2); assert.equal(await remaining(date2,6),1); checks++;
const f=await booking(date2),g=await booking(date2); await reserve([{booking_id:f,size:7},{booking_id:g,size:7}]);
await assert.rejects(db.query('update mem_bookings set occurrence_id=$2 where id=$1',[d,date2]),/mem_jam_hire_sold_out/);
assert.equal(await remaining(date,7),1); checks++;
await db.query("update mem_bookings set expires_at=now()-interval '1 minute' where id=$1",[d]);
assert.equal(await remaining(date,7),1); await status(d,'cancelled'); assert.equal(await remaining(date,7),2); checks++;
assert.equal(await scalar("select has_function_privilege('authenticated','mem_reserve_skate_jam_hire(uuid,jsonb)','execute')"),false);
assert.equal(await scalar("select has_table_privilege('anon','mem_skate_jam_hire_stock','select')"),false); checks++;
await db.close(); console.log(`PASS ${checks} SQL inventory/lifecycle/permissions checks`);
