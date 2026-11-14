# Shopify setup for the store owner

This is what we need from the person who owns the Shopify store, so that Empowr members
can see their shop orders in their Members account.

It takes about 15 minutes. You create one small app in Shopify, approve what it can read,
and send us three things. You don't need to change anything in the shop itself.

> Since 1 January 2026, Shopify no longer lets you create custom apps inside the store admin.
> Apps are now made in the **Shopify Dev Dashboard**, and they give you a **client ID and client
> secret** rather than an access token you can copy. That is what we need. Button names in
> Shopify change from time to time, so look for the closest match if a label below differs.

---

## App 1: Members order history (needed)

This app can **only read orders**. It cannot change anything in the store.

### Steps for you

1. **Open the Dev Dashboard.** Go to [dev.shopify.com](https://dev.shopify.com) and sign in with
   the same Shopify account that owns the store. The app has to belong to the same organisation
   as the store, or it won't work.
2. **Create the app.** Choose *Create app* and name it `Empowr Members – order history`.
3. **Set what it can read.** In the app's configuration (Admin API access scopes), tick only:
   - `read_orders`
   - `read_all_orders`, so members can see orders older than 60 days. Shopify may ask you
     why you need it. You can say: *"Members can see their own past orders in their
     account."*

   Leave every other scope unticked, and don't add any `write_` scope.
4. **Allow access to customer email.** Find **Protected customer data** in the app's API access
   settings. Request access to customer data and to the **Email** field only. For the reason, you
   can say: *"We match orders to the member's own verified email, so they only see their
   own orders."*
   Without this, Shopify hides order emails and the feature cannot work.
5. **Release and install.** Release the app version, then install the app on the store.
6. **Copy the credentials.** In the app's settings, copy the **Client ID** and **Client secret**.

### What to send us

| Item | Example | Secret? |
|---|---|---|
| The store's Shopify address | `your-store.myshopify.com` (the `.myshopify.com` one, not your own web address) | No |
| Client ID | a long string of letters and numbers | No |
| Client secret | a long string, often starting `shpss_` | **Yes** |
| Whether Shopify approved `read_all_orders` | yes / no / still pending | No |

**Send the client secret securely.** Use a password-manager share link, or another
method agreed with the Pecuvate team. Never send it by email, chat or text. The other
three items can be sent any way you like.

---

## App 2: Operations access (optional, only if you agree)

This is only needed if you want the Pecuvate team to help run the store, for example with
products, stock or refunds. **Keep it separate from App 1.** Each app then reaches only what its job
needs, and you can remove either one without affecting the other.

Follow the same steps with a different name (for example `Pecuvate operations`). Tick only the
scopes you're happy for us to use, and send the same three items.

---

## What we do after you send it

| Step | Who |
|---|---|
| Store the credentials securely (encrypted vault, and the Members hosting settings, server side only) | Pecuvate |
| Test with two member accounts: each sees only their own orders | Pecuvate, plus one member who has ordered before and agrees to help |
| Switch "My shop orders" on for members | Pecuvate, after the test passes |

Members only ever see orders placed with the same email they use for their Members account.
No addresses or payment details are shown.

## If you ever need to stop it

Uninstall the app from the store, or delete it in the Dev Dashboard. The Members page then
shows "We couldn't load your shop orders" and nothing else breaks. Tell us, and we'll switch
the feature off.
