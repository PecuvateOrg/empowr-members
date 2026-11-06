import type { SupabaseClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import { foundationSessionDates } from "./course-attendance";
import { membersUrl } from "./links";
import { calendarEventId, syncEvent, logCalendarFailure, type CalendarEvent, type CalendarTransport, type RemoteEvent } from "./private-calendar";

export const SESSION_SOURCE = "members-sessions-v1";
type Venue = {name:string;address:string|null;postcode:string|null};
type Offering = {title:string;slug:string;active:boolean;enrolment_scope:string;venue:Venue|null};
export type SessionOccurrence = {id:string;status:string;starts_at:string;ends_at:string;venue:Venue|null;offering:Offering|null};
export type SessionRun = {id:string;label:string;starts_on:string|null;ends_on:string|null;starts_at_local:string|null;ends_at_local:string|null;venue:Venue|null;offering:Offering|null};
const venueFields = "name,address,postcode";
const offeringFields = `title,slug,active,enrolment_scope,venue:mem_venues(${venueFields})`;
const sessionId = (id:string) => `session${calendarEventId(id).slice(3)}`;
const runId = (id:string,date:string) => `course${calendarEventId(id).slice(3)}${date.replaceAll("-","")}`;
function event(id:string,offering:Offering,venue:Venue|null,start:string,end:string,label?:string):CalendarEvent {
  return {id,status:"confirmed",summary:label ? `${offering.title} — ${label}` : offering.title,
    description:`Session details: ${membersUrl(`/sessions/${offering.slug}`)}\nMake changes in Members; calendar edits do not change the timetable.`,
    location:venue ? [venue.name,venue.address,venue.postcode].filter(Boolean).join(", ") : "",
    start:{dateTime:new Date(start).toISOString(),timeZone:"Europe/London"},
    end:{dateTime:new Date(end).toISOString(),timeZone:"Europe/London"},
    extendedProperties:{private:{source:SESSION_SOURCE}},reminders:{useDefault:false}};
}
export function occurrenceEvent(row:SessionOccurrence):CalendarEvent|null {
  if(row.status!=="scheduled" || !row.offering?.active || row.offering.enrolment_scope!=="per_occurrence") return null;
  return event(sessionId(row.id),row.offering,row.venue??row.offering.venue,row.starts_at,row.ends_at);
}
export function courseEvents(row:SessionRun,now:Date):CalendarEvent[] {
  if(!row.offering?.active || row.offering.enrolment_scope!=="per_run") return [];
  // Do not fabricate a midnight meeting if staff have not supplied times.
  if(!row.starts_on || !row.ends_on || !row.starts_at_local || !row.ends_at_local) throw new Error("calendar_course_schedule_incomplete");
  return foundationSessionDates(row).map(date=>{
    const start=fromZonedTime(`${date}T${row.starts_at_local}`,"Europe/London");
    const end=fromZonedTime(`${date}T${row.ends_at_local}`,"Europe/London");
    if(!(end>start)) throw new Error("calendar_course_schedule_invalid");
    return event(runId(row.id,date),row.offering!,row.venue??row.offering!.venue,start.toISOString(),end.toISOString(),row.label);
  }).filter(e=>Date.parse(e.end.dateTime)>now.getTime());
}
async function readAll(service:SupabaseClient,table:string,select:string):Promise<unknown[]> {
  const result:unknown[]=[];let cursor:string|null=null;
  for(;;){
    let query=service.from(table).select(select).order("id").limit(100);
    if(cursor) query=query.gt("id",cursor);
    const {data,error}=await query;
    if(error) throw new Error("calendar_session_read_failed");
    const rows=(data??[]) as unknown as {id:string}[];
    if(!rows.length) return result;
    result.push(...rows);cursor=rows[rows.length-1].id;
  }
}
export async function syncSessionCalendar(service:SupabaseClient,transport:CalendarTransport,now=new Date()) {
  // Complete both database reads before any deletion: a failed/partial read must
  // never be interpreted as staff deleting the timetable.
  const occurrences=await readAll(service,"mem_occurrences",`id,status,starts_at,ends_at,venue:mem_venues(${venueFields}),offering:mem_offerings(${offeringFields})`) as SessionOccurrence[];
  const runs=await readAll(service,"mem_course_runs",`id,label,starts_on,ends_on,starts_at_local,ends_at_local,venue:mem_venues(${venueFields}),offering:mem_offerings(${offeringFields})`) as SessionRun[];
  const desired=new Map<string,CalendarEvent>();
  for(const row of occurrences){
    if(Date.parse(row.ends_at)<=now.getTime()) continue;
    const e=occurrenceEvent(row);if(e) desired.set(e.id,e);
  }
  let failed=0;
  const protectedPrefixes:string[]=[];
  for(const row of runs){
    if(row.ends_on && row.ends_on<now.toISOString().slice(0,10)) continue;
    try {for(const e of courseEvents(row,now)) desired.set(e.id,e);}
    catch(error){failed++;protectedPrefixes.push(`course${calendarEventId(row.id).slice(3)}`);logCalendarFailure(row.id,error);}
  }
  // List only integration-owned upcoming events. Deletions are found here even
  // when staff hard-delete an occurrence or course run from the database.
  const existing:RemoteEvent[]=[];let page:string|undefined;
  do {
    const params=new URLSearchParams({privateExtendedProperty:`source=${SESSION_SOURCE}`,timeMin:now.toISOString(),maxResults:"250",showDeleted:"false"});
    if(page) params.set("pageToken",page);
    const response=await transport.request("GET",`?${params}`);
    if(response.status!==200 || !Array.isArray(response.body.items)) throw new Error("calendar_session_list_failed");
    existing.push(...response.body.items);page=response.body.nextPageToken;
  }while(page);
  const removals=existing.filter(e=>e.id && /^(session[0-9a-f]{32}|course[0-9a-f]{32}[0-9]{8})$/.test(e.id) && e.extendedProperties?.private?.source===SESSION_SOURCE && !desired.has(e.id) && !protectedPrefixes.some(p=>e.id!.startsWith(p)));
  const work=[...Array.from(desired,([id,e])=>({id,e:e as CalendarEvent|null})),...removals.map(e=>({id:e.id!,e:null}))];
  // Rotate work between runs and use bounded concurrency so one slow record
  // cannot permanently starve later sessions when the Lambda times out.
  const offset=work.length ? Math.floor(now.getTime()/300000)%work.length : 0;
  const rotated=[...work.slice(offset),...work.slice(0,offset)];let index=0,synced=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(index<rotated.length){const item=rotated[index++];try{await syncEvent(item.id,SESSION_SOURCE,item.e,transport);synced++;}catch(error){failed++;logCalendarFailure(item.id,error);}}
  }));
  return {synced,failed};
}
