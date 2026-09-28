/** Leave the GBP minimum charge on the card unless credit covers everything. */
export function creditToApply(totalPence: number, availablePence: number): number {
  if (![totalPence, availablePence].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error("Invalid credit amount");
  }
  const credit = Math.min(totalPence, availablePence);
  return totalPence > credit && totalPence - credit < 30
    ? Math.max(0, totalPence - 30) : credit;
}
