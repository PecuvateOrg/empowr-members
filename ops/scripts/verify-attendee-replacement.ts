import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const id='00000000-0000-4000-8000-000000000001';
const original='00000000-0000-4000-8000-000000000002';
const replacement='00000000-0000-4000-8000-000000000003';
let authorised=true, signed=true, calls=0, queryError=false, rpcError: {message:string}|null=null;
let source='online', status='confirmed';
let start='2020-01-01T20:00:00Z';
let overlay = false;
let lookupFails=false;
let waiverWrites=0;
const candidate={id:replacement,name:'Example Skater',dob:'1990-01-01',person_id:null,account_id:'recipient-account',medical_notes:'recipient medical note',default_travel_method:null,emergency_contact_name:'Recipient contact',emergency_contact_phone:'synthetic-phone',account:{user_id:'recipient-user'}};
mock.module('server-only',{namedExports:{}});
mock.module('next/server',{namedExports:{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}}});
mock.module('@/lib/admin',{namedExports:{getAuthedAdmin:async()=>authorised?{id:'staff'}:null,getAuthedCheckinStaff:async()=>authorised?{id:'staff'}:null}});
mock.module('@/lib/admin-data',{namedExports:{searchWalkInCandidates:async()=>[],getBookingForCheckin:async()=>{if(lookupFails) throw new Error("outage");return {waiverSigned:signed};}}});
mock.module('@/lib/membership',{namedExports:{coverForOccurrence:async()=>[]}});
mock.module('@/lib/waivers',{namedExports:{
 checkWaivers:async(email:string,people:{id:string}[])=>{
  assert.equal(email,'recipient@example.test'); assert.equal(people[0].id,replacement);
  return [{participantId:replacement,signed}];
 },persistWaiverMatches:async()=>{waiverWrites++;},
}});
mock.module('@/lib/supabase/service',{namedExports:{createServiceClient:()=>({
 from:(table:string)=>{
  const value = table==='mem_participants'?candidate:table==='mem_booking_attendee_replacements'?[{id:replacement,booking_id:id,participant:candidate}]:{
   participant_id:original,occurrence_id:id,course_run_id:null,source,status,
   occurrence:{starts_at:start,status:'scheduled',offering:{age_min:15,age_max:null}},
  };
  const builder={select:()=>builder,eq:()=>builder,is:()=>builder,in:async()=>({data:overlay?value:[],error:queryError?{message:'outage'}:null}),maybeSingle:async()=>({data:value,error:null})};
  return builder;
 },
 auth:{admin:{getUserById:async(user:string)=>{
  assert.equal(user,'recipient-user');return {data:{user:{email:'recipient@example.test'}},error:null};
 }}},
 rpc:async(name:string,args:Record<string,unknown>)=>{
  calls++;if(name==='mem_admin_reverse_attendee_replacement'){assert.equal(args.p_replacement_id,replacement);return {error:rpcError};}
  assert.equal(name,'mem_admin_replace_attendee');
  assert.equal(args.p_staff_user_id,'staff');assert.equal(args.p_participant_id,replacement);
  assert.equal(args.p_expected_participant_id,original);
  return {error:rpcError};
 },
})}});
const {POST:checkin}=await import('@/app/api/admin/bookings/[id]/checkin/route');
const {POST,DELETE}=await import('@/app/api/admin/bookings/[id]/replace-attendee/route');
const {applyAttendeeReplacements}=await import('@/lib/attendee-replacements');
const post=(body:unknown={participant_id:replacement,expected_participant_id:original,reason:'Correct actual attendance'})=>POST(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id})});
function reset(){authorised=true;signed=true;calls=0;source='online';status='confirmed';start='2020-01-01T20:00:00Z';rpcError=null;overlay=false;queryError=false;lookupFails=false;waiverWrites=0;}
test('admin-only mutation rejects invalid inputs without changing a booking',async()=>{
 reset();authorised=false;assert.equal((await post()).status,401);assert.equal(calls,0);
 reset();for(const body of [{},null,{participant_id:replacement,reason:'x'}])assert.equal((await post(body)).status,400);
 assert.equal(calls,0);
});
test('recipient waiver, subscription and session date gates fail closed',async()=>{
 reset();signed=false;assert.equal((await post()).status,409);assert.equal(calls,0);
 reset();source='member';assert.equal((await post()).status,409);assert.equal(calls,0);
 reset();status='cancelled';assert.equal((await post()).status,409);assert.equal(calls,0);
 reset();start='2099-01-01T20:00:00Z';assert.equal((await post()).status,409);assert.equal(calls,0);
});
test('successful correction uses recipient waiver and staff identity; duplicate returns conflict',async()=>{
 reset();assert.equal((await post()).status,200);assert.equal(calls,1);
 rpcError={message:'mem_duplicate_booking'};assert.equal((await post()).status,409);assert.equal(waiverWrites,0);
});
test('register overlay replaces all safety fields without changing financial fields',async()=>{
 reset();overlay=true;
 const rows=[{id,participant:{...candidate,id:original,name:'Original Skater',medical_notes:'original note'},price_paid_pence:1000,account_id:'payer-account'}];
 const [result]=await applyAttendeeReplacements(rows);
 assert.equal(result.participant?.id,replacement);
 assert.equal(result.participant?.medical_notes,'recipient medical note');
 assert.equal(result.participant?.emergency_contact_name,'Recipient contact');
 assert.equal(result.participant?.account?.user_id,'recipient-user');
 assert.equal(result.originalParticipantName,'Original Skater');assert.equal(result.attendeeReplaced,true);
 assert.equal(result.account_id,'payer-account');assert.equal(result.price_paid_pence,1000);
 queryError=true;await assert.rejects(applyAttendeeReplacements(rows),/Could not load/);
});

test('check-in refuses an attendee without their own waiver before writing',async()=>{
 reset();signed=false;const response=await checkin(new Request('https://example.test',{method:'POST'}),{params:Promise.resolve({id})});
 assert.equal(response.status,409);assert.equal(calls,0);
});

test('database outages produce a handled retryable 500 at check-in',async()=>{
 reset();lookupFails=true;
 const response=await checkin(new Request('https://example.test',{method:'POST'}),{params:Promise.resolve({id})});
 assert.equal(response.status,500);assert.equal(calls,0);
});
test('only admins can reverse a correction; stale corrections fail without success',async()=>{
 const undo=(body:unknown={replacement_id:replacement,reason:'Wrong attendee'})=>DELETE(new Request('https://example.test',{method:'DELETE',body:JSON.stringify(body)}),{params:Promise.resolve({id})});
 reset();authorised=false;assert.equal((await undo()).status,401);assert.equal(calls,0);
 reset();assert.equal((await undo({})).status,400);assert.equal(calls,0);
 assert.equal((await undo()).status,200);
 rpcError={message:'mem_replacement_not_allowed'};assert.equal((await undo()).status,409);
});
