import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubPageContent } from "@/components/coloring/HubPageContent";
import {
  getHubBySlug,
  getHubPageCount,
  getHubPagePath,
  getStaticHubPageParams,
  parseStaticPageParam,
} from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";

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

  return buildColoringMetadata(hub.route, {
    page,
    canonicalPath: path,
    fallbackTitle: hub.metaTitle,
    fallbackDescription: hub.metaDescription,
  });
}

export default async function HubPaginationPage({ params }: HubPaginationPageProps) {
  const { hubSlug, page: pageParam } = await params;
  const hub = getHubBySlug(hubSlug);
  const page = parseStaticPageParam(pageParam);
  if (!hub || !page || page > getHubPageCount(hub)) notFound();

  return <HubPageContent hub={hub} page={page} />;
}
