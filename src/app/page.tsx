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

  return <HomeView initial={initial} />;
}
