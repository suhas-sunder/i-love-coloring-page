import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubPageContent } from "@/components/coloring/HubPageContent";
import {
  getHubBySlug,
  getHubPageCount,
  getHubPagePath,
  getSiteUrl,
  getStaticHubPageParams,
  parseStaticPageParam,
} from "@/lib/coloring/data";

type HubPaginationPageProps = {
  params: Promise<{ hubSlug: string; page: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getStaticHubPageParams();
}

export async function generateMetadata({ params }: HubPaginationPageProps): Promise<Metadata> {
  const { hubSlug, page: pageParam } = await params;
  const hub = getHubBySlug(hubSlug);
  const page = parseStaticPageParam(pageParam);
  if (!hub || !page || page > getHubPageCount(hub)) return {};

  const path = getHubPagePath(hub, page);

  return {
    title: `${hub.metaTitle}, Page ${page}`,
    description: hub.metaDescription,
    alternates: {
      canonical: `${getSiteUrl()}${path}`,
    },
    openGraph: {
      title: `${hub.metaTitle}, Page ${page}`,
      description: hub.metaDescription,
      url: `${getSiteUrl()}${path}`,
      type: "website",
    },
  };
}

export default async function HubPaginationPage({ params }: HubPaginationPageProps) {
  const { hubSlug, page: pageParam } = await params;
  const hub = getHubBySlug(hubSlug);
  const page = parseStaticPageParam(pageParam);
  if (!hub || !page || page > getHubPageCount(hub)) notFound();

  return <HubPageContent hub={hub} page={page} />;
}
