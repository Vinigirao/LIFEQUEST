import { after, NextResponse, type NextRequest } from "next/server";
import { getOwner } from "@/lib/owner";
import { pluggyConfigured, syncPluggy } from "@/lib/pluggy";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Webhook da Pluggy (opcional). Cadastre no dashboard como:
 *   https://SEU-APP/api/pluggy/webhook?token=<CRON_SECRET>
 * Quando a Pluggy atualizar uma conexão, o LIFEQUEST sincroniza na hora.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.nextUrl.searchParams.get("token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { event?: string };
  const relevant = ["item/updated", "item/created", "transactions/created", "transactions/updated"];
  if (pluggyConfigured() && body.event && relevant.includes(body.event)) {
    after(async () => {
      const owner = await getOwner();
      await syncPluggy(createAdminClient(), owner.id);
    });
  }
  return NextResponse.json({ ok: true });
}
