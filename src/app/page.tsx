import { supabase } from "@/lib/supabase";
import { HomeView } from "@/components/HomeView";
import type { Happiness } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await supabase
    .from("happinesses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("failed to load happinesses", error);
  }

  const initial = (data ?? []) as Happiness[];

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Happy Map
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A collective map of small joys, growing one moment at a time.
        </p>
      </header>

      <HomeView initial={initial} />
    </main>
  );
}
