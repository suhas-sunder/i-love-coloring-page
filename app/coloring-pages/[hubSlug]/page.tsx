import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubPageContent } from "@/components/coloring/HubPageContent";
import { getHubBySlug, getNonRootPhase1Hubs } from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";

type HubPageProps = {
  params: Promise<{ hubSlug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getNonRootPhase1Hubs().map((hub) => ({ hubSlug: hub.slug }));
}

export async function generateMetadata({ params }: HubPageProps): Promise<Metadata> {
  const { hubSlug } = await params;
  const hub = getHubBySlug(hubSlug);
  if (!hub) return {};

  return buildColoringMetadata(hub.route, {
    fallbackTitle: hub.metaTitle,
    fallbackDescription: hub.metaDescription,
  });
}

export default async function HubPage({ params }: HubPageProps) {
  const { hubSlug } = await params;
  const hub = getHubBySlug(hubSlug);
  if (!hub) notFound();

  return <HubPageContent hub={hub} page={1} />;
}
