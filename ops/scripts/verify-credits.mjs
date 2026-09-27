// Run with CREDIT_PGLITE_MODULE pointing to an installed @electric-sql/pglite
// dist/index.js. Uses an isolated in-memory PostgreSQL, never live credentials.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.env.CREDIT_PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table mem_accounts(id uuid primary key,user_id uuid);
 alter table mem_accounts enable row level security;
 create policy own_account on mem_accounts for select to authenticated using(user_id=auth.uid());
 grant usage on schema auth to authenticated;
 grant select on mem_accounts to authenticated;
 create table mem_bookings(id uuid primary key default gen_random_uuid(),account_id uuid references mem_accounts(id),
 status text,price_paid_pence integer,stripe_checkout_session_id text,stripe_payment_intent_id text,
 expires_at timestamptz,cancelled_at timestamptz);
 create table mem_credits(id uuid primary key default gen_random_uuid(),account_id uuid references mem_accounts(id),
 amount_pence integer not null,source_booking_id uuid references mem_bookings(id),expires_at timestamptz,
 redeemed_booking_id uuid references mem_bookings(id),created_at timestamptz default now());
 alter table mem_credits enable row level security;
 create policy own_credit on mem_credits for select to authenticated using(account_id in(select id from mem_accounts where user_id=auth.uid()));
 grant select on mem_credits to authenticated;
`);
await db.exec(await readFile(new URL('./member-credits.sql',import.meta.url),'utf8'));
const account='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
await db.query('insert into mem_accounts values ($1,$1),($2,$2)',[account,other]);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const balance=()=>scalar('select coalesce(sum(available_pence),0)::int from mem_credit_balances where account_id=$1',[account]);
const issue=async(ref,amount=2000)=>scalar(`select id from mem_issue_credit($1,gen_random_uuid(),$1,null,$2,'Wix',$3,'Old session','2026-08-01','Staff approved',now()+interval '12 months')`,[account,amount,ref]);
const hold=async(amount,owner=account)=>scalar(`insert into mem_bookings(account_id,status,price_paid_pence,expires_at) values($1,'pending_payment',$2,now()+interval '30 minutes') returning id`,[owner,amount]);
const reserve=(ids,expected,token)=>db.query('select * from mem_reserve_credit($1,$2,$3,$4)',[account,ids,expected,token]);
const settle=(token,action,amount,session=token)=>scalar('select mem_settle_credit_checkout($1,$2,$3,$4,$5,$6)',[token,account,session,amount?'pi_test':null,amount,action]);
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
await test('legacy issue and case-insensitive duplicate protection',async()=>{await issue('WIX-1');assert.equal(await balance(),2000);await assert.rejects(()=>issue(' wix-1 '));assert.equal(await balance(),2000);});
const booking=await hold(1200);
await test('partial use reserves only the price and preserves remainder',async()=>{await reserve([booking],1200,'credit-one');assert.equal(await balance(),800);});
await test('stale second checkout cannot double-spend balance',async()=>{const second=await hold(1200);await assert.rejects(()=>reserve([second],1200,'credit-two'));assert.equal(await balance(),800);});
await test('foreign booking cannot consume another account credit',async()=>{const foreign=await hold(200,other);await assert.rejects(()=>reserve([foreign],200,'foreign'));});
await test('amount mismatch cannot confirm a booking',async()=>{await assert.rejects(()=>settle('credit-one','paid',1));});
await test('full credit confirms once and replay is harmless',async()=>{assert.equal(await settle('credit-one','paid',0),1);assert.equal(await settle('credit-one','paid',0),0);assert.equal(await balance(),800);});
await test('credit refund is durable, restores once, and cannot become cash',async()=>{
 const r=(await db.query('select * from mem_begin_booking_refund($1,$2)',[booking,account])).rows[0];assert.equal(r.card_pence,0);assert.equal(r.credit_pence,1200);assert.equal(await balance(),800);
 await db.query('select mem_begin_booking_refund($1,$2)',[booking,account]);
 assert.equal(await scalar('select mem_finish_booking_refund($1)',[booking]),true);assert.equal(await balance(),2000);
 assert.equal(await scalar('select mem_finish_booking_refund($1)',[booking]),false);assert.equal(await balance(),2000);
});
await test('minimum card amount retains credit instead of overcharging',async()=>{const id=await hold(2010);await reserve([id],1980,'minimum');assert.equal(await balance(),20);await settle('minimum','paid',30,'cs_min');const r=(await db.query('select * from mem_begin_booking_refund($1,$2)',[id,account])).rows[0];assert.equal(r.card_pence,30);assert.equal(r.credit_pence,1980);await db.query('select mem_finish_booking_refund($1)',[id]);assert.equal(await balance(),2000);});
await test('expiry cancellation releases reserved balance atomically',async()=>{const id=await hold(500);await reserve([id],500,'expiry');assert.equal(await balance(),1500);await db.query("update mem_bookings set status='cancelled' where id=$1",[id]);assert.equal(await balance(),2000);await assert.rejects(()=>settle('expiry','paid',0));});
await test('expired note and previously redeemed note cannot be spent',async()=>{await db.query("insert into mem_credits(account_id,amount_pence,expires_at) values($1,10000,now()-interval '1 day')",[account]);await db.query('insert into mem_credits(account_id,amount_pence,redeemed_booking_id) values($1,10000,$2)',[account,booking]);assert.equal(await balance(),2000);});
await test('allocation across household bookings keeps total exact',async()=>{const a=await hold(1500),b=await hold(1500);await reserve([a,b],2000,'household');assert.equal(await balance(),0);assert.equal(await settle('household','processing',1000,'cs_household'),2);assert.equal(await scalar("select count(*)::int from mem_bookings where stripe_checkout_session_id='cs_household' and expires_at is null"),2);assert.equal(await settle('household','paid',1000,'cs_household'),2);assert.equal(await settle('household','paid',1000,'cs_household'),0);});
await test('members can read only own credit and cannot invoke write RPCs',async()=>{
 await issue('WIX-2',777);
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`);
 assert.equal(await scalar('select count(*)::int from mem_credit_balances'),0);
 await assert.rejects(()=>issue('ILLEGAL'));
 await assert.rejects(()=>db.exec("insert into mem_credit_allocations default values"));
 await db.exec(`select set_config('request.jwt.claim.sub','${account}',false)`);
 assert.equal(await balance(),777);
 await db.exec('reset role');
});
await test('crediting a current booking cancels and issues only once',async()=>{
 const id=await scalar("insert into mem_bookings(account_id,status,price_paid_pence) values($1,'confirmed',1500) returning id",[account]);
 const req='00000000-0000-4000-8000-000000000099';
 const sql="select id from mem_issue_credit($1,$2,$1,$3,null,null,null,null,null,'Agreed credit',now()+interval '12 months')";
 const first=await scalar(sql,[account,req,id]);assert.equal(await scalar(sql,[account,req,id]),first);
 assert.equal(await scalar('select status from mem_bookings where id=$1',[id]),'credited');
 await assert.rejects(()=>db.query(sql,[account,'00000000-0000-4000-8000-000000000098',id]));
});
console.log(`${passed} credit database checks passed`);
await db.close();
