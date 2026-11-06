import { createClient } from "@supabase/supabase-js";
import { googleTransport, syncPrivateCalendar } from "../lib/private-calendar";

// AWS EventBridge: rate(5 minutes), input {"job":"private-calendar"}.
// This runs outside checkout; Google outages cannot affect paid reservations.
export default async function privateCalendar(): Promise<Response> {
  if (process.env.MEMBERS_GOOGLE_CALENDAR_ENABLED !== "1") return new Response(null,{status:204});
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calendarId = process.env.MEMBERS_GOOGLE_CALENDAR_ID;
  const credentials = process.env.MEMBERS_GOOGLE_CALENDAR_SA_KEY_PROD;
  if (!url || !serviceKey || !calendarId || !credentials) {
    console.error("private_calendar_configuration_missing");
    return new Response(null,{status:500});
  }
  try {
    const service = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const result = await syncPrivateCalendar(service,googleTransport(calendarId,credentials));
    console.log("private_calendar_sync",result);
    return new Response(null,{status:result.failed ? 500 : 200});
  } catch {
    console.error("private_calendar_sync_failed");
    return new Response(null,{status:500});
  }
}
