import test from "node:test";
import assert from "node:assert/strict";
import {
  addMemberToBrevo,
  brevoListKeyForOffering,
  brevoListKeyForPlan,
  configuredBrevoLists,
} from "../../src/lib/brevo.ts";
import { emailForAccount } from "../../src/lib/reconcile-brevo.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

test("maps every supplied session family", () => {
  assert.equal(brevoListKeyForOffering({ title: "Skate Jam" }), "skateJam");
  assert.equal(brevoListKeyForOffering({ title: "SYNKRON8" }), "synkron8");
  assert.equal(brevoListKeyForOffering({ title: "Beginners Foundations" }), "beginnersFoundations");
  assert.equal(brevoListKeyForOffering({ title: "Prep to Street Skate" }), "prepToStreet");
  assert.equal(brevoListKeyForOffering({ title: "Roller Skate Events 15+" }), "adultRollerEvents");
  assert.equal(brevoListKeyForOffering({ title: "Roller Quad Camp" }), "rollerQuadCamp");
});

test("routes Kidz Monday and Wednesday by Europe/London weekday", () => {
  assert.equal(brevoListKeyForOffering({ title: "Sk8 Skool for Kidz", startsAt: "2026-09-07T15:00:00Z" }), "sk8KidzMonday");
  assert.equal(brevoListKeyForOffering({ title: "Sk8 Skool for Kidz", startsAt: "2026-09-09T16:00:00Z" }), "sk8KidzWednesday");
});

test("maps the five live Stripe subscription lookup keys", () => {
  assert.equal(brevoListKeyForPlan("members_skate_jam_monthly"), "skateJam");
  assert.equal(brevoListKeyForPlan("members_synkron8_monthly"), "synkron8");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_kidz_mon_monthly"), "sk8KidzMonday");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_kidz_wed_monthly"), "sk8KidzWednesday");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_all_ages_monthly"), "sk8AllAges");
});

test("uses permanent defaults and accepts valid environment overrides", () => {
  const lists = configuredBrevoLists({
    BREVO_SKATE_JAM_LIST_ID: "110",
    BREVO_SYNKRON8_LIST_ID: "not-a-number",
  } as NodeJS.ProcessEnv);
  assert.equal(lists.get("skateJam"), 110);
  assert.equal(lists.has("synkron8"), false);
  assert.equal(lists.get("rollerQuadCamp"), 16);
});

test("resolves a member account to its Auth user before reading email", async () => {
  const authLookups: string[] = [];
  const service = {
    from(table: string) {
      assert.equal(table, "mem_accounts");
      return {
        select() { return this; },
        eq(column: string, value: string) {
          assert.equal(column, "id");
          assert.equal(value, "account_1");
          return this;
        },
        async maybeSingle() {
          return { data: { user_id: "auth_user_1" }, error: null };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(userId: string) {
          authLookups.push(userId);
          return { data: { user: { email: " Member@Example.org " } }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  assert.equal(await emailForAccount(service, "account_1"), "member@example.org");
  assert.deepEqual(authLookups, ["auth_user_1"]);
});

test("PAYG backfill requires a Stripe payment reference", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "../../src/lib/reconcile-brevo.ts"),
    "utf8"
  );
  assert.match(source, /\.not\("stripe_payment_intent_id", "is", null\)/);
});


/** Brevo stub. `contactLists` is null when Brevo has no such contact (404). */
function brevoStub(contactLists: number[] | null) {
  const requests: Array<{ url: string; body: unknown }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requests.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    // The contact lookup is the only /contacts/<id> path without /lists/.
    if (url.includes("/contacts/") && !url.includes("/lists/")) {
      return contactLists === null
        ? new Response(null, { status: 404 })
        : Response.json({ listIds: contactLists });
    }
    return new Response(null, { status: 204 });
  };
  return { requests, request: request as typeof fetch };
}

const removeUrl = (listId: number) =>
  `https://api.brevo.com/v3/contacts/lists/${listId}/contacts/remove`;

test("enrols a member and removes them from general only when they are on it", async () => {
  const { requests, request } = brevoStub([3, 5]);

  assert.deepEqual(
    await addMemberToBrevo(
      " Member@Example.org ",
      { BREVO_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      request
    ),
    { skipped: false }
  );
  assert.deepEqual(requests, [{
    url: "https://api.brevo.com/v3/contacts/member%40example.org",
    body: null,
  }, {
    url: "https://api.brevo.com/v3/contacts",
    body: { email: "member@example.org", listIds: [17], updateEnabled: true },
  }, {
    url: removeUrl(3),
    body: { emails: ["member@example.org"] },
  }]);
});

// The regression that matters: Brevo rejects removing a contact that is not on
// the list, and platform signups were never on the general newsletter — so an
// unconditional removal fails for the majority of members, not a rare edge.
test("does not attempt a general removal for a member who was never on it", async () => {
  const { requests, request } = brevoStub([5]);

  assert.deepEqual(
    await addMemberToBrevo(
      "member@example.org",
      { BREVO_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      request
    ),
    { skipped: false }
  );
  assert.equal(requests.length, 2);
  assert.ok(!requests.some((r) => r.url === removeUrl(3)));
});

test("treats an unknown Brevo contact as not on the general list", async () => {
  const { requests, request } = brevoStub(null);

  assert.deepEqual(
    await addMemberToBrevo(
      "newcomer@example.org",
      { BREVO_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      request
    ),
    { skipped: false }
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.body, {
    email: "newcomer@example.org",
    listIds: [17],
    updateEnabled: true,
  });
});

test("accepts replacement member and general list ids", async () => {
  const { requests, request } = brevoStub([99]);

  await addMemberToBrevo(
    "member@example.org",
    {
      BREVO_API_KEY: "test-key",
      BREVO_MEMBERS_LIST_ID: "42",
      BREVO_GENERAL_LIST_ID: "99",
    } as NodeJS.ProcessEnv,
    request
  );
  assert.deepEqual(requests[1]?.body, {
    email: "member@example.org",
    listIds: [42],
    updateEnabled: true,
  });
  assert.equal(requests[2]?.url, removeUrl(99));
});
