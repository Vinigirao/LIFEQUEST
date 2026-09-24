import { redirect } from "next/navigation";

// Versão beta sem login: quem abrir /login vai direto para o app.
export default function LoginPage() {
  redirect("/");
}
