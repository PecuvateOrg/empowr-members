import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { creditFields, creditFieldsProblem, issueCredit, memberCreditRecords } from "@/lib/credit-issue";
import { searchMembers } from "@/lib/member-search";

const schema = creditFields.extend({
  request_id: z.string().uuid(),
  verified: z.literal(true), agreed: z.literal(true),
});

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const problem = creditFieldsProblem(parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const result = await issueCredit(parsed.data, parsed.data.request_id, admin.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ credit: result.credit }, { status: 201 });
}

export async function GET(request: Request) {
  if (!await getAuthedAdmin()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  if (accountId) {
    if (!z.string().uuid().safeParse(accountId).success) return NextResponse.json({ error: "Invalid member" }, { status: 400 });
    try {
      return NextResponse.json(await memberCreditRecords(accountId));
    } catch {
      return NextResponse.json({ error: "Could not load member records." }, { status: 500 });
    }
  }
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) return NextResponse.json({ members: [], waiverOnly: [] });
  try {
    return NextResponse.json(await searchMembers(query));
  } catch (error) {
    console.error("credit member search failed", error);
    return NextResponse.json({ error: "Member search failed." }, { status: 500 });
  }
}
