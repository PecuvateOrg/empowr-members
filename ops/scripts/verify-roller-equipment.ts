import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingSchema } from "@/lib/validation";
import { isRollerCamp, rollerEquipmentSchema, equipmentSelectionError, summariseEquipment, equipmentDescription, HIRE_SKATE_SIZES, type RollerEquipment } from "@/lib/roller-equipment";

const childA = "00000000-0000-4000-8000-000000000001";
const childB = "00000000-0000-4000-8000-000000000002";
const target = "00000000-0000-4000-8000-000000000003";
const hire: RollerEquipment = { skate_choice: "hire", hire_skate_size: HIRE_SKATE_SIZES[0], protective_gear: "provided" };
const own: RollerEquipment = { skate_choice: "own", hire_skate_size: null, protective_gear: "borrow" };

test("camp gate supports both approved names but excludes other offerings", () => {
  assert.equal(isRollerCamp({ type: "camp", slug: "roller-quad-camp" }), true);
  assert.equal(isRollerCamp({ type: "camp", title: "Roller Squad Camp" }), true);
  for (const offering of [null, { type: "event", slug: "roller-quad-camp" }, { type: "camp", title: "Another camp" }, { type: "lesson", title: "Roller Squad Camp" }]) assert.equal(isRollerCamp(offering), false);
});

test("all hire sizes and both own-gear choices round-trip through booking API schema", () => {
  for (const size of HIRE_SKATE_SIZES) {
    for (const gear of ["own", "borrow"] as const) {
      const entries = [{ participant_id: childA, equipment: { ...hire, hire_skate_size: size } }, { participant_id: childB, equipment: { ...own, protective_gear: gear } }];
      const parsed = bookingSchema.parse({ occurrence_id: target, participant_ids: [childA, childB], roller_equipment: entries });
      assert.deepEqual(parsed.roller_equipment, entries);
      assert.equal(equipmentSelectionError(true, parsed.participant_ids, parsed.roller_equipment), null);
    }
  }
});

test("reject invalid sizes, inline skates, missing gear and contradictory choices", () => {
  for (const invalid of [undefined, {}, { ...hire, hire_skate_size: "UK 8" }, { ...hire, protective_gear: "own" }, { ...hire, skate_choice: "inline" }, { ...own, hire_skate_size: HIRE_SKATE_SIZES[0] }, { skate_choice: "own", hire_skate_size: null }, { ...own, protective_gear: "provided" }]) assert.equal(rollerEquipmentSchema.safeParse(invalid).success, false);
});

test("exact participant coverage is required; no sibling omissions, duplicates or extra IDs", () => {
  const a = { participant_id: childA, equipment: hire };
  const b = { participant_id: childB, equipment: own };
  for (const entries of [[], [a], [a, a], [a, { ...b, participant_id: target }], [a, b, a]]) assert.ok(equipmentSelectionError(true, [childA, childB], entries));
  assert.equal(equipmentSelectionError(true, [childA, childB], [b, a]), null);
});

test("unrelated bookings retain their existing payload; equipment cannot be injected into them", () => {
  const parsed = bookingSchema.parse({ occurrence_id: target, participant_ids: [childA] });
  assert.deepEqual(parsed.roller_equipment, []);
  assert.equal(equipmentSelectionError(false, [childA], []), null);
  assert.ok(equipmentSelectionError(false, [childA], [{ participant_id: childA, equipment: hire }]));
});

test("preparation totals include attended children, exclude unpaid/cancelled/other sources, and flag historical gaps", () => {
  const base = { id: childA, source: "online", status: "confirmed", equipment: hire };
  const rows = [base, { ...base, id: childB, status: "attended", equipment: own }, { ...base, id: target, equipment: null },
    ...["pending_payment", "cancelled", "refunded", "credited", "no_show"].map(status => ({ ...base, status })),
    ...["member", "walk_in"].map(source => ({ ...base, source }))];
  const summary = summariseEquipment(rows);
  assert.equal(summary.rows.length, 3);
  assert.deepEqual(summary.sizes.map(size => size.pairs), [1, 0, 0]);
  assert.equal(summary.hire, 1); assert.equal(summary.borrow, 1); assert.equal(summary.gear, 2); assert.equal(summary.missing, 1);
  assert.match(equipmentDescription(null), /not recorded/);
});

test("own full gear adds neither hire skates nor borrowed protective gear", () => {
  const summary = summariseEquipment([{ id: childA, status: "confirmed", source: "online", equipment: { ...own, protective_gear: "own" } }]);
  assert.equal(summary.hire, 0); assert.equal(summary.gear, 0); assert.equal(summary.missing, 0);
});
