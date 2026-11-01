# Spec — Agent access (MCP) to the admin side

**Status: steps 1–3 LIVE 2026-11-01 (PRs #155, #156, staff guide). Step 4 (admin, money tools) not started.**

## Why

Admin work happens only in a browser behind a staff sign-in. An AI agent helping the team cannot do it,
even when the owner has approved the action: on 2026-11-01 two ready-made messages to 120 families had
to wait for someone to open the admin screen. The same applies to looking things up ("who is booked on
Thursday?", "has this member's refund gone through?"), which today means a developer querying the
database directly, outside every rule the app enforces.

Goal: authorised people use Members' admin side **through their own AI tool** (Claude Code, Claude
desktop, Claude.ai), with the same rules, roles and logs as the admin screens.

## Shape

A **remote MCP server inside Members**, at `members.empowrcic.org/api/mcp`, over HTTPS.

- Any MCP-capable client connects by URL. Nothing to install per person, one copy of the code.
- Every tool calls the **same server code as the admin screens** (`lib/message-audience.ts`,
  `lib/message-send.ts`, `lib/member-search.ts`, …). No second set of rules to drift.
- Runs on the existing hosting (Amplify, eu-west-2). No new service.

Rejected: a local MCP server on one workstation (only works for whoever is on that machine); a
direct database connector (bypasses the app's rules, sees every table on a shared database).

## Who can use it: everyone authorised, as themselves

**Each person signs in as themselves.** The MCP server uses OAuth (the MCP authorisation standard): the
first time a person connects their AI tool, a Members sign-in page opens, they sign in with their usual
Members account (email code, Google, Microsoft or passkey), and approve access. From then on their tool
holds a token tied to **their** account.

- **Roles carry over unchanged.** Admins (`ADMIN_EMAILS`) get admin tools; coaches (`CHECKIN_EMAILS`)
  get the coach subset (one session, today to 7 days, exactly as on the messages screen). Anyone else
  is refused. Removing someone from the list removes their AI access at the same moment.
- **Everything is attributed.** A message sent through an AI tool is signed and logged as the person
  who sent it, the same as the screen.
- **The workspace agent** (Claude Code on the owner's workstation) gets its own Members account on the
  admin list, signs in once, and its refresh token is kept in the Vault. It never uses a person's account.
- Tokens are revocable per person on an admin page, and expire if unused.

## Permission levels

Each token carries scopes chosen at approval time. A person can grant less than their role allows.

| Scope | Tools (first version in bold) | Notes |
|---|---|---|
| `read` | **list sessions and who is booked**, **find a member**, **view a member's bookings, credit, waivers**, **sent message log**, **message groups and their counts** | No changes |
| `message` | **preview a message** (count + names), **send a message** | Send requires a preview token from the last 10 minutes and the count the person saw, the same double check as the screen |
| `admin` (later) | credit notes, stock, prices and dates, private booking changes | Added one tool at a time |
| `money` (later) | refunds, cancellations with refund | Last; separate approval |

## Safety

- **Outward or money actions are never silent.** The tool returns a preview first; the send or refund
  needs a second call carrying that preview's id. An AI client is expected to show the preview to its
  person; the workspace agent keeps its rule of asking the owner first.
- **Action log.** Every tool call that changes or sends something is written to a new
  `mem_agent_actions` table (who, which tool, what, result), shown at `/admin/agent-activity`.
- **Limits.** Per token: a cap on sends per hour and recipients per send; reads rate-limited.
- **No personal data beyond the screen's.** Tools return what the matching admin screen shows, nothing
  more (no medical notes in a list view, for example).
- **Public repo.** No key, token or customer data in it; signing keys live in the hosting secrets.

## Build order

1. **Sign-in for AI tools (OAuth) + `read` tools.** Includes the token table, the approve screen, and
   the admin page to see and revoke tokens. Verify with the workspace agent's account.
2. **`message` tools** + action log + limits. First real use: the two emergency-contact messages
   (groups added 2026-11-01).
3. **Staff guide** section: how to connect Claude to Members, what it can do.
4. `admin` and `money` tools, one at a time, each its own PR.

## Decisions (owner, 2026-11-01)

1. **Admins and coaches from the start**, each limited to what their role allows on the screens.
2. **Workspace agent's account:** `ops@`.
3. **Members' own AI assistant** (deferred 2026-10-18) will use these same tools when it is built: one
   set of tools, two front doors.

## Open (technical, before step 1)

4. **Supabase's built-in OAuth 2.1 server** (checked against the docs 2026-11-01): it fits. It is in beta
   and free on all plans. It covers discovery, dynamic client registration (needed by Claude clients),
   PKCE, and refresh-token rotation. Members only builds the consent page and the MCP endpoint, which
   checks each token against the JWKS. Before turning it on, check two things:
   - **The consent page sits at Site URL + path, and this auth project is shared with Waivers and EFN.**
     The Site URL must be Members' address, or the path must be a full route that Members serves.
   - **Dynamic registration lets any client register.** Approval stays mandatory, and the staff-list
     check runs on every call, so a non-staff account gets nothing even after approving.
