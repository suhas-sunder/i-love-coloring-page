import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/about");
const title = `About ${siteIdentity.siteName}`;
const description = `Learn about ${siteIdentity.siteName}, a static library for browsing, printing, and downloading coloring pages.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function AboutPage() {
  return (
    <TrustPage
      eyebrow="About"
      title={title}
      intro={`${siteIdentity.siteName} is a static printable coloring-page library organized to make browsing and using individual pages straightforward.`}
    >
      <JsonLdScript
        id="jsonld-about"
        data={buildTrustPageJsonLd({
          path: "/about",
          title,
          description,
          schemaType: "AboutPage",
        })}
      />

      <TrustSection title="What this site offers">
        <p>
          Visitors can browse collections and open an individual printable page by selecting its image or title. Print is a separate action, and PNG,
          JPG, and WebP downloads are available from the printable workflow.
        </p>
      </TrustSection>

      <TrustSection title="Finding a printable">
        <p>
          Pages are organized into subject, audience, style, and seasonal collections. Search and filters operate in the browser to help visitors find
          a relevant printable without creating separate public search pages.
        </p>
      </TrustSection>

      <TrustSection title="Current scope">
        <p>
          The site currently has no accounts, comments, user uploads, payments, or online coloring editor. It does not ask visitors to submit content
          through the website.
        </p>
        <p>
          Broken pages, print or download problems, accessibility issues, and rights concerns can be reported through the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
