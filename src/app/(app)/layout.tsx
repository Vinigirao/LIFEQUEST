import Link from "next/link";
import { Settings } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <Link href="/" className="text-lg font-black tracking-tight">
          LIFE<span className="text-accent">QUEST</span>
        </Link>
        <Link href="/config" className="p-1 text-muted" aria-label="Configurações">
          <Settings size={22} />
        </Link>
      </header>
      <main className="px-4 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)" }}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
