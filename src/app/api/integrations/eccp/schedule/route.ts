import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { foundationSessionDates } from "@/lib/course-attendance";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"no-store"};
const zone = "Europe/London";
type Venue = {name:string; address:string|null; postcode:string|null};
type Offering = {id:string;title:string;active:boolean;enrolment_scope:string;venue:Venue|null};
type Occurrence = {id:string;status:string;starts_at:string;ends_at:string;venue:Venue|null;offering:Offering|null};
type Run = {id:string;starts_on:string|null;ends_on:string|null;starts_at_local:string|null;ends_at_local:string|null;venue:Venue|null;offering:Offering|null};
type Session = {source_key:string;offering_id:string;title:string;starts_at:string;ends_at:string;venue:Venue|null;status:string};
const digest = (s:string) => createHash("sha256").update(s).digest();
const fields = "name,address,postcode";
const offering = `offering:mem_offerings(id,title,active,enrolment_scope,venue:mem_venues(${fields}))`;
async function readAll<T>(service:ReturnType<typeof createServiceClient>,table:string,select:string):Promise<T[]> {
  const out:T[]=[]; let cursor:string|null=null;
  for(let page=0;page<1000;page++){
    let query=service.from(table).select(select).order("id").limit(100);
    if(cursor) query=query.gt("id",cursor);
    const {data,error}=await query;
    if(error || !data) throw new Error("schedule_read_failed");
    if(!data.length) return out;
    out.push(...data as unknown as T[]);
    const next=(data as unknown as {id:string}[]).at(-1)?.id;
    if(!next || next===cursor) throw new Error("schedule_cursor_failed");
    cursor=next;
  }
  throw new Error("schedule_limit");
}
export async function GET(request:Request) {
  const secret=process.env.MEMBERS_ECCP_SCHEDULE_SECRET;
  if(!secret || secret.length<32) return NextResponse.json({error:"Unavailable"},{status:503,headers});
  if(!timingSafeEqual(digest(request.headers.get("authorization")??""),digest("Bearer "+secret))) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try {
    const service=createServiceClient();
    const now=new Date();
    const today=formatInTimeZone(now,zone,"yyyy-MM-dd");
    const [occurrences,runs]=await Promise.all([
      readAll<Occurrence>(service,"mem_occurrences",`id,status,starts_at,ends_at,venue:mem_venues(${fields}),${offering}`),
      readAll<Run>(service,"mem_course_runs",`id,starts_on,ends_on,starts_at_local,ends_at_local,venue:mem_venues(${fields}),${offering}`)
    ]);
    const sessions:Session[]=[];
    function add(key:string,o:Offering,v:Venue|null,start:string,end:string,status:string){
      const a=new Date(start),b=new Date(end);
      if(!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b<=a) throw new Error("invalid_schedule");
      if(b<=now) return;
      sessions.push({source_key:key,offering_id:o.id,title:o.title,starts_at:a.toISOString(),ends_at:b.toISOString(),venue:v??o.venue,status});
    }
    for(const row of occurrences){
      const o=row.offering;
      if(!o?.active || o.enrolment_scope!=="per_occurrence") continue;
      add("occurrence:"+row.id,o,row.venue,row.starts_at,row.ends_at,row.status==="scheduled"?"scheduled":"cancelled");
    }
    for(const row of runs){
      const o=row.offering;
      if(!o?.active || o.enrolment_scope!=="per_run" || (row.ends_on && row.ends_on<today)) continue;
      if(!row.starts_on || !row.ends_on || !row.starts_at_local || !row.ends_at_local) throw new Error("incomplete_schedule");
      const dates=foundationSessionDates(row);
      if(!dates.length) throw new Error("invalid_run");
      for(const date of dates){
        if(date<today) continue;
        const start=fromZonedTime(date+"T"+row.starts_at_local,zone);
        const end=fromZonedTime(date+"T"+row.ends_at_local,zone);
        add("course-run:"+row.id+":"+date,o,row.venue,start.toISOString(),end.toISOString(),"scheduled");
      }
    }
    sessions.sort((a,b)=>a.source_key.localeCompare(b.source_key));
    if(new Set(sessions.map(s=>s.source_key)).size!==sessions.length) throw new Error("duplicate_schedule");
    return NextResponse.json({schema_version:1,generated_at:now.toISOString(),timezone:zone,complete:true,snapshot_version:digest(JSON.stringify(sessions)).toString("hex"),sessions},{headers});
  } catch {
    return NextResponse.json({error:"Schedule unavailable"},{status:503,headers});
  }
}
