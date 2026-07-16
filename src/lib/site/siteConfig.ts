import "server-only";

import { siteIdentity } from "@/config/siteIdentity";

const DEFAULT_SITE_NAME = siteIdentity.siteName;
const DEFAULT_SITE_URL = siteIdentity.canonicalSiteUrl;
const DEFAULT_COLORING_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const COLORING_PREFIX = "/coloring-pages";
const LEGACY_TEST_PREFIX = ["", "coloring", "test-v1"].join("/");
const PRIVATE_STORAGE_HOST_PATTERNS = [
  ["r2", "cloudflarestorage", "com"].join("."),
  ["amazonaws", "com"].join("."),
];

type PublicUrlStatus = {
  rawValue: string;
  normalizedValue: string;
  configured: boolean;
  isHttpUrl: boolean;
  isLocalhost: boolean;
  isExampleDomain: boolean;
  isR2Dev: boolean;
  isPrivateR2Endpoint: boolean;
  hasColoringPagesPrefix: boolean;
  hasDuplicateColoringPagesPrefix: boolean;
  hasOldTestPrefix: boolean;
  ready: boolean;
};

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
const rawAssetBaseUrl = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL?.trim() || DEFAULT_COLORING_ASSET_BASE_URL;
const siteUrlStatus = getPublicUrlStatus(rawSiteUrl, { requireColoringPagesPrefix: false });
const assetUrlStatus = getPublicUrlStatus(rawAssetBaseUrl, { requireColoringPagesPrefix: true });

export const siteConfig = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || DEFAULT_SITE_NAME,
  siteUrl: siteUrlStatus.normalizedValue || DEFAULT_SITE_URL,
  assetBaseUrl: assetUrlStatus.ready ? assetUrlStatus.normalizedValue : DEFAULT_COLORING_ASSET_BASE_URL,
  currentYear: new Date().getFullYear(),
  siteUrlStatus,
  assetUrlStatus,
  isProductionSiteUrlConfigured: siteUrlStatus.ready,
  isProductionAssetUrlConfigured: assetUrlStatus.ready,
};

export function getSiteUrl() {
  return siteConfig.siteUrl;
}

export function getCanonicalUrl(pathname = "/") {
  return `${siteConfig.siteUrl}${normalizePathname(pathname)}`;
}

export function normalizePublicUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function getPublicUrlStatus(value: string, options: { requireColoringPagesPrefix: boolean }): PublicUrlStatus {
  const normalizedValue = normalizePublicUrl(value);
  const status: PublicUrlStatus = {
    rawValue: value,
    normalizedValue,
    configured: Boolean(value),
    isHttpUrl: false,
    isLocalhost: false,
    isExampleDomain: false,
    isR2Dev: false,
    isPrivateR2Endpoint: false,
    hasColoringPagesPrefix: false,
    hasDuplicateColoringPagesPrefix: false,
    hasOldTestPrefix: false,
    ready: false,
  };

  if (!normalizedValue) return status;

  try {
    const url = new URL(normalizedValue);
    const hostname = url.hostname.toLowerCase();
    status.isHttpUrl = url.protocol === "http:" || url.protocol === "https:";
    status.isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    status.isExampleDomain = hostname === "example.com" || hostname.endsWith(".example.com");
    status.isR2Dev = hostname.endsWith(".r2.dev");
    status.isPrivateR2Endpoint = PRIVATE_STORAGE_HOST_PATTERNS.some((pattern) => hostname.includes(pattern));
    status.hasColoringPagesPrefix = url.pathname === COLORING_PREFIX || url.pathname.endsWith(COLORING_PREFIX);
    status.hasDuplicateColoringPagesPrefix = url.pathname.includes(`${COLORING_PREFIX}${COLORING_PREFIX}`);
    status.hasOldTestPrefix = url.pathname.includes(LEGACY_TEST_PREFIX);
    status.ready =
      status.configured &&
      status.isHttpUrl &&
      !status.isLocalhost &&
      !status.isExampleDomain &&
      !status.isR2Dev &&
      !status.isPrivateR2Endpoint &&
      !status.hasOldTestPrefix &&
      !status.hasDuplicateColoringPagesPrefix &&
      (!options.requireColoringPagesPrefix || status.hasColoringPagesPrefix);
  } catch {
    status.ready = false;
  }

  return status;
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
