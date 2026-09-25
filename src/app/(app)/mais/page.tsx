import Link from "next/link";
import { Bell, BookOpen, Camera, Footprints, Settings, Target } from "lucide-react";
import { PageTitle } from "@/components/ui";

const ITEMS = [
  { href: "/diario", label: "Diário", desc: "Como foi o dia, humor e energia", icon: BookOpen },
  { href: "/fotos", label: "Fotos e medidas", desc: "Foto do dia, peso e cintura", icon: Camera },
  { href: "/lembretes", label: "Lembretes", desc: "Notificações programadas", icon: Bell },
  { href: "/cardio", label: "Cardio", desc: "Corrida, bike, tênis (Strava)", icon: Footprints },
  { href: "/metas", label: "Metas", desc: "Ajustar alvos e períodos", icon: Target },
  { href: "/config", label: "Configurações", desc: "Perfil, Strava, notificações", icon: Settings },
];

export default function MaisPage() {
  return (
    <>
      <PageTitle title="Mais" />
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="card flex flex-col gap-2 transition active:scale-[0.98]">
            <Icon size={22} className="text-accent" />
            <div>
              <p className="font-semibold">{label}</p>
              <p className="text-xs text-muted">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
