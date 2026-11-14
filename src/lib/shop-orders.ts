/** Shopify adapter: server-only callers supply an authenticated, verified identity.
 * No caller-supplied email, order ID, token, or URL is accepted from the browser.
 * This module is dependency-free so its privacy boundary can be tested. */
export const SHOPIFY_API_VERSION = "2026-10";
export const SHOP_ORDERS_QUERY = `query MemberShopOrders($query: String!, $after: String) {
  orders(first: 20, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {
    nodes { id name email createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      currentTotalPriceSet { presentmentMoney { amount currencyCode } }
      lineItems(first: 50) { nodes { id title variantTitle quantity } pageInfo { hasNextPage } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export interface ShopIdentity { email?: string; email_confirmed_at?: string }
/** Either a static `token` (legacy admin-created app) or `clientId` + `clientSecret`
 * (Dev Dashboard app, since 2026-01-01: the client-credentials grant returns a
 * token that expires after ~24h, so it is fetched and refreshed here). */
export interface ShopConfig {
  enabled: boolean; domain?: string; token?: string;
  clientId?: string; clientSecret?: string; allOrders: boolean;
}
export interface ShopOrder {
  id: string; name: string; createdAt: string; cancelledAt: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string;
  currentTotalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
  lineItems: { nodes: { id: string; title: string; variantTitle: string | null; quantity: number }[]; pageInfo: { hasNextPage: boolean } };
}
interface RawOrder extends ShopOrder { email: string | null }
export type ShopOrdersResult =
  | { kind: "disabled" | "verify-email" | "unavailable" }
  | { kind: "ready"; orders: ShopOrder[]; hasNextPage: boolean; endCursor: string | null; allOrders: boolean };

export function shopConfigReady(config: ShopConfig): boolean {
  const credentials = Boolean(config.token) || Boolean(config.clientId && config.clientSecret);
  return config.enabled && credentials && Boolean(config.domain && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(config.domain));
}

// Per-instance cache of client-credentials tokens. Refreshed 5 minutes before
// Shopify's expiry, dropped on a 401, and concurrent misses share one request.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const pendingTokens = new Map<string, Promise<string | null>>();
const cacheKey = (config: ShopConfig) => `${config.domain}|${config.clientId}`;

/** Test hook: forget cached tokens. */
export function resetShopTokenCache() { tokenCache.clear(); pendingTokens.clear(); }

async function fetchClientToken(config: ShopConfig, request: typeof fetch): Promise<string | null> {
  try {
    const response = await request(`https://${config.domain}/admin/oauth/access_token`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials", client_id: config.clientId!, client_secret: config.clientSecret!,
      }).toString(),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) return null;
    const seconds = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 0;
    // No usable expiry: use once, never cache.
    if (seconds) tokenCache.set(cacheKey(config), { token: payload.access_token, expiresAt: Date.now() + seconds * 1000 });
    return payload.access_token;
  } catch { return null; }
}

async function accessToken(config: ShopConfig, request: typeof fetch): Promise<string | null> {
  if (config.token) return config.token;
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token;
  tokenCache.delete(key);
  let pending = pendingTokens.get(key);
  if (!pending) {
    pending = fetchClientToken(config, request).finally(() => pendingTokens.delete(key));
    pendingTokens.set(key, pending);
  }
  return pending;
}

export async function readShopOrders(
  identity: ShopIdentity,
  config: ShopConfig,
  after?: string,
  request: typeof fetch = fetch,
): Promise<ShopOrdersResult> {
  if (!shopConfigReady(config)) return { kind: "disabled" };
  const email = identity.email?.trim().toLowerCase();
  if (!identity.email_confirmed_at || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: "verify-email" };
  if (after && (after.length > 2048 || /[\r\n]/.test(after))) return { kind: "unavailable" };
  // Quote/escape search syntax independently of JSON/GraphQL variables.
  const escaped = email.replace(/[\\"]/g, "\\$&");
  const token = await accessToken(config, request);
  if (!token) return { kind: "unavailable" };
  try {
    const response = await request(`https://${config.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: SHOP_ORDERS_QUERY, variables: { query: `email:"${escaped}" AND test:false`, after: after ?? null } }),
    });
    if (response.status === 401 && !config.token) tokenCache.delete(cacheKey(config));
    if (!response.ok) return { kind: "unavailable" };
    const payload = await response.json() as {
      errors?: unknown[];
      data?: { orders: { nodes: RawOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    };
    if (payload.errors?.length || !payload.data?.orders) return { kind: "unavailable" };
    const { nodes, pageInfo } = payload.data.orders;
    // Shopify search isn't an authorization boundary. Fail closed on ANY
    // unexpected result, including null/redacted emails. Never expose it.
    if (nodes.some(order => order.email?.trim().toLowerCase() !== email)) return { kind: "unavailable" };
    return { kind: "ready", orders: nodes.map(({ email: _email, ...order }) => order),
      ...pageInfo, allOrders: config.allOrders };
  } catch { return { kind: "unavailable" }; }
}
