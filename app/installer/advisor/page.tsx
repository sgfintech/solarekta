import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AdvisorScreen, type AdvisorQuery } from "@/components/advisor/advisor-screen";

export const metadata: Metadata = { title: "Ask Solar AI" };

export default async function DashboardAdvisorPage({ searchParams }: { searchParams: Promise<AdvisorQuery> }) {
  await requireUser(["installer"]);
  return <AdvisorScreen query={await searchParams} variant="dashboard" />;
}
