import { SubmitButton } from "@/components/submit-button";
import { PageTitle, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { disconnectStrava } from "../cardio/actions";
import { saveProfile } from "./actions";
import { WebhookButton } from "./webhook-button";

export default async function ConfigPage() {
  const { supabase, user } = await requireUser();
  const [{ data: conn }, { count: devices }, { data: profile }] = await Promise.all([
    supabase.from("strava_connections").select("athlete_id").maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("height_cm, birth_year, sex, weight_goal").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <>
      <PageTitle title="Configurações" subtitle={user.email ?? ""} />

      <SectionTitle>Seu perfil</SectionTitle>
      <form action={saveProfile} className="card space-y-3">
        <p className="text-xs text-muted">Usado para estimar seu gasto calórico e a meta de calorias na aba Análises.</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Altura (cm)</label>
            <input name="height_cm" inputMode="decimal" defaultValue={profile?.height_cm ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Ano de nascimento</label>
            <input name="birth_year" inputMode="numeric" defaultValue={profile?.birth_year ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Sexo</label>
            <select name="sex" defaultValue={profile?.sex ?? ""} className="input">
              <option value="">–</option>
              <option value="m">Masculino</option>
              <option value="f">Feminino</option>
            </select>
          </div>
          <div>
            <label className="label">Objetivo</label>
            <select name="weight_goal" defaultValue={profile?.weight_goal ?? "manter"} className="input">
              <option value="perder">Perder peso</option>
              <option value="manter">Manter</option>
              <option value="ganhar">Ganhar massa</option>
            </select>
          </div>
        </div>
        <SubmitButton>Salvar perfil</SubmitButton>
      </form>

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
