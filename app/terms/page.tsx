import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/terms");
const title = "Terms of Use";
const description = `Terms for browsing, printing, and downloading coloring pages from ${siteIdentity.siteName}.`;
const contactEmail = siteIdentity.publicContactEmail;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function TermsPage() {
  return (
    <TrustPage
      eyebrow="Terms"
      title={title}
      intro={`These terms describe permitted use of ${siteIdentity.siteName} and its printable pages.`}
    >
      <JsonLdScript
        id="jsonld-terms"
        data={buildTrustPageJsonLd({ path: "/terms", title, description, schemaType: "TermsOfService" })}
      />

      <TrustSection title="Last updated">
        <p>{siteIdentity.policyLastUpdatedLabel}</p>
      </TrustSection>

      <TrustSection title="Acceptance and site purpose">
        <p>
          By using this site, you agree to these terms. The site provides a static library for browsing printable coloring pages, using a separate Print
          action, and downloading PNG, JPG, or WebP files.
        </p>
      </TrustSection>

      <TrustSection title="Permitted use">
        <p>
          Visitors may print or download pages for personal, home, classroom, library, and casual craft use. Teachers, librarians, caregivers, and
          families may make reasonable copies for their own groups or activities.
        </p>
      </TrustSection>

      <TrustSection title="Restrictions">
        <ul>
          <li>Do not resell individual files or printed pages.</li>
          <li>Do not bulk-redistribute, repackage, or publish the library as another collection.</li>
          <li>Do not claim that you created or own site content that you did not create or own.</li>
          <li>Do not scrape or bulk-copy the site to build a competing printable library.</li>
          <li>Do not remove notices or mislead others about the source of content.</li>
        </ul>
      </TrustSection>

      <TrustSection title="Print, downloads, and availability">
        <p>
          Print and download are separate actions. Available downloads are PNG, JPG, and WebP; SVG is not offered as a public download. Pages,
          formats, and features may be corrected, reorganized, removed, or unavailable, and permanent or uninterrupted access is not promised.
        </p>
      </TrustSection>

      <TrustSection title="Intellectual property and removal concerns">
        <p>
          Site titles and subjects may refer to names, themes, or marks associated with others. Their inclusion does not claim ownership of a third
          party's rights or guarantee that every title or subject is free of third-party claims. Send concerns with the page URL and relevant rights
          information to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or see the <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>

      <TrustSection title="External and affiliate links">
        <p>
          The site may link to websites it does not control and is not responsible for their availability or practices. Affiliate links are not
          currently active. If they are introduced, qualifying links will be disclosed as described in the{" "}
          <Link href="/affiliate-disclosure">Affiliate Disclosure</Link>.
        </p>
      </TrustSection>

      <TrustSection title="No warranties">
        <p>
          The site and its content are provided as available. No promise is made that every page will always be accurate, available, or suitable for a
          particular purpose.
        </p>
      </TrustSection>

      <TrustSection title="Limitations">
        <p>
          To the extent permitted by applicable law, the site operator is not responsible for indirect or consequential losses arising from use of the
          site, unavailable pages, printing problems, download problems, or reliance on site content.
        </p>
      </TrustSection>

      <TrustSection title="Changes to the site or terms">
        <p>The site and these terms may be updated. Material changes to features or permitted use should trigger another review of this page.</p>
      </TrustSection>

      <TrustSection title="Contact">
        <p>
          Questions can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
