import Link from "next/link";

/** Alterna entre Força e Cardio dentro da aba Treino. */
export function TrainingTabs({ active }: { active: "forca" | "cardio" }) {
  const item = (key: "forca" | "cardio", href: string, label: string) => (
    <Link
      href={href}
      className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${
        active === key ? "bg-accent-strong text-white" : "text-muted"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex gap-1 rounded-xl border border-line bg-card p-1">
      {item("forca", "/treino", "Força")}
      {item("cardio", "/cardio", "Cardio")}
    </div>
  );
}
