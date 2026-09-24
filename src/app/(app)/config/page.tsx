import { SubmitButton } from "@/components/submit-button";
import { PageTitle, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { disconnectStrava } from "../cardio/actions";
import { WebhookButton } from "./webhook-button";

export default async function ConfigPage() {
  const { supabase, user } = await requireUser();
  const [{ data: conn }, { count: devices }] = await Promise.all([
    supabase.from("strava_connections").select("athlete_id").maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageTitle title="Configurações" subtitle={user.email ?? ""} />

      <SectionTitle>Strava</SectionTitle>
      <div className="card space-y-3">
        <p className="text-sm text-muted">
          {conn ? `Conectado (atleta ${conn.athlete_id}).` : "Não conectado. Conecte pela aba Cardio."}
        </p>
        {conn && (
          <>
            <div>
              <p className="text-sm">Receber atividades automaticamente</p>
              <p className="mb-2 text-xs text-muted">
                Só precisa fazer uma vez, depois do deploy. Sem isso, use o botão Sincronizar na aba Cardio.
              </p>
              <WebhookButton />
            </div>
            <form action={disconnectStrava}>
              <SubmitButton className="btn btn-sm btn-danger">Desconectar Strava</SubmitButton>
            </form>
          </>
        )}
      </div>

      <SectionTitle>Notificações</SectionTitle>
      <div className="card text-sm text-muted">
        {devices ?? 0} aparelho(s) recebendo lembretes. Ative ou teste pela aba Lembretes.
      </div>

      <SectionTitle>Acesso</SectionTitle>
      <div className="card text-sm text-muted">
        Versão beta sem login: o app usa a conta {user.email || "do dono"}.{" "}
        {process.env.APP_ACCESS_KEY
          ? "Protegido por chave de acesso neste aparelho."
          : "Qualquer pessoa com o link consegue abrir. Para proteger, configure APP_ACCESS_KEY na Vercel."}
      </div>
    </>
  );
}
