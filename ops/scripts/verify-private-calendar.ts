import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingEvent, calendarEventId, syncBooking, syncPrivateCalendar, type CalendarBooking, type CalendarTransport, type RemoteEvent } from "../../src/lib/private-calendar.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const booking: CalendarBooking = { id:"00000000-0000-4000-8000-000000000001",kind:"birthday",status:"confirmed",starts_at:"2030-06-01T14:00:00Z",ends_at:"2030-06-01T16:00:00Z",total_places:13,host:null,venue:{name:"Test venue"},places:[{equipment:"hire",hire_size:"UK4-UK7"},{equipment:"gear",hire_size:null}] };
function fake(initial?: RemoteEvent) {
 let event=initial;
 const calls: string[]=[];
 const transport: CalendarTransport = {async request(method,_path,body) {
   calls.push(method);
   if(method==="GET") return {status:event ? 200:404,body:event??{}};
   if(method==="DELETE") {event=undefined;return {status:204,body:{}};}
   event=body as RemoteEvent;return {status:200,body:event};
 }};
 return {transport,calls,getEvent:()=>event};
}
test("unclaimed paid party has capacity, equipment totals and staff link, no private fields",()=>{
 const event=bookingEvent({...booking, note:"PRIVATE NOTE",email:"private@example.test",guest_name:"CHILD"} as CalendarBooking);
 assert.match(event.summary,/13 skaters/);assert.match(event.description,/Awaiting organiser registration/);
 assert.match(event.description,/Skate hire UK4-UK7: 1/);assert.match(event.description,/Protective gear only: 1/);
 assert.match(event.description,/checkin\/private\//);
 assert.doesNotMatch(JSON.stringify(event),/PRIVATE NOTE|private@example|CHILD|attendees/);
 assert.equal(event.start.timeZone,"Europe/London");
 assert.match(calendarEventId(booking.id),/^[a-v0-9]{5,1024}$/);
});
test("absolute instants retained across British summer/winter time",()=>{
 for(const start of ["2030-06-01T15:00:00+01:00","2030-12-07T15:00:00+00:00"]) {
  assert.equal(Date.parse(bookingEvent({...booking,starts_at:start}).start.dateTime),Date.parse(start));
 }
});
test("create, retry, top-up, claim, and cancellation maintain a single event",async()=>{
 const f=fake();await syncBooking(booking,f.transport);await syncBooking(booking,f.transport);
 assert.deepEqual(f.calls,["GET","POST","GET"]);
 await syncBooking({...booking,total_places:15,host:{name:"Test organiser"}},f.transport);
 assert.match(f.getEvent()!.summary!,/15 skaters/);assert.match(f.getEvent()!.description!,/Test organiser/);
 assert.equal(f.getEvent()!.id,calendarEventId(booking.id));
 await syncBooking({...booking,status:"cancelled"},f.transport);assert.equal(f.getEvent(),undefined);
 await syncBooking({...booking,status:"cancelled"},f.transport);
 assert.equal(f.calls.filter(x=>x==="DELETE").length,1);
});
test("blocks create Unavailable and pending holds create nothing",async()=>{
 const f=fake();await syncBooking({...booking,status:"pending_payment"},f.transport);assert.equal(f.getEvent(),undefined);
 await syncBooking({...booking,kind:"block"},f.transport);assert.equal(f.getEvent()!.summary,"Unavailable");
});
test("unrelated events are never overwritten or deleted",async()=>{
 const f=fake({summary:"Staff event",status:"confirmed"});
 await assert.rejects(syncBooking(booking,f.transport),/ownership_mismatch/);
 await assert.rejects(syncBooking({...booking,status:"cancelled"},f.transport),/ownership_mismatch/);
 assert.deepEqual(f.calls,["GET","GET"]);
});
test("outages and conflicting creates fail for scheduled retry without duplicate IDs",async()=>{
 await assert.rejects(syncBooking(booking,{async request(){return {status:503,body:{}};}}),/503/);
 const calls:string[]=[];
 await assert.rejects(syncBooking(booking,{async request(method){calls.push(method);return {status:method==="GET"?404:409,body:{}};}}),/409/);
 assert.deepEqual(calls,["GET","POST"]);
});
test("reconcile pages all rows, skips holds, continues failures, never writes bookings",async()=>{
 const f=fake();let page=0;
 const rows=[[{...booking,status:"pending_payment"}],[booking],[]];
 const query={select(){return this;},gte(){return this;},order(){return this;},limit(){return this;},gt(){return this;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:rows[page++],error:null}).then(resolve);}};
 const service={from(table:string){assert.equal(table,"mem_private_bookings");return query;}} as unknown as SupabaseClient;
 assert.deepEqual(await syncPrivateCalendar(service,f.transport),{synced:1,failed:0});assert.equal(page,3);
 page=0;
 assert.deepEqual(await syncPrivateCalendar(service,{async request(){throw new Error("outage");}}),{synced:0,failed:1});
});
test("database failure aborts without calendar writes",async()=>{
 const f=fake();
 const query={select(){return this;},gte(){return this;},order(){return this;},limit(){return Promise.resolve({data:null,error:{message:"down"}});}};
 await assert.rejects(syncPrivateCalendar({from(){return query;}} as unknown as SupabaseClient,f.transport),/read_failed/);
 assert.deepEqual(f.calls,[]);
});
