/** Compensation for one subscription session, using the admin's selected
 * monthly session count. All money is integer pence.
 */
export function subscriberCancellationCredit(monthlyPence: number, startsAt: string, count: number = 4) {
  if (!Number.isSafeInteger(monthlyPence) || monthlyPence <= 0) {
    throw new Error("The subscription needs a positive monthly price.");
  }
  const date = new Date(startsAt);
  if (count !== 4 && count !== 5) throw new Error("Choose 4 or 5 sessions this month.");
  const amountPence = Math.round(monthlyPence / count);
  if (amountPence <= 0) throw new Error("Calculated subscription credit is too small.");
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", month: "long", year: "numeric",
  }).format(date);
  const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  return {
    amountPence, monthlyPence, count,
    explanation: `We have calculated your credit using ${count} sessions for ${label}. Your monthly subscription plan price of ${money(monthlyPence)} divided by ${count} gives ${money(amountPence)} credit for this cancelled session (rounded to the nearest penny). This credit is available for future bookings.`,
  };
}
