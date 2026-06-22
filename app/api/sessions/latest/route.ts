import { NextResponse } from "next/server";

import { getLatestSession } from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function GET() {
  const session = await getLatestSession();
  return NextResponse.json({ session });
}
