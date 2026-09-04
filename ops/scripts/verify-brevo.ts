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


test("adds a verified member to list 17 and removes only general list 3", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input.toString(),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(null, { status: 204 });
  };

  assert.deepEqual(
    await addMemberToBrevo(
      " Member@Example.org ",
      { BREVO_API_KEY: "test-key" } as NodeJS.ProcessEnv,
      request as typeof fetch
    ),
    { skipped: false }
  );
  assert.deepEqual(requests, [{
    url: "https://api.brevo.com/v3/contacts",
    body: { email: "member@example.org", listIds: [17], updateEnabled: true },
  }, {
    url: "https://api.brevo.com/v3/contacts/lists/3/contacts/remove",
    body: { emails: ["member@example.org"] },
  }]);
});

test("accepts a replacement member-list id without changing general list 3", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input.toString(),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(null, { status: 204 });
  };

  await addMemberToBrevo(
    "member@example.org",
    { BREVO_API_KEY: "test-key", BREVO_MEMBERS_LIST_ID: "42" } as NodeJS.ProcessEnv,
    request as typeof fetch
  );
  assert.deepEqual(requests[0]?.body, {
    email: "member@example.org",
    listIds: [42],
    updateEnabled: true,
  });
  assert.equal(requests[1]?.url, "https://api.brevo.com/v3/contacts/lists/3/contacts/remove");
});
