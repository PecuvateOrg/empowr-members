import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { skateJamHireEntrySchema, skateJamHireError, SKATE_JAM_SIZES } from "@/lib/skate-jam-hire";
const participant="00000000-0000-4000-8000-000000000001";
const occurrence="00000000-0000-4000-8000-000000000002";
const booking="00000000-0000-4000-8000-000000000003";
const account="00000000-0000-4000-8000-000000000004";
let authenticated=true, covered=false, slug="skate-jam", reservationError: string|null=null;
let calls: string[]=[];
let choices: unknown;
let checkout: { line_items: { price_data: { unit_amount: number } }[] } | null=null;
const service={
  from(table:string) {
    let update: Record<string,unknown>|null=null;
    const chain={select(){return chain},in(){return chain},eq(){return chain},update(value:Record<string,unknown>){update=value;return chain},
      single(){return finish()},maybeSingle(){return finish()},then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){return finish().then(resolve,reject)}};
    async function finish(){
      if(table==='mem_participants')return {data:[{id:participant,name:'Example Adult',dob:'1990-01-01',person_id:null}],error:null};
      if(table==='mem_occurrences')return {data:{starts:'2030-07-11T18:00:00Z',ends:'2030-07-11T20:00:00Z',offering:{id:occurrence,title:'Skate Jam',slug,type:'drop_in',age_min:18,age_max:null}},error:null};
      if(update?.status==='cancelled')calls.push('release');
      if(update?.stripe_checkout_session_id)calls.push('link');
      return {data:null,error:null};
    }
    return chain;
  },
  async rpc(name:string,args:Record<string,unknown>){
    calls.push(name);
    if(name==='mem_reserve_skate_jam_hire'){choices=args.p_choices;assert.equal(args.p_account_id,account);return {data:null,error:reservationError?{message:reservationError}:null};}
    return {data:[{id:booking,occurrence_id:occurrence,participant_id:participant,price_paid_pence:700}],error:null};
  },
};
mock.module('next/server',{namedExports:{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}}});
mock.module('server-only',{namedExports:{}});
mock.module('@/lib/auth',{namedExports:{getAuthedAccount:async()=>authenticated?{account:{id:account},user:{email:'fixture@example.test'}}:null}});
mock.module('@/lib/supabase/service',{namedExports:{createServiceClient:()=>service}});
mock.module('@/lib/waivers',{namedExports:{checkWaivers:async()=>[{participantId:participant,signed:true}],persistWaiverMatches:async()=>{}}});
mock.module('@/lib/departure-consent',{namedExports:{recordDepartureConsents:async()=>{}}});
mock.module('@/lib/membership',{namedExports:{coverForOccurrence:async()=>covered?[{participant_id:participant,plan_name:'Subscription'}]:[]}});
mock.module('@/lib/request-origin',{namedExports:{requestOrigin:()=>"https://example.test"}});
mock.module('@/lib/notifications',{namedExports:{sendBookingConfirmationForSession:async()=>{}}});
mock.module('@/lib/reconcile-brevo',{namedExports:{reconcileBrevo:async()=>{}}});
mock.module('@/lib/stripe',{namedExports:{HOLD_GRACE_MINUTES:10,stripeCustomerAccount:()=>({}),getOrCreateStripeCustomer:async()=>"fixture_customer",getStripe:()=>({checkout:{sessions:{create:async(input:NonNullable<typeof checkout>)=>{checkout=input;calls.push('checkout');return {id:'fixture_session',url:'https://example.test/checkout',expires_at:9999999999}}}}})}});
const {POST}=await import('@/app/api/bookings/route');
function reset(){authenticated=true;covered=false;slug='skate-jam';reservationError=null;calls=[];choices=undefined;checkout=null;}
function request(size:unknown=10){return new Request('https://example.test/api/bookings',{method:'POST',body:JSON.stringify({items:[{occurrence_id:occurrence,participant_ids:[participant],skate_jam_hire:[{participant_id:participant,size}]}]})});}
test('only UK 3–10 and own skates are accepted; partial/duplicate selections rejected',()=>{
  for(const size of [...SKATE_JAM_SIZES,null]) assert.equal(skateJamHireEntrySchema.safeParse({participant_id:participant,size}).success,true);
  for(const size of [2,11,7.5,'7',undefined])assert.equal(skateJamHireEntrySchema.safeParse({participant_id:participant,size}).success,false);
  assert.ok(skateJamHireError(true,[participant,account],[{participant_id:participant,size:7}]));
  assert.ok(skateJamHireError(true,[participant],[{participant_id:participant,size:7},{participant_id:participant,size:7}]));
});
test('PAYG basket reserves hire before checkout and keeps the session price',async()=>{
  reset();assert.equal((await POST(request())).status,201);
  assert.deepEqual(calls,['mem_hold_bookings','mem_reserve_skate_jam_hire','checkout','link']);
  assert.deepEqual(choices,[{booking_id:booking,size:10}]);
  assert.deepEqual(checkout?.line_items.map(line=>line.price_data.unit_amount),[700]);
});
test('own-skates option saves a null size at the same ticket price',async()=>{
  reset();assert.equal((await POST(request(null))).status,201);assert.deepEqual(choices,[{booking_id:booking,size:null}]);
  assert.deepEqual(checkout?.line_items.map(line=>line.price_data.unit_amount),[700]);
});
test('last-pair conflict releases held places and never starts payment',async()=>{
  reset();reservationError='mem_jam_hire_sold_out';const response=await POST(request());
  assert.equal(response.status,409);assert.match((await response.json()).error,/fully booked/);
  assert.deepEqual(calls,['mem_hold_bookings','mem_reserve_skate_jam_hire','release']);assert.equal(checkout,null);
});
test('inventory outage fails closed before payment',async()=>{
  reset();reservationError='database unavailable';assert.equal((await POST(request())).status,503);assert.equal(checkout,null);assert.ok(calls.includes('release'));
});
test('subscription-covered participants, unrelated sessions and invalid sizes cannot reserve hire',async()=>{
  reset();covered=true;assert.equal((await POST(request())).status,409);assert.deepEqual(calls,[]);
  reset();slug='sk8-skool-kidz';assert.equal((await POST(request())).status,400);assert.deepEqual(calls,[]);
  reset();assert.equal((await POST(request(11))).status,400);assert.deepEqual(calls,[]);
  reset();authenticated=false;assert.equal((await POST(request())).status,401);assert.deepEqual(calls,[]);
});
test('legacy baskets without hire keep working and claim no skates',async()=>{
  reset();const req=new Request('https://example.test/api/bookings',{method:'POST',body:JSON.stringify({occurrence_id:occurrence,participant_ids:[participant]})});
  assert.equal((await POST(req)).status,201);assert.equal(calls.includes('mem_reserve_skate_jam_hire'),false);
});
