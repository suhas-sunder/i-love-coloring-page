import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubPageContent } from "@/components/coloring/HubPageContent";
import { getHubBySlug, getNonRootPhase1Hubs, getSiteUrl } from "@/lib/coloring/data";

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

  return {
    title: hub.metaTitle,
    description: hub.metaDescription,
    alternates: {
      canonical: `${getSiteUrl()}${hub.route}`,
    },
    openGraph: {
      title: hub.metaTitle,
      description: hub.metaDescription,
      url: `${getSiteUrl()}${hub.route}`,
      type: "website",
    },
  };
}

export default async function HubPage({ params }: HubPageProps) {
  const { hubSlug } = await params;
  const hub = getHubBySlug(hubSlug);
  if (!hub) notFound();

  return <HubPageContent hub={hub} page={1} />;
}
