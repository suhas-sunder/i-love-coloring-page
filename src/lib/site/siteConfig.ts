const DEFAULT_SITE_NAME = "I Love Coloring Page";
const DEFAULT_CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const LOCAL_SITE_URL = "http://localhost:3005";
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

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
const rawAssetBaseUrl = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL?.trim() || "";
const rawContactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;

const siteUrlStatus = getPublicUrlStatus(rawSiteUrl, { requireColoringPagesPrefix: false });
const assetUrlStatus = getPublicUrlStatus(rawAssetBaseUrl, { requireColoringPagesPrefix: true });

export const siteConfig = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || DEFAULT_SITE_NAME,
  siteUrl: siteUrlStatus.normalizedValue || LOCAL_SITE_URL,
  assetBaseUrl: assetUrlStatus.normalizedValue,
  contactEmail: isUsablePublicEmail(rawContactEmail) ? rawContactEmail : DEFAULT_CONTACT_EMAIL,
  ownerName: process.env.NEXT_PUBLIC_SITE_OWNER_NAME?.trim() || "",
  jurisdiction: process.env.NEXT_PUBLIC_SITE_JURISDICTION?.trim() || "",
  currentYear: new Date().getFullYear(),
  siteUrlStatus,
  assetUrlStatus,
  isPublicContactConfigured: isUsablePublicEmail(rawContactEmail),
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

function isUsablePublicEmail(value: string) {
  if (!value || /example\.com$/i.test(value)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
