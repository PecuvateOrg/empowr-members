import { test, mock } from "node:test";
import assert from "node:assert/strict";
const secret="test-only-credential-not-a-real-secret";
const venue={name:"Test hall",address:null,postcode:null};
const basic={id:"offering",title:"Test session",active:true,enrolment_scope:"per_occurrence",venue};
const occurrence=()=>({id:"one",status:"scheduled",starts_at:"2099-10-24T17:00:00Z",ends_at:"2099-10-24T18:00:00Z",venue:null,offering:basic});
const course=()=>({id:"run",starts_on:"2099-10-18",ends_on:"2099-11-08",starts_at_local:"18:00:00",ends_at_local:"19:00:00",venue:null,offering:{...basic,enrolment_scope:"per_run"}});
let occurrences:ReturnType<typeof occurrence>[]=[];
let runs:ReturnType<typeof course>[]=[];
let fail=false,reads=0;
mock.module("next/server",{namedExports:{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}}});
mock.module("@/lib/supabase/service",{namedExports:{createServiceClient:()=>({from:(table:string)=>{
  assert.ok(["mem_occurrences","mem_course_runs"].includes(table));
  let cursor="";
  const query={select:(fields:string)=>{assert.doesNotMatch(fields,/member_id|email|payment|booking/);return query;},order:()=>query,limit:()=>query,gt:(_field:string,value:string)=>{cursor=value;return query;},then:(resolve:(x:unknown)=>void)=>{
    reads++;
    const rows=table==="mem_occurrences"?occurrences:runs;
    resolve(fail?{data:null,error:{message:"outage"}}:{data:rows.filter(r=>r.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,100),error:null});
  }};
  return query;
}})}});
const {GET}=await import("@/app/api/integrations/eccp/schedule/route");
function reset(){process.env.MEMBERS_ECCP_SCHEDULE_SECRET=secret;occurrences=[occurrence()];runs=[course()];fail=false;reads=0;}
function request(query="",token=secret){return GET(new Request("https://example.test/schedule"+query,{headers:{authorization:"Bearer "+token}}));}
test("unauthorised and unconfigured requests never read data",async()=>{reset();assert.equal((await request("","wrong")).status,401);delete process.env.MEMBERS_ECCP_SCHEDULE_SECRET;assert.equal((await request()).status,503);assert.equal(reads,0);});
test("weekly dates and London DST, with no booking data",async()=>{reset();const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");const body=await response.json();assert.equal(body.sessions.length,5);const dates=body.sessions.filter((s:{source_key:string})=>s.source_key.startsWith("course-run:"));assert.equal(dates[0].starts_at,"2099-10-18T17:00:00.000Z");assert.equal(dates.at(-1).starts_at,"2099-11-08T18:00:00.000Z");});
test("reschedules preserve occurrence identity; cancellation is explicit",async()=>{reset();const before=await (await request()).json();occurrences[0].starts_at="2099-10-25T17:00:00Z";occurrences[0].ends_at="2099-10-25T18:00:00Z";occurrences[0].status="cancelled";const after=await (await request()).json();assert.notEqual(before.snapshot_version,after.snapshot_version);const row=after.sessions.find((s:{source_key:string})=>s.source_key==="occurrence:one");assert.equal(row.status,"cancelled");assert.equal(row.starts_at,"2099-10-25T17:00:00.000Z");});
test("failed reads and incomplete run times fail closed",async()=>{reset();fail=true;assert.equal((await request()).status,503);reset();runs[0].starts_at_local="";assert.equal((await request()).status,503);});
test("bounded pages and changed snapshot rejection",async()=>{reset();runs=[];occurrences=Array.from({length:251},(_,i)=>({...occurrence(),id:String(i).padStart(4,"0")}));const first=await (await request()).json();assert.equal(first.sessions.length,250);assert.equal(first.complete,false);assert.equal(first.next_offset,250);const query="?offset=250&snapshot_version="+first.snapshot_version;const second=await (await request(query)).json();assert.equal(second.sessions.length,1);assert.equal(second.complete,true);occurrences.pop();assert.equal((await request(query)).status,409);assert.equal((await request("?offset=250")).status,400);});

test("deleted occurrences and deactivated offerings disappear from a complete snapshot",async()=>{
  reset();
  const before=await (await request()).json();
  occurrences=[];
  runs[0].offering={...runs[0].offering,active:false};
  const response=await request();
  assert.equal(response.status,200);
  const after=await response.json();
  assert.equal(after.complete,true);
  assert.equal(after.total,0);
  assert.deepEqual(after.sessions,[]);
  assert.notEqual(after.snapshot_version,before.snapshot_version);
});
test("course shortening retains stable keys for unchanged dates",async()=>{
  reset();
  const before=await (await request()).json();
  runs[0].ends_on="2099-10-25";
  const after=await (await request()).json();
  assert.equal(after.complete,true);
  assert.equal(after.total,3);
  assert.deepEqual(after.sessions,before.sessions.filter((s:{source_key:string})=>!s.source_key.endsWith("2099-11-01")&&!s.source_key.endsWith("2099-11-08")));
  assert.notEqual(after.snapshot_version,before.snapshot_version);
});
test("per-run occurrences are not duplicated in the weekly schedule",async()=>{
  reset();
  occurrences[0].offering={...basic,enrolment_scope:"per_run"};
  const body=await (await request()).json();
  assert.equal(body.total,4);
  assert.ok(body.sessions.every((s:{source_key:string})=>s.source_key.startsWith("course-run:")));
});
