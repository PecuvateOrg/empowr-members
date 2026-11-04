import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
let admin = true;
let signedIn = true;
let error: { message: string } | null = null;
let calls: { fn: string; args: Record<string, unknown> }[] = [];
const token = "a".repeat(64);
mock.module("server-only",{ namedExports: {} });
mock.module("next/server",{ namedExports: { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body,init) } } });
mock.module("@/lib/admin",{ namedExports: { getAuthedAdmin: async () => admin ? { id:"staff" } : null } });
mock.module("@/lib/auth",{ namedExports: { getAuthedAccount: async () => signedIn ? { account: { id:"account" } } : null } });
mock.module("@/lib/supabase/service",{ namedExports: { createServiceClient: () => ({ rpc: async (fn: string,args: Record<string,unknown>) => {calls.push({fn,args});return {data:{token,booking_id:"booking"},error};} }) } });
const { POST: create } = await import("../../src/app/api/admin/private-bookings/paid-registration/route.ts");
const { POST: claim } = await import("../../src/app/api/private-bookings/setup/[token]/route.ts");
const valid = { request_id:"00000000-0000-4000-8000-000000000001",email:" HOST@example.test ",starts_at:"2030-11-02T15:00:00Z",paid_places:10,paid_confirmed:true };
const request=(body: unknown={})=>new Request("https://example.test/api",{method:"POST",body:JSON.stringify(body)});
const context={params:Promise.resolve({token})};
beforeEach(()=>{admin=true;signedIn=true;error=null;calls=[];});
test("creation requires admin and explicit already-paid attestation",async()=>{
 admin=false;assert.equal((await create(request(valid))).status,401);assert.equal(calls.length,0);
 admin=true;assert.equal((await create(request({...valid,paid_confirmed:false}))).status,400);assert.equal(calls.length,0);
});
test("staff actor and paid count come from validated data; output is setup not checkout",async()=>{
 const response=await create(request({...valid,p_actor:"forged",total_places:999}));assert.equal(response.status,201);
 assert.equal(calls[0].args.p_actor,"staff");assert.equal(calls[0].args.p_email,"host@example.test");assert.equal(calls[0].args.p_paid_places,10);
 const result=await response.json();assert.match(result.url,/private-bookings\/setup\/a{64}$/);assert.equal(result.checkout_url,undefined);
});
test("claim is authenticated and cannot substitute an account ID",async()=>{
 signedIn=false;assert.equal((await claim(request(),context)).status,401);assert.equal(calls.length,0);
 signedIn=true;assert.equal((await claim(request({account_id:"forged"}),context)).status,200);
 assert.deepEqual(calls[0],{fn:"mem_claim_paid_party",args:{p_token:token,p_account_id:"account"}});
});
test("wrong recipient and invalid links fail without exposing email or booking data",async()=>{
 error={message:"mem_paid_party_forbidden"};const response=await claim(request(),context);assert.equal(response.status,409);assert.doesNotMatch(JSON.stringify(await response.json()),/host@example/);
 calls=[];assert.equal((await claim(request(),{params:Promise.resolve({token:"bad"})})).status,404);assert.equal(calls.length,0);
});
