import "server-only";
import { connection } from "next/server";
import { getOwner } from "@/lib/owner";
import { createAdminClient } from "./admin";

/**
 * Modo beta sem login: todas as telas usam o cliente do servidor (chave secreta)
 * e o usuário dono do app. Toda gravação precisa informar user_id: user.id.
 */
export async function requireUser() {
  await connection(); // dados sempre na hora do acesso (nunca em cache do build)
  const user = await getOwner();
  return { supabase: createAdminClient(), user };
}
