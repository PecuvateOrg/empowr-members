// The party invitation a guest last opened in this browser. Set by middleware
// on /private-bookings/join/<token>; read by /account to offer the way back.
export const PARTY_INVITE_COOKIE = "party_invite";

const JOIN_PATH = /^\/private-bookings\/join\/([0-9a-f]{64})\/?$/;

export function partyInviteToken(path: string): string | null {
  return JOIN_PATH.exec(path)?.[1] ?? null;
}

export function isPartyInviteToken(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{64}$/.test(value);
}
