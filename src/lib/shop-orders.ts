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
export interface ShopConfig { enabled: boolean; domain?: string; token?: string; allOrders: boolean }
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
  return config.enabled && Boolean(config.token) && Boolean(config.domain && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(config.domain));
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
  try {
    const response = await request(`https://${config.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": config.token! },
      body: JSON.stringify({ query: SHOP_ORDERS_QUERY, variables: { query: `email:"${escaped}" AND test:false`, after: after ?? null } }),
    });
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
