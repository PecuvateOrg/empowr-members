import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key default gen_random_uuid());
create table mem_participants(id uuid primary key default gen_random_uuid(),dob date);
create table mem_offerings(id uuid primary key default gen_random_uuid(),age_min int,age_max int);
create table mem_occurrences(id uuid primary key default gen_random_uuid(),offering_id uuid references mem_offerings,starts_at timestamptz,status text default 'scheduled');
create table mem_bookings(id uuid primary key default gen_random_uuid(),participant_id uuid references mem_participants,
 account_id uuid default gen_random_uuid(),occurrence_id uuid references mem_occurrences,course_run_id uuid,
 source text default 'online',status text default 'confirmed',price_paid_pence int default 1000,
 stripe_payment_intent_id text default 'synthetic-payment',updated_at timestamptz default now());
`);
await db.exec(readFileSync(new URL('../sql/admin-replace-attendee.sql',import.meta.url),'utf8'));
const scalar = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
const staff = await scalar('insert into auth.users default values returning id');
const person = (dob='1990-01-01') => scalar('insert into mem_participants(dob) values($1) returning id',[dob]);
const original = await person(), replacement = await person(), other = await person();
const offering = await scalar('insert into mem_offerings(age_min) values(15) returning id');
const occurrence = await scalar("insert into mem_occurrences(offering_id,starts_at) values($1,now()-interval '1 hour') returning id",[offering]);
const future = await scalar("insert into mem_occurrences(offering_id,starts_at) values($1,now()+interval '1 day') returning id",[offering]);
const booking = (p=original,occ=occurrence) => scalar('insert into mem_bookings(participant_id,occurrence_id) values($1,$2) returning id',[p,occ]);
const swap = (b,p=replacement,expected=original,reason='Attendance correction') => db.query('select mem_admin_replace_attendee($1,$2,$3,$4,$5)',[b,p,staff,reason,expected]);
const b = await booking();
const before = (await db.query('select * from mem_bookings where id=$1',[b])).rows[0];
await swap(b);
const after = (await db.query('select * from mem_bookings where id=$1',[b])).rows[0];
for (const key of ['account_id','participant_id','occurrence_id','price_paid_pence','stripe_payment_intent_id']) assert.equal(after[key],before[key]);
assert.equal(after.status,'attended');
assert.equal(await scalar('select participant_id from mem_booking_attendee_replacements where booking_id=$1',[b]),replacement);
assert.equal(await scalar('select count(*)::int from mem_bookings'),1);
await assert.rejects(swap(b,other),/mem_replacement_not_allowed/);
await assert.rejects(booking(replacement),/mem_duplicate_booking/);
await assert.rejects(db.query('update mem_bookings set occurrence_id=$2 where id=$1',[b,future]),/mem_replacement_locked/);
const c = await booking(other);
await assert.rejects(swap(c,replacement,other),/mem_duplicate_booking/);
const child = await person('2020-01-01');
await assert.rejects(swap(c,child,other),/mem_replacement_age_ineligible/);
await assert.rejects(swap(c,other,other),/mem_replacement_same_person/);
await assert.rejects(swap(c,await person(),original),/mem_replacement_not_allowed/);
await assert.rejects(swap(c,await person(),other,'x'),/mem_replacement_invalid/);
for (const field of ["status='cancelled'","source='member'","course_run_id=gen_random_uuid()"]){
 const d = await booking(); await db.query(`update mem_bookings set ${field} where id=$1`,[d]);
 await assert.rejects(swap(d,await person()),/mem_replacement_not_allowed/);
}
await assert.rejects(swap(await booking(original,future),await person()),/mem_replacement_not_allowed/);
// Existing pending, confirmed or attended places cannot be duplicated by a correction.
for (const status of ['pending_payment','confirmed','attended']) {
 const p = await person(), d = await booking(p); await db.query('update mem_bookings set status=$2 where id=$1',[d,status]);
 await assert.rejects(swap(c,p,other),/mem_duplicate_booking/);
}
assert.equal(await scalar("select has_table_privilege('authenticated','mem_booking_attendee_replacements','select')"),false);
assert.equal(await scalar("select has_function_privilege('authenticated','mem_admin_replace_attendee(uuid,uuid,uuid,text,uuid)','execute')"),false);
assert.equal(await scalar('select count(*)::int from mem_booking_attendee_replacements'),1);
// Erasing a replacement profile cannot strand the existing account deletion flow.
await db.query('delete from mem_participants where id=$1',[replacement]);
assert.equal(await scalar('select participant_id from mem_booking_attendee_replacements where booking_id=$1',[b]),null);
await db.close();
console.log('PASS attendee replacement payment, lifecycle, duplication, eligibility and permissions checks');
