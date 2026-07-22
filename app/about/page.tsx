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
          Visitors can browse collections and open an individual printable page by selecting its image or title. Print is a separate action. PNG is
          the initial download option; JPG and WebP appear only when the browser reports that it can create those formats.
        </p>
      </TrustSection>

      <TrustSection title="Who operates the site">
        <p>
          {siteIdentity.publicOperatorDisplayName} is the public name used to operate this site. No personal name or registered business entity is
          identified as the operator.
        </p>
      </TrustSection>

      <TrustSection title="How the library is organized">
        <p>
          Automated tools organize approved runtime records, generate consistent page data, and validate routes, titles, counts, asset roles, and
          public-output rules. Editorial rules and record-specific review are used where evidence supports a decision. Uncertain metadata remains
          outside public output until it is reviewed.
        </p>
        <p>
          These checks do not mean that every printable received an individual manual visual review. The site also does not make a sitewide claim of
          ownership over every artwork, depicted subject, character, brand, trademark, or other third-party right.
        </p>
      </TrustSection>

      <TrustSection title="Finding a printable">
        <p>
          Pages are organized into subject, style, seasonal, and other browsing collections. Audience and visual-complexity labels are not treated as
          per-page facts unless a reviewed classification supports them. Search and filters operate in the browser without creating public search pages.
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
