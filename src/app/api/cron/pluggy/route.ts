import { NextResponse, type NextRequest } from "next/server";
import { getOwner } from "@/lib/owner";
import { pluggyConfigured, syncPluggy } from "@/lib/pluggy";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sincronização diária do Open Finance (chamada pelo pg_cron do Supabase). */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pluggyConfigured()) return NextResponse.json({ skipped: "pluggy não configurada" });
  const owner = await getOwner();
  const result = await syncPluggy(createAdminClient(), owner.id);
  return NextResponse.json(result);
}
