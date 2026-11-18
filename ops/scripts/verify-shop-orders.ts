import assert from "node:assert/strict";
import test from "node:test";
import { readShopOrders, resetShopTokenCache, type ShopConfig } from "../../src/lib/shop-orders.ts";
const config: ShopConfig = { enabled: true, domain: "example-store.myshopify.com", token: "test-only", allOrders: false };
const identity = { email: "Member@Example.com", email_confirmed_at: "2026-11-11" };
const raw = { id: "order-1", email: "member@example.com", name: "#1001" };
const response = (nodes: unknown[], hasNextPage = false) => new Response(JSON.stringify({ data: { orders: { nodes, pageInfo: { hasNextPage, endCursor: hasNextPage ? "next-page" : null } } } }));
const never = (() => { throw new Error("Must not request Shopify"); }) as typeof fetch;
test("unverified identity, disabled integration and unexpected host never request orders", async () => {
  assert.deepEqual(await readShopOrders({ email: identity.email }, config, undefined, never), { kind: "verify-email" });
  for (const c of [{ ...config, enabled: false }, { ...config, token: "" }, { ...config, domain: "evil.example" }])
    assert.deepEqual(await readShopOrders(identity, c, undefined, never), { kind: "disabled" });
});
test("query scoped to verified email, uncached, exact checked and email removed", async () => {
  const request = (async (url, init) => {
    assert.equal(url, "https://example-store.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.variables.query, 'email:"member@example.com" AND test:false');
    assert.equal(body.variables.after, "cursor");return response([raw], true);
  }) as typeof fetch;
  const result = await readShopOrders(identity, config, "cursor", request);
  assert.equal(result.kind, "ready");if (result.kind !== "ready") return;
  assert.equal(result.orders.length, 1); assert.equal("email" in result.orders[0], false);
  assert.equal(result.hasNextPage, true); assert.equal(result.endCursor, "next-page"); assert.equal(result.allOrders, false);
});
test("cross-account, null and missing emails fail closed for entire response", async () => {
  for (const email of ["another@example.com", null, undefined]) {
    const request = (async () => response([raw, { ...raw, id: "order-2", email }])) as typeof fetch;
    assert.deepEqual(await readShopOrders(identity, config, undefined, request), { kind: "unavailable" });
  }
});
test("permission errors, malformed response and network failures are never empty history", async () => {
  for (const request of [async () => new Response("denied", { status: 403 }), async () => new Response(JSON.stringify({ errors: [{ message: "denied" }] })), async () => new Response("{}"), async () => { throw new Error("timeout"); }])
    assert.deepEqual(await readShopOrders(identity, config, undefined, request as typeof fetch), { kind: "unavailable" });
});
test("quoted search cannot widen ownership", async () => {
  const tricky = { ...identity, email: 'member"OR@example.com' };
  const request = (async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).variables.query, 'email:"member\\"or@example.com" AND test:false');return response([raw]);
  }) as typeof fetch;
  assert.deepEqual(await readShopOrders(tricky, config, undefined, request), { kind: "unavailable" });
});
test("oversize cursor rejected before network request", async () => {
  assert.deepEqual(await readShopOrders(identity, config, "x".repeat(2049), never), { kind: "unavailable" });
});

// Client-credentials apps (Shopify Dev Dashboard): token fetched, cached, refreshed.
const ccConfig: ShopConfig = { enabled: true, domain: "example-store.myshopify.com", clientId: "cid", clientSecret: "csecret", allOrders: false };
function ccShop(tokens: { access_token?: string; expires_in?: number; status?: number }[], graphqlStatus: number[] = []) {
  const calls = { token: 0, graphql: 0, tokensSent: [] as string[] };
  const request = (async (url, init) => {
    if (String(url).endsWith("/admin/oauth/access_token")) {
      const t = tokens[Math.min(calls.token++, tokens.length - 1)];
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("grant_type"), "client_credentials");
      assert.equal(form.get("client_id"), "cid"); assert.equal(form.get("client_secret"), "csecret");
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify(t), { status: t.status ?? 200 });
    }
    calls.tokensSent.push(String((init?.headers as Record<string, string>)["X-Shopify-Access-Token"]));
    const status = graphqlStatus[calls.graphql++] ?? 200;
    return status === 200 ? response([raw]) : new Response("no", { status });
  }) as typeof fetch;
  return { calls, request };
}
test("client credentials alone count as configured", async () => {
  resetShopTokenCache();
  const { request } = ccShop([{ access_token: "t1", expires_in: 86399 }]);
  assert.equal((await readShopOrders(identity, ccConfig, undefined, request)).kind, "ready");
  assert.deepEqual(await readShopOrders(identity, { ...ccConfig, clientSecret: "" }, undefined, never), { kind: "disabled" });
});
test("token is fetched once and reused while fresh", async () => {
  resetShopTokenCache();
  const { calls, request } = ccShop([{ access_token: "t1", expires_in: 86399 }]);
  await readShopOrders(identity, ccConfig, undefined, request);
  await readShopOrders(identity, ccConfig, undefined, request);
  assert.equal(calls.token, 1); assert.deepEqual(calls.tokensSent, ["t1", "t1"]);
});
test("token inside the refresh margin is replaced", async () => {
  resetShopTokenCache();
  const { calls, request } = ccShop([{ access_token: "t1", expires_in: 60 }, { access_token: "t2", expires_in: 86399 }]);
  await readShopOrders(identity, ccConfig, undefined, request);
  await readShopOrders(identity, ccConfig, undefined, request);
  assert.equal(calls.token, 2); assert.deepEqual(calls.tokensSent, ["t1", "t2"]);
});
test("a 401 drops the cached token so the next request fetches a new one", async () => {
  resetShopTokenCache();
  const { calls, request } = ccShop([{ access_token: "t1", expires_in: 86399 }, { access_token: "t2", expires_in: 86399 }], [401, 200]);
  assert.deepEqual(await readShopOrders(identity, ccConfig, undefined, request), { kind: "unavailable" });
  assert.equal((await readShopOrders(identity, ccConfig, undefined, request)).kind, "ready");
  assert.deepEqual(calls.tokensSent, ["t1", "t2"]);
});
test("concurrent misses share one token request", async () => {
  resetShopTokenCache();
  const { calls, request } = ccShop([{ access_token: "t1", expires_in: 86399 }]);
  await Promise.all([1, 2, 3].map(() => readShopOrders(identity, ccConfig, undefined, request)));
  assert.equal(calls.token, 1);
});
test("token endpoint failure or a malformed reply is unavailable and never queries orders", async () => {
  for (const t of [{ status: 400 }, {}, { access_token: "" }]) {
    resetShopTokenCache();
    const { calls, request } = ccShop([t]);
    assert.deepEqual(await readShopOrders(identity, ccConfig, undefined, request), { kind: "unavailable" });
    assert.equal(calls.graphql, 0);
  }
});
