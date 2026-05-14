export type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdValue = JsonLdPrimitive | JsonLdObject | JsonLdValue[];
export type JsonLdObject = {
  [key: string]: JsonLdValue | undefined;
};

export type BreadcrumbEntry = {
  name: string;
  path: string;
};

export type ItemListEntry = {
  name: string;
  url: string;
};

export type PageSchemaType = "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage" | "PrivacyPolicy" | "TermsOfService";

export type PageSchemaOptions = {
  siteUrl: string;
  siteName: string;
  path: string;
  name: string;
  description: string;
  schemaType?: PageSchemaType;
  ogImageUrl?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  breadcrumbId?: string;
  mainEntityId?: string;
  contactEmail?: string;
};

export const SCHEMA_CONTEXT = "https://schema.org";
const LANGUAGE = "en-US";

export function buildHomeJsonLdSchemas(options: {
  siteUrl: string;
  siteName: string;
  description: string;
  ogImageUrl: string;
  ogImageWidth: number;
  ogImageHeight: number;
}) {
  return [
    buildWebSiteJsonLd(options),
    buildOrganizationJsonLd(options),
    buildWebPageJsonLd({
      ...options,
      path: "/",
      name: options.siteName,
      schemaType: "WebPage",
    }),
  ];
}

export function buildCollectionPageJsonLdSchemas(options: PageSchemaOptions & {
  breadcrumbs: BreadcrumbEntry[];
  itemListItems: ItemListEntry[];
}) {
  const pageUrl = absoluteUrl(options.siteUrl, options.path);
  const breadcrumb = buildBreadcrumbListJsonLd({
    siteUrl: options.siteUrl,
    pageUrl,
    items: options.breadcrumbs,
  });
  const itemList = buildItemListJsonLd({
    pageUrl,
    name: `${options.name} visible preview list`,
    items: options.itemListItems,
  });

  return [
    buildWebPageJsonLd({
      ...options,
      schemaType: "CollectionPage",
      breadcrumbId: String(breadcrumb["@id"]),
      mainEntityId: String(itemList["@id"]),
    }),
    breadcrumb,
    itemList,
  ];
}

export function buildTrustPageJsonLdSchema(options: PageSchemaOptions) {
  return buildWebPageJsonLd(options);
}

export function buildWebSiteJsonLd(options: {
  siteUrl: string;
  siteName: string;
  description: string;
  ogImageUrl?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
}): JsonLdObject {
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    "@id": `${normalizeSiteUrl(options.siteUrl)}/#website`,
    name: options.siteName,
    url: normalizeSiteUrl(options.siteUrl),
    description: options.description,
    inLanguage: LANGUAGE,
    publisher: { "@id": `${normalizeSiteUrl(options.siteUrl)}/#organization` },
    image: options.ogImageUrl ? buildImageObjectJsonLd({
      url: options.ogImageUrl,
      width: options.ogImageWidth,
      height: options.ogImageHeight,
      caption: `${options.siteName} social preview image`,
    }) : undefined,
  });
}

export function buildOrganizationJsonLd(options: {
  siteUrl: string;
  siteName: string;
  description?: string;
  ogImageUrl?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
}): JsonLdObject {
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    "@id": `${normalizeSiteUrl(options.siteUrl)}/#organization`,
    name: options.siteName,
    url: normalizeSiteUrl(options.siteUrl),
    description: options.description,
    image: options.ogImageUrl ? buildImageObjectJsonLd({
      url: options.ogImageUrl,
      width: options.ogImageWidth,
      height: options.ogImageHeight,
      caption: `${options.siteName} social preview image`,
    }) : undefined,
  });
}

export function buildWebPageJsonLd(options: PageSchemaOptions): JsonLdObject {
  const pageUrl = absoluteUrl(options.siteUrl, options.path);
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": options.schemaType || "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: options.name,
    headline: options.name,
    description: options.description,
    isPartOf: { "@id": `${normalizeSiteUrl(options.siteUrl)}/#website` },
    publisher: { "@id": `${normalizeSiteUrl(options.siteUrl)}/#organization` },
    inLanguage: LANGUAGE,
    primaryImageOfPage: options.ogImageUrl ? buildImageObjectJsonLd({
      url: options.ogImageUrl,
      width: options.ogImageWidth,
      height: options.ogImageHeight,
      caption: `${options.name} social preview image`,
    }) : undefined,
    image: options.ogImageUrl,
    breadcrumb: options.breadcrumbId ? { "@id": options.breadcrumbId } : undefined,
    mainEntity: options.mainEntityId ? { "@id": options.mainEntityId } : undefined,
    email: options.contactEmail,
  });
}

export function buildBreadcrumbListJsonLd(options: {
  siteUrl: string;
  pageUrl: string;
  items: BreadcrumbEntry[];
}): JsonLdObject {
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    "@id": `${options.pageUrl}#breadcrumb`,
    itemListElement: options.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(options.siteUrl, item.path),
    })),
  });
}

export function buildItemListJsonLd(options: {
  pageUrl: string;
  name: string;
  items: ItemListEntry[];
}): JsonLdObject {
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": "ItemList",
    "@id": `${options.pageUrl}#itemlist`,
    name: options.name,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: options.items.length,
    itemListElement: options.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  });
}

export function buildImageObjectJsonLd(options: {
  url: string;
  width?: number;
  height?: number;
  caption?: string;
}): JsonLdObject {
  return compactJsonLd({
    "@type": "ImageObject",
    "@id": `${options.url}#image`,
    url: options.url,
    width: options.width,
    height: options.height,
    caption: options.caption,
  });
}

export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]) {
  return JSON.stringify(compactJsonLd(data))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function compactJsonLd<T extends JsonLdValue | undefined>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((entry) => compactJsonLd(entry))
      .filter((entry) => !isEmptyJsonLdValue(entry)) as T;
  }

  if (value && typeof value === "object") {
    const result: JsonLdObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const compacted = compactJsonLd(entry as JsonLdValue | undefined);
      if (!isEmptyJsonLdValue(compacted)) result[key] = compacted;
    }
    return result as T;
  }

  return value;
}

export function absoluteUrl(siteUrl: string, path: string) {
  if (/^https:\/\//i.test(path)) return path.replace(/\/+$/, "");
  const base = normalizeSiteUrl(siteUrl);
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.replace(/\/+$/, "");
}

function isEmptyJsonLdValue(value: JsonLdValue | undefined): value is undefined | null {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}
