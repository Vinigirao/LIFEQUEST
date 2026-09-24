import "server-only";
import { createAdminClient } from "./supabase/admin";

export type Owner = { id: string; email: string };

let cached: Owner | null = null;

/**
 * Modo beta sem login: o app tem um único dono.
 * Usa o usuário do Supabase com o e-mail OWNER_EMAIL (ou o primeiro usuário cadastrado).
 * Se não existir nenhum, cria um automaticamente (o gatilho do banco cria as refeições e metas iniciais).
 */
export async function getOwner(): Promise<Owner> {
  if (cached) return cached;

  const admin = createAdminClient();
  const wanted = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw new Error(`Não foi possível ler os usuários do Supabase: ${error.message}`);

  const users = [...data.users].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let user = wanted ? users.find((u) => u.email?.toLowerCase() === wanted) : users[0];

  if (!user) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: wanted ?? "dono@lifequest.app",
      email_confirm: true,
      password: `${crypto.randomUUID()}Aa1!`,
    });
    if (createError || !created.user) {
      throw new Error(`Não foi possível criar o usuário dono: ${createError?.message ?? "erro desconhecido"}`);
    }
    user = created.user;
  }

  cached = { id: user.id, email: user.email ?? "" };
  return cached;
}
