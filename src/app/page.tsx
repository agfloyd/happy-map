import { supabase } from "@/lib/supabase";
import { HappinessForm } from "@/components/HappinessForm";
import { Feed } from "@/components/Feed";
import type { Happiness } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await supabase
    .from("happinesses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("failed to load happinesses", error);
  }

  const initial = (data ?? []) as Happiness[];

  return (
    <main className="w-full max-w-2xl mx-auto px-6 py-12 sm:py-16 space-y-10">
      <header className="text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
          Happy Map
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400 text-balance">
          A collective map of small joys, growing one moment at a time.
        </p>
      </header>

      <HappinessForm />

      <section>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 mb-4 px-1">
          Recent moments
        </h2>
        <Feed initial={initial} />
      </section>
    </main>
  );
}
