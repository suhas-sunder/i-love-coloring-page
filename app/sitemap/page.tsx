import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import { sitemapHubGroups, sitemapRootHubLink, type SitemapHubLink } from "@/lib/navigation/sitemapNav";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";
import { trustPages } from "@/lib/trust/trustPages";

const canonical = getCanonicalUrl("/sitemap");
const description = "Browse the main pages, printable coloring page collections, and site information pages on I Love Coloring Page.";

export const metadata: Metadata = {
  title: "Sitemap",
  description,
  alternates: { canonical },
  openGraph: {
    title: `Sitemap | ${siteConfig.siteName}`,
    description,
    url: canonical,
    type: "website",
    images: [
      {
        url: `${siteConfig.siteUrl}/og/home.jpg`,
        width: 1200,
        height: 630,
        alt: `${siteConfig.siteName} social preview image`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Sitemap | ${siteConfig.siteName}`,
    description,
    images: [
      {
        url: `${siteConfig.siteUrl}/og/home.jpg`,
        alt: `${siteConfig.siteName} social preview image`,
      },
    ],
  },
};

const mainLinks: SitemapLink[] = [
  { label: "Home", href: "/" },
  sitemapRootHubLink ? toSitemapLink(sitemapRootHubLink, "All coloring pages") : { label: "All coloring pages", href: "/coloring-pages" },
  { label: "Sitemap", href: "/sitemap" },
];

const siteInfoLinks: SitemapLink[] = trustPages
  .filter((page) => page.indexable)
  .map((page) => ({ label: page.title, href: page.path }));

type SitemapLink = {
  label: string;
  href: string;
  count?: number;
};

export default function SitemapPage() {
  const groups = [
    { label: "Main pages", links: mainLinks },
    ...sitemapHubGroups.map((group) => ({
      label: group.label,
      links: group.links.map((link) => toSitemapLink(link)),
    })),
    { label: "Site information", links: siteInfoLinks },
  ].filter((group) => group.links.length > 0);

  return (
    <PublicPageShell pageFamily="html-sitemap" className="html-sitemap-page">
      <JsonLdScript
        id="jsonld-sitemap"
        data={buildTrustPageJsonLd({
          path: "/sitemap",
          title: "Sitemap",
          description,
          schemaType: "WebPage",
        })}
      />

      <section className="html-sitemap-hero" aria-labelledby="sitemap-title">
        <h1 className="page-title" id="sitemap-title">Sitemap</h1>
        <p className="page-intro">
          A grouped index of the public pages and printable coloring page collections on {siteConfig.siteName}.
        </p>
      </section>

      <section className="content-section" aria-label="Sitemap links">
        <div className="html-sitemap-grid">
          {groups.map((group) => (
            <section className="html-sitemap-group" key={group.label} aria-labelledby={`sitemap-${slugify(group.label)}`}>
              <h2 className="html-sitemap-group-title" id={`sitemap-${slugify(group.label)}`}>
                {group.label}
              </h2>
              <div className="html-sitemap-link-list">
                {group.links.map((link) => (
                  <Link className="html-sitemap-link" href={link.href} key={link.href} prefetch={false}>
                    <span className="html-sitemap-link-label">{link.label}</span>
                    {typeof link.count === "number" ? (
                      <strong className="html-sitemap-link-count">{link.count.toLocaleString()}</strong>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}

function toSitemapLink(link: SitemapHubLink, label = link.label): SitemapLink {
  return {
    label,
    href: link.href,
    count: link.assetCount,
  };
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
