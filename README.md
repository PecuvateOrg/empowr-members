# Empowr Members

## About

### What it is
Empowr CIC's booking and membership platform, at members.empowrcic.org.

### What it's for
So people can book and pay for sessions, hold a monthly membership, and turn up knowing they're expected — and so staff run the door and the money from one place, instead of the old Wix booking system.

### How it works
1. A member picks a session or membership and pays online.
2. Their booking, and any waiver it needs, is checked for everyone in their party.
3. At the door, staff check people in; new joiners can sign up there by scanning a QR code.
4. Staff manage bookings, memberships and credit notes from the admin area.

Membership and session booking platform for Empowr CIC — members book, pay for, and manage sessions and monthly memberships at **members.empowrcic.org**. Replaces the legacy Wix booking system.

## Setup

```bash
cd src
npm install
cp .env.example .env.local   # then fill in values — see ops/CONTEXT.md
npm run dev
```

All npm commands run from `src/` — it is the Next.js project root (Netlify base directory).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (empowr-cic project) · Stripe · Resend · Netlify

## Orientation

- `CLAUDE.md` — routing map (start here)
- `planning/spec/CONTEXT.md` — product spec and build phases
- `planning/architecture/CONTEXT.md` — data model and system design
- `ops/CONTEXT.md` — deployment and environment variables
