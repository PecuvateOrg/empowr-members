import {test} from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {occurrenceEvent,courseEvents,syncSessionCalendar,SESSION_SOURCE,type SessionOccurrence,type SessionRun} from "../../src/lib/session-calendar.ts";
import {eventsMatch,type CalendarTransport,type RemoteEvent} from "../../src/lib/private-calendar.ts";
const venue={name:"Hall",address:"1 Test Road",postcode:"AB1 2CD"};
const offering={title:"Skate Jam",slug:"skate-jam",active:true,enrolment_scope:"per_occurrence",venue};
const occurrence:SessionOccurrence={id:"00000000-0000-4000-8000-000000000001",status:"scheduled",starts_at:"2030-11-02T15:00:00Z",ends_at:"2030-11-02T17:00:00Z",venue:null,offering};
const run:SessionRun={id:"00000000-0000-4000-8000-000000000002",label:"Autumn",starts_on:"2030-10-19",ends_on:"2030-11-02",starts_at_local:"15:00:00",ends_at_local:"17:00:00",venue:null,offering:{...offering,enrolment_scope:"per_run"}};
const now=new Date("2030-10-01T00:00:00Z");
function service(occurrences:SessionOccurrence[],runs:SessionRun[]=[],fail=false){
 const read=new Set<string>();
 return {from(table:string){const q={select(){return this;},order(){return this;},limit(){return this;},gt(){return this;},then(resolve:(v:unknown)=>unknown){const data=read.has(table)?[]:table==="mem_occurrences"?occurrences:runs;read.add(table);return Promise.resolve({data,error:fail?{message:"down"}:null}).then(resolve);}};return q;}} as unknown as SupabaseClient;
}
function calendar(initial:RemoteEvent[]=[]){
 const events=new Map(initial.map(e=>[e.id!,e]));const calls:string[]=[];
 const transport:CalendarTransport={async request(method,path,body){calls.push(method);
  if(path.startsWith("?"))return {status:200,body:{items:[...events.values()]}};
  const id=path.slice(1);if(method==="GET")return {status:events.has(id)?200:404,body:events.get(id)??{}};
  if(method==="DELETE"){events.delete(id);return {status:204,body:{}};}
  const e=body as RemoteEvent;events.set(e.id!,e);return {status:200,body:e};
 }};return {events,transport,calls};
}
test("session uses website title, full fallback venue, per-date override and no customer data",()=>{
 const e=occurrenceEvent(occurrence)!;assert.equal(e.summary,"Skate Jam");assert.equal(e.location,"Hall, 1 Test Road, AB1 2CD");
 assert.equal(occurrenceEvent({...occurrence,venue:{...venue,name:"Other hall"}})!.location,"Other hall, 1 Test Road, AB1 2CD");
 assert.equal(occurrenceEvent({...occurrence,status:"cancelled"}),null);
 assert.equal(occurrenceEvent({...occurrence,offering:{...offering,active:false}}),null);
 assert.match(e.id,/^[a-v0-9]+$/);assert.match(e.description,/sessions\/skate-jam/);
});
test("weekly course dates preserve London meeting time across clock change",()=>{
 const events=courseEvents(run,now);assert.equal(events.length,3);
 assert.equal(events[0].start.dateTime,"2030-10-19T14:00:00.000Z");
 assert.equal(events[2].start.dateTime,"2030-11-02T15:00:00.000Z");
 assert.equal(new Set(events.map(e=>e.id)).size,3);
 assert.equal(courseEvents(run,new Date("2030-11-01T00:00:00Z")).length,1);
 assert.throws(()=>courseEvents({...run,starts_at_local:null},now),/incomplete/);
});
test("Google timestamp normalization and omitted empty location do not cause repeated writes",()=>{
 const desired={...occurrenceEvent(occurrence)!,location:""};const actual:RemoteEvent={...desired,start:{...desired.start,dateTime:"2030-11-02T15:00:00+00:00"},location:undefined};
 assert.equal(eventsMatch(actual,desired),true);
});
test("created, edited and hard-deleted sessions mirror without duplicates",async()=>{
 const c=calendar();await syncSessionCalendar(service([occurrence]),c.transport,now);
 assert.equal(c.events.size,1);
 await syncSessionCalendar(service([{...occurrence,offering:{...offering,title:"Updated session"}}]),c.transport,now);
 assert.equal(c.events.size,1);assert.equal([...c.events.values()][0].summary,"Updated session");
 await syncSessionCalendar(service([]),c.transport,now);assert.equal(c.events.size,0);
});
test("cancelled or unpublished sessions disappear, unrelated calendar events survive",async()=>{
 const owned=occurrenceEvent(occurrence)!;const c=calendar([owned,{id:"manual",summary:"Staff entry",extendedProperties:{private:{source:"manual"}}}]);
 await syncSessionCalendar(service([{...occurrence,status:"cancelled"}]),c.transport,now);
 assert.equal(c.events.size,1);assert.ok(c.events.has("manual"));
});
test("failed database reads never delete calendar entries",async()=>{
 const c=calendar([occurrenceEvent(occurrence)!]);await assert.rejects(syncSessionCalendar(service([],[],true),c.transport,now),/read_failed/);
 assert.equal(c.events.size,1);assert.deepEqual(c.calls,[]);
});
test("incomplete course schedule retains its existing events and flags a failure",async()=>{
 const c=calendar(courseEvents(run,now));const result=await syncSessionCalendar(service([],[{...run,starts_at_local:null}]),c.transport,now);
 assert.equal(result.failed,1);assert.equal(c.events.size,3);
});
test("Google list pagination protects later events and failed list never deletes",async()=>{
 const c=calendar([occurrenceEvent(occurrence)!]);let pages=0;
 const transport:CalendarTransport={async request(method,path,body,etag){if(path.startsWith("?")){pages++;return pages===1?{status:200,body:{items:[],nextPageToken:"next"}}:{status:200,body:{items:[...c.events.values()]}};}return c.transport.request(method,path,body,etag);}};
 await syncSessionCalendar(service([]),transport,now);assert.equal(pages,2);assert.equal(c.events.size,0);
 await assert.rejects(syncSessionCalendar(service([]),{async request(){return {status:503,body:{}};}},now),/list_failed/);
 assert.equal(SESSION_SOURCE,"members-sessions-v1");
});
