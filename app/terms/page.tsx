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
      intro={`This page records current site-use information for ${siteIdentity.siteName}. It does not invent an artwork license or unverified operator terms.`}
    >
      <JsonLdScript
        id="jsonld-terms"
        data={buildTrustPageJsonLd({ path: "/terms", title, description, schemaType: "TermsOfService" })}
      />

      <TrustSection title="Last updated">
        <p>{siteIdentity.policyLastUpdatedLabel}</p>
      </TrustSection>

      <TrustSection title="Site purpose and current status">
        <p>
          The site provides a static library for browsing printable coloring pages and using separate Print and download actions. The public operator
          identity, governing-law language, artwork-rights provenance, and final permitted-use policy still require owner or legal review before
          publication.
        </p>
      </TrustSection>

      <TrustSection title="Artwork use and licensing">
        <p>
          Verified rights records are not currently available to support a sitewide personal, classroom, commercial, redistribution,
          or derivative-use license. This page therefore does not grant those permissions or claim ownership of every artwork. A reviewed use policy
          must be supplied before production launch.
        </p>
      </TrustSection>

      <TrustSection title="Print, downloads, and availability">
        <p>
          Print and download are separate actions. PNG is the server-rendered initial download option; JPG and WebP are shown only after browser
          capability detection. SVG remains internal and is not offered as a public download. Pages and features may change as factual defects are corrected.
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

      <TrustSection title="Changes to the site or terms">
        <p>The site and this page may be updated. A final permitted-use policy, operator identity, or governing-law clause must not be added without verified owner input and appropriate review.</p>
      </TrustSection>

      <TrustSection title="Contact">
        <p>
          Questions can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
