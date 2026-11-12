import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberShopOrders } from "@/lib/shop-orders-server";
import { getAuthedAccount } from "@/lib/auth";
import { links } from "@/lib/links";

export const metadata: Metadata = { title: "My shop orders — Empowr Members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
function status(value: string) { return value.toLowerCase().replaceAll("_", " "); }

export default async function ShopOrdersPage({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login?next=/account/shop-orders");
  const { after } = await searchParams;
  const result = await getMemberShopOrders(typeof after === "string" ? after : undefined);
  if (!result) redirect("/login?next=/account/shop-orders");
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
    <Link href="/account" className="text-sm font-bold text-blue">Back to your account</Link>
    <div><h1 className="text-3xl font-black text-black">My shop orders</h1>
      <p className="mt-2 text-mid">Your Empowr shop purchases, all in one place.</p>
      <p className="mt-2 text-sm text-mid">Orders appear here when you use your verified Members email, <strong>{authed.user.email}</strong>, at checkout. Purchases made with another email won&apos;t appear automatically.</p></div>
    {result.kind === "disabled" && <p className="rounded-2xl bg-card p-6">We&apos;re getting shop order history ready. Your order confirmation emails still contain your purchase details.</p>}
    {result.kind === "verify-email" && <p className="rounded-2xl bg-card p-6">Please verify your Members email before viewing shop orders. Contact us if you need help confirming your account.</p>}
    {result.kind === "unavailable" && <div className="rounded-2xl bg-card p-6"><p>We couldn&apos;t load your shop orders just now. Please try again later. This does not mean your order has been cancelled.</p><Link href="/account/shop-orders" className="mt-3 inline-block font-bold text-blue">Try again</Link></div>}
    {result.kind === "ready" && <>
      {!result.allOrders && <p className="text-sm text-mid">Showing orders from the last 60 days. For older purchases, please check your confirmation email or contact us.</p>}
      {result.orders.length === 0 && <p className="rounded-2xl bg-card p-6">No matching orders found on this page. Check that you used your Members email at checkout.</p>}
      {result.orders.map(order => <article key={order.id} className="space-y-4 rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-extrabold">Order {order.name}</h2><p className="text-sm text-mid">{new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" }).format(new Date(order.createdAt))}</p></div>
          <strong>{new Intl.NumberFormat("en-GB", { style: "currency", currency: order.currentTotalPriceSet.presentmentMoney.currencyCode }).format(Number(order.currentTotalPriceSet.presentmentMoney.amount))}</strong></div>
        <p className="text-sm capitalize text-mid">{order.cancelledAt ? "Cancelled" : status(order.displayFulfillmentStatus)}{order.displayFinancialStatus ? ` · ${status(order.displayFinancialStatus)}` : ""}</p>
        <ul className="space-y-2">{order.lineItems.nodes.map(item => <li key={item.id} className="border-t border-line pt-2"><strong>{item.title}</strong>{item.variantTitle && <span className="text-mid"> · {item.variantTitle}</span>}<span className="ml-2 text-sm text-mid">Quantity: {item.quantity}</span></li>)}</ul>
        {order.lineItems.pageInfo.hasNextPage && <p className="text-sm text-mid">For the remaining items in this order, please see your confirmation email.</p>}
      </article>)}
      <div className="flex gap-6"><Link href="/account/shop-orders" className="font-bold text-blue">Latest orders</Link>{result.hasNextPage && result.endCursor && <Link href={`/account/shop-orders?after=${encodeURIComponent(result.endCursor)}`} className="font-bold text-blue">Older orders</Link>}</div>
    </>}
    <p className="text-sm text-mid">Need help with a purchase? <a className="font-bold text-blue" href={`mailto:${links.contactEmail}`}>Contact the Empowr team</a>.</p>
  </main>;
}
