// Brevo session-list integration. No `server-only`: this module is also used
// by the esbuild-bundled Netlify scheduled function. It contains no secret at
// build time; credentials are read only when a server-side function calls it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ageOn } from "@/lib/age";

export const BREVO_LIST_ENV = {
  synkron8: "BREVO_SYNKRON8_LIST_ID",
  beginnersFoundations: "BREVO_BEGINNERS_FOUNDATIONS_LIST_ID",
  prepToStreet: "BREVO_PREP_TO_STREET_LIST_ID",
  skateJam: "BREVO_SKATE_JAM_LIST_ID",
  sk8KidzMonday: "BREVO_SK8_KIDZ_MONDAY_LIST_ID",
  sk8KidzWednesday: "BREVO_SK8_KIDZ_WEDNESDAY_LIST_ID",
  sk8AllAges: "BREVO_SK8_ALL_AGES_LIST_ID",
  adultRollerEvents: "BREVO_ADULT_ROLLER_EVENTS_LIST_ID",
  kidzRollerEvents: "BREVO_KIDZ_ROLLER_EVENTS_LIST_ID",
  rollerQuadCamp: "BREVO_ROLLER_QUAD_CAMP_LIST_ID",
} as const;

export type BrevoListKey = keyof typeof BREVO_LIST_ENV;

// Brevo list IDs are public configuration, not credentials. Keeping the
// agreed permanent session lists here means Netlify only needs BREVO_API_KEY.
// Environment overrides remain available if a list is ever replaced.
export const DEFAULT_BREVO_LIST_IDS: Record<BrevoListKey, number> = {
  synkron8: 7,
  beginnersFoundations: 8,
  prepToStreet: 9,
  skateJam: 10,
  sk8KidzMonday: 11,
  sk8KidzWednesday: 12,
  sk8AllAges: 13,
  adultRollerEvents: 14,
  kidzRollerEvents: 15,
  rollerQuadCamp: 16,
};

export function configuredBrevoLists(
  env: NodeJS.ProcessEnv = process.env
): Map<BrevoListKey, number> {
  const result = new Map<BrevoListKey, number>();
  for (const [key, variable] of Object.entries(BREVO_LIST_ENV) as [
    BrevoListKey,
    string,
  ][]) {
    const configured = env[variable];
    const value = configured ? Number(configured) : DEFAULT_BREVO_LIST_IDS[key];
    if (Number.isInteger(value) && value > 0) result.set(key, value);
  }
  return result;
}

const normalise = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve a website offering to its operational Brevo list. */
export function brevoListKeyForOffering(input: {
  slug?: string | null;
  title?: string | null;
  startsAt?: string | null;
}): BrevoListKey | null {
  const value = normalise(`${input.slug ?? ""} ${input.title ?? ""}`);
  if (value.includes("roller quad camp")) return "rollerQuadCamp";
  if (value.includes("beginners foundation")) return "beginnersFoundations";
  if (value.includes("prep to street")) return "prepToStreet";
  if (value.includes("synkron8")) return "synkron8";
  if (value.includes("skate jam")) return "skateJam";
  if (value.includes("adult roller") || value.includes("roller skate events 15")) {
    return "adultRollerEvents";
  }
  if (value.includes("kidz roller") || value.includes("kids roller") || value.includes("children roller")) {
    return "kidzRollerEvents";
  }
  if (value.includes("sk8 skool") && (value.includes("all ages") || value.includes("everyone"))) {
    return "sk8AllAges";
  }
  if (value.includes("sk8 skool") && (value.includes("kidz") || value.includes("kids"))) {
    if (!input.startsAt) return null;
    const weekday = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    }).format(new Date(input.startsAt));
    if (weekday === "Mon") return "sk8KidzMonday";
    if (weekday === "Wed") return "sk8KidzWednesday";
  }
  return null;
}

export function brevoListKeyForPlan(lookupKey: string | null): BrevoListKey | null {
  switch (lookupKey) {
    case "members_synkron8_monthly": return "synkron8";
    case "members_skate_jam_monthly": return "skateJam";
    case "members_sk8_skool_all_ages_monthly": return "sk8AllAges";
    case "members_sk8_skool_kidz_mon_monthly": return "sk8KidzMonday";
    case "members_sk8_skool_kidz_wed_monthly": return "sk8KidzWednesday";
    default: return null;
  }
}

type BrevoContact = { email?: string };

export class BrevoClient {
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  constructor(
    apiKey: string,
    request: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.request = request;
  }

  private async call(path: string, init: RequestInit = {}) {
    const response = await this.request(`https://api.brevo.com/v3${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Brevo ${init.method ?? "GET"} ${path} failed (${response.status})`);
    }
    return response;
  }

  async ensureContactOnLists(email: string, listIds: number[]): Promise<void> {
    if (listIds.length === 0) return;
    await this.call("/contacts", {
      method: "POST",
      body: JSON.stringify({ email, listIds, updateEnabled: true }),
    });
  }

  async contactsOnList(listId: number): Promise<string[]> {
    const emails: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const response = await this.call(`/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`);
      const body = (await response.json()) as { contacts?: BrevoContact[] };
      const page = (body.contacts ?? []).flatMap((c) => c.email ? [c.email.toLowerCase()] : []);
      emails.push(...page);
      if (page.length < 500) return emails;
    }
  }

  async removeEmailsFromList(listId: number, emails: string[]): Promise<void> {
    for (let start = 0; start < emails.length; start += 150) {
      await this.call(`/contacts/lists/${listId}/contacts/remove`, {
        method: "POST",
        body: JSON.stringify({ emails: emails.slice(start, start + 150) }),
      });
    }
  }
}


type SignupBrevoSyncInput = {
  service: SupabaseClient;
  accountId: string;
  email: string;
  marketingConsent: boolean;
};

// Bounds the signup-path call only. Deliberately not applied inside
// BrevoClient.call(): the nightly reconciliation shares it and pages through
// bulk contact reads, where a signup-sized limit would cut the job short.
const BREVO_SIGNUP_TIMEOUT_MS = 3000;

/**
 * fetch with a hard time bound. The try/catch in syncBrevoForAccount already
 * absorbs a Brevo *failure*, but an unanswered request is silence, not an
 * error — without this the participant POST hangs until the function times
 * out, the caller never sees its 201, and a retry duplicates the participant.
 */
function timeoutFetch(ms: number): typeof fetch {
  return (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

/**
 * Add a consenting account holder to the adult, parents/kids, or both lists
 * based on the ages of the skaters saved to their household. Best-effort:
 * Brevo must never prevent a participant from being created.
 */
export async function syncBrevoForAccount(
  input: SignupBrevoSyncInput
): Promise<void> {
  if (!input.marketingConsent) return;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("Brevo signup sync skipped: BREVO_API_KEY is missing");
    return;
  }

  try {
    const { data, error } = await input.service
      .from("mem_participants")
      .select("dob")
      .eq("account_id", input.accountId);
    if (error) {
      console.error("Brevo signup sync: participant read failed", error);
      return;
    }

    const ages = (data ?? []).map((row) => ageOn(row.dob as string));
    const lists = configuredBrevoLists();
    const listIds = [
      ...(ages.some((age) => age >= 18)
        ? [lists.get("adultRollerEvents")]
        : []),
      ...(ages.some((age) => age < 18)
        ? [lists.get("kidzRollerEvents")]
        : []),
    ].filter((id): id is number => id !== undefined);

    await new BrevoClient(
      apiKey,
      timeoutFetch(BREVO_SIGNUP_TIMEOUT_MS)
    ).ensureContactOnLists(input.email, listIds);
  } catch (error) {
    console.error("Brevo signup sync failed", error);
  }
}

/**
 * Add an activated Members account to the dedicated member-information list.
 *
 * This contains every account holder, whether or not they book or subscribe.
 * Empowr Members is permanent Brevo list 17. Members are removed from general
 * list 3 because list 17 receives the general news too; lists 4 and 5 remain.
 */
export async function addMemberToBrevo(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<{ skipped: boolean }> {
  const apiKey = env.BREVO_API_KEY;
  const listId = Number(env.BREVO_MEMBERS_LIST_ID || 17);
  if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
    return { skipped: true };
  }

  const client = new BrevoClient(apiKey, request);
  const normalisedEmail = email.trim().toLowerCase();
  await client.ensureContactOnLists(normalisedEmail, [listId]);
  await client.removeEmailsFromList(3, [normalisedEmail]);
  return { skipped: false };
}
