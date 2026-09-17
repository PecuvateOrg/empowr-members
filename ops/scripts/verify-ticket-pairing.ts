/**
 * verify-ticket-pairing.ts
 *
 * Run:  npm run verify:ticket-pairing     (from src/)
 *
 * Covers lib/emails/booking-confirmation.ts — specifically that every ticket
 * button in a multi-child confirmation email carries the name of the child
 * whose ticket it actually links to.
 *
 * WHY THIS EXISTS. Until 2026-09-17 the template received two parallel
 * arrays, `participantNames` and `ticketUrls`, and paired them by index:
 *
 *     group.participantNames.map((name, i) => ({ name, url: ticketUrls[i] }))
 *
 * while the producer in lib/notifications.ts filtered blanks out of the names
 * and not the URLs. One empty name therefore made the two lists different
 * lengths, so every button after the blank pointed at the PREVIOUS child's
 * ticket and the last ticket was never rendered at all.
 *
 * That is not cosmetic. The ticket is what staff scan at the door, and the
 * scan writes an attendance record — so a member tapping "View Mia's ticket"
 * could mark a different child present. Attendance is the record of who is
 * in the building.
 *
 * It had never fired because every one of the 66 names on file is real. The
 * `NOT NULL` constraint that made that feel safe does not actually forbid the
 * failing input: it permits the empty string, and `Boolean('')` is false. An
 * import, a stray space, or an admin clearing a field is all it would take.
 *
 * THE LOAD-BEARING ASSERTION is the pairing one — that each ticket URL sits
 * under a label derived from its OWN row. Asserting only "no href is
 * undefined" would have passed on the old code, because a one-position shift
 * produces perfectly well-formed buttons that are simply wrong.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBookingConfirmationEmail } from '../../src/lib/emails/booking-confirmation.ts'
import type {
  BookingOrderEmailGroup,
  BookingOrderEmailSummary,
} from '../../src/lib/emails/types.ts'

const TICKET = {
  alfie: 'https://members.empowrcic.org/ticket/aaaaaaaa-1111',
  nameless: 'https://members.empowrcic.org/ticket/bbbbbbbb-2222',
  mia: 'https://members.empowrcic.org/ticket/cccccccc-3333',
}

function group(
  tickets: { name: string; url: string }[]
): BookingOrderEmailGroup {
  return {
    offeringTitle: 'Skate Jam',
    when: 'Mon 13 Jul, 4:00–5:00pm',
    venue: { name: 'The Hangar', address: '1 Roller Way', postcode: 'B1 1AA' },
    kitList: null,
    // Display-only "Who" line: blanks dropped, exactly as the producer does.
    participantNames: tickets.map((t) => t.name).filter(Boolean),
    tickets,
    amountPaidPence: tickets.length * 1000,
    refundPolicy: 'standard',
  }
}

function order(g: BookingOrderEmailGroup): BookingOrderEmailSummary {
  return { groups: [g], amountPaidPence: g.amountPaidPence }
}

/** The href immediately preceding each button's visible label, as the
 *  rendered HTML actually orders them. Returns [label, url] pairs. */
function buttons(html: string): [string, string][] {
  const pairs: [string, string][] = []
  const re = /href="([^"]*)"[^>]*>([^<]*View[^<]*)</g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    pairs.push([match[2].trim(), match[1]])
  }
  return pairs
}

test('a blank name does not shift any ticket onto another child', () => {
  const html = buildBookingConfirmationEmail(
    order(
      group([
        { name: 'Alfie Barnes', url: TICKET.alfie },
        { name: '', url: TICKET.nameless },
        { name: 'Mia Barnes', url: TICKET.mia },
      ])
    )
  ).html

  assert.deepEqual(buttons(html), [
    ["View Alfie's ticket", TICKET.alfie],
    ['View ticket', TICKET.nameless],
    ["View Mia's ticket", TICKET.mia],
  ])
})

test('every ticket is rendered, including the nameless one', () => {
  const html = buildBookingConfirmationEmail(
    order(
      group([
        { name: 'Alfie Barnes', url: TICKET.alfie },
        { name: '', url: TICKET.nameless },
        { name: 'Mia Barnes', url: TICKET.mia },
      ])
    )
  ).html

  // A paid-for place whose ticket never renders has no way through the door.
  for (const url of Object.values(TICKET)) {
    assert.equal(
      html.split(url).length - 1,
      1,
      `expected exactly one button linking to ${url}`
    )
  }
  assert.ok(!html.includes('href="undefined"'), 'no button may link nowhere')
})

test('a whitespace-only name is treated as nameless, not as a first name', () => {
  const html = buildBookingConfirmationEmail(
    order(
      group([
        { name: 'Alfie Barnes', url: TICKET.alfie },
        { name: '   ', url: TICKET.nameless },
      ])
    )
  ).html

  assert.deepEqual(buttons(html), [
    ["View Alfie's ticket", TICKET.alfie],
    ['View ticket', TICKET.nameless],
  ])
})

test('a single booking keeps the second-person label', () => {
  const html = buildBookingConfirmationEmail(
    order(group([{ name: 'Alfie Barnes', url: TICKET.alfie }]))
  ).html

  assert.deepEqual(buttons(html), [['View your ticket', TICKET.alfie]])
})

test('the Who line still omits the blank, without disturbing the tickets', () => {
  const g = group([
    { name: 'Alfie Barnes', url: TICKET.alfie },
    { name: '', url: TICKET.nameless },
    { name: 'Mia Barnes', url: TICKET.mia },
  ])
  const html = buildBookingConfirmationEmail(order(g)).html

  assert.equal(g.participantNames.join(', '), 'Alfie Barnes, Mia Barnes')
  assert.ok(
    html.includes('Alfie Barnes, Mia Barnes'),
    'the Who line should read as a clean list with no stray comma'
  )
  assert.equal(buttons(html).length, 3, 'all three tickets still render')
})
