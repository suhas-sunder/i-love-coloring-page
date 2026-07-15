import type { Metadata } from "next";

import { resolveWebpPreviewAssetUrl } from "./assets";
import { getAllRuntimePrintables, getPrintablePath, getPrintablePrimaryHub } from "./printables";
import type { RuntimePrintable } from "./types";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

export function getNaturalPrintableTitle(publicTitle: string) {
  return /\bcoloring page$/i.test(publicTitle.trim()) ? publicTitle.trim() : `${publicTitle.trim()} Coloring Page`;
}

export function buildPrintableDescription(printable: RuntimePrintable) {
  const hub = getPrintablePrimaryHub(printable);
  const metadataSubject = getMetadataSubject(printable);
  return `Print ${metadataSubject} from ${hub.title}. PNG, JPG, or WebP.`;
}

export function buildPrintableMetadata(printable: RuntimePrintable): Metadata {
  const title = metadataTitleByAssetId.get(printable.assetId);
  if (!title) throw new Error(`Missing printable metadata title: ${printable.assetId}`);
  const description = buildPrintableDescription(printable);
  const canonical = getCanonicalUrl(getPrintablePath(printable));
  const imageUrl = resolveWebpPreviewAssetUrl(printable.webpPath);
  if (!imageUrl) throw new Error(`Missing public WebP metadata URL: ${printable.assetId}`);
  const dimensions = printable.width && printable.height ? { width: printable.width, height: printable.height } : {};

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: imageUrl, ...dimensions, alt: printable.altText }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, alt: printable.altText }],
    },
  };
}

const METADATA_TITLE_MAX_LENGTH = 72;
const METADATA_TITLE_SUFFIX = " | Free Printable";
const METADATA_DESIGN_RESERVE = " — Design 9999".length;
const metadataTitleByAssetId = buildMetadataTitleMap();
const metadataSubjectByAssetId = new Map(
  [...metadataTitleByAssetId].map(([assetId, title]) => [assetId, title.slice(0, -METADATA_TITLE_SUFFIX.length)]),
);

function getMetadataSubject(printable: RuntimePrintable) {
  const subject = metadataSubjectByAssetId.get(printable.assetId);
  if (!subject) throw new Error(`Missing printable metadata subject: ${printable.assetId}`);
  return subject;
}

function buildMetadataTitleMap() {
  const printables = getAllRuntimePrintables();
  const subjectLimit = METADATA_TITLE_MAX_LENGTH - METADATA_TITLE_SUFFIX.length;
  const baseSubjectByAssetId = new Map<string, string>();
  const groups = new Map<string, RuntimePrintable[]>();

  for (const printable of printables) {
    const baseSubject = truncateAtWord(getNaturalPrintableTitle(printable.publicTitle), subjectLimit);
    baseSubjectByAssetId.set(printable.assetId, baseSubject);
    const key = truncateAtWord(
      getNaturalPrintableTitle(printable.publicTitle),
      subjectLimit - METADATA_DESIGN_RESERVE,
    ).toLowerCase();
    const group = groups.get(key) || [];
    group.push(printable);
    groups.set(key, group);
  }

  const titles = new Map<string, string>();
  for (const group of groups.values()) {
    group.sort((left, right) => left.assetId.localeCompare(right.assetId));
    group.forEach((printable, index) => {
      const qualifier = group.length > 1 ? ` — Design ${index + 1}` : "";
      const qualifiedSubjectLimit = subjectLimit - qualifier.length;
      const subject = qualifier
        ? `${truncateAtWord(getNaturalPrintableTitle(printable.publicTitle), qualifiedSubjectLimit)}${qualifier}`
        : baseSubjectByAssetId.get(printable.assetId)!;
      titles.set(printable.assetId, `${subject}${METADATA_TITLE_SUFFIX}`);
    });
  }

  const uniqueTitles = new Set(titles.values());
  if (titles.size !== printables.length || uniqueTitles.size !== printables.length) {
    throw new Error("Printable metadata titles are not unique");
  }
  for (const title of uniqueTitles) {
    if (title.length > METADATA_TITLE_MAX_LENGTH) throw new Error(`Printable metadata title exceeds ${METADATA_TITLE_MAX_LENGTH} characters`);
  }

  return titles;
}

function truncateAtWord(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength + 1);
  const boundary = candidate.lastIndexOf(" ");
  if (boundary <= 0) throw new Error(`Printable metadata term cannot fit within ${maxLength} characters`);
  return candidate.slice(0, boundary).trimEnd();
}
