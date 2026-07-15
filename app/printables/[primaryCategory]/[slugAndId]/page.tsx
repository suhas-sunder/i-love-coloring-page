import type { Metadata } from "next";
import { notFound } from "next/navigation";

import routeManifestJson from "../../../../pipeline/manifests/runtime-printable-route-manifest.json";
import { PrintableDetailPage } from "@/components/coloring/PrintableDetailPage";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { buildPrintableMetadata } from "@/lib/coloring/printableMetadata";
import { getPrintableByCanonicalParams } from "@/lib/coloring/printables";
import { buildPrintableJsonLd } from "@/lib/seo/printableJsonLd";

type RouteParams = { primaryCategory: string; slugAndId: string };
type PrintableRouteManifest = { routes: Array<{ primaryCategorySlug: string; slugAndId: string }> };

export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  return (routeManifestJson as PrintableRouteManifest).routes.map((route) => ({
    primaryCategory: route.primaryCategorySlug,
    slugAndId: route.slugAndId,
  }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { primaryCategory, slugAndId } = await params;
  const printable = getPrintableByCanonicalParams(primaryCategory, slugAndId);
  if (!printable) notFound();
  return buildPrintableMetadata(printable);
}

export default async function PrintableRoutePage({ params }: { params: Promise<RouteParams> }) {
  const { primaryCategory, slugAndId } = await params;
  const printable = getPrintableByCanonicalParams(primaryCategory, slugAndId);
  if (!printable) notFound();
  return (
    <>
      <JsonLdScript id="printable-jsonld" data={buildPrintableJsonLd(printable)} />
      <PrintableDetailPage printable={printable} />
    </>
  );
}
