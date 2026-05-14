import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/editorial-policy");

export const metadata: Metadata = {
  title: "Editorial Policy",
  description: "Learn how I Love Coloring Page organizes collections, reviews printable page usefulness, and handles issue reports.",
  alternates: { canonical },
  openGraph: {
    title: "Editorial Policy",
    description: "How this printable coloring page library organizes collections and handles issue reports.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Editorial Policy",
    description: "How this printable coloring page library organizes collections and handles issue reports.",
  },
};

export default function EditorialPolicyPage() {
  return (
    <TrustPage
      eyebrow="Editorial policy"
      title="Editorial Policy"
      intro="This page explains how the public coloring page library is organized and how visitors can report issues."
    >
      <JsonLdScript
        id="jsonld-editorial-policy"
        data={buildTrustPageJsonLd({
          path: "/editorial-policy",
          title: "Editorial Policy",
          description: metadata.description as string,
          schemaType: "WebPage",
        })}
      />
      <TrustSection title="How collections are organized">
        <p>
          Collections are organized around useful visitor intent, such as animals, seasonal topics, fantasy subjects, simple pages for kids, and more
          detailed printable pages. A topic should have enough useful pages and a clear browsing purpose before it becomes a public collection.
        </p>
      </TrustSection>

      <TrustSection title="How page usefulness is reviewed">
        <p>
          Public pages should show readable previews, clear titles, working print controls, and PNG downloads. Collections should help visitors choose
          a page without hiding the gallery behind long text or unrelated links.
        </p>
      </TrustSection>

      <TrustSection title="Quality and safety issues">
        <p>
          Visitors can report broken images, confusing page titles, accessibility issues, copyright concerns, or image quality problems through the{" "}
          <Link href="/contact">contact page</Link>
          {siteConfig.contactEmail ? (
            <>
              {" "}
              or by email at <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
            </>
          ) : null}
          . Reports should include the page URL and a short explanation.
        </p>
      </TrustSection>

      <TrustSection title="Advertising and affiliate separation">
        <p>
          Advertising wells are labeled Advertisement and should stay separate from navigation, gallery cards, image controls, and download actions.
          Future affiliate recommendations should be clearly disclosed and should not be mixed into navigation menus.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
