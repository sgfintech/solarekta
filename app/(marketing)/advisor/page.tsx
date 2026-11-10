import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { AdvisorScreen, type AdvisorQuery } from "@/components/advisor/advisor-screen";

export const metadata: Metadata = {
  title: "Ask Solar AI — solar equipment prices",
  description: "Check solar battery, inverter and panel prices from verified Philippine supplier listings, compare products and review a quotation.",
};

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<AdvisorQuery> }) {
  const query = await searchParams;
  const user = await getSessionUser();
  // Signed-in buyers and installers keep their dashboard navigation.
  if (user && (user.role === "customer" || user.role === "installer")) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => typeof v === "string") as [string, string][]);
    redirect(`${user.role === "customer" ? "/app" : "/installer"}/advisor${params.size ? `?${params}` : ""}`);
  }
  return <AdvisorScreen query={query} />;
}
