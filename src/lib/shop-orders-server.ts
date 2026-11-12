import "server-only";
import { getAuthedAccount } from "@/lib/auth";
import { readShopOrders, shopConfigReady, type ShopConfig } from "@/lib/shop-orders";

function config(): ShopConfig {
  return {
    enabled: process.env.SHOPIFY_ORDERS_ENABLED === "true",
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    allOrders: process.env.SHOPIFY_READ_ALL_ORDERS === "true",
  };
}
export function shopOrdersEnabled() { return shopConfigReady(config()); }
export async function getMemberShopOrders(after?: string) {
  const authed = await getAuthedAccount();
  if (!authed) return null;
  return readShopOrders(authed.user, config(), after);
}
