import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/affiliate-disclosure");

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
  description: "Read the draft affiliate disclosure for future recommendation or referral links on I Love Coloring Page.",
  alternates: { canonical },
  openGraph: {
    title: "Affiliate Disclosure",
    description: "Draft affiliate disclosure for future recommendation or referral links.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Affiliate Disclosure",
    description: "Draft affiliate disclosure for future recommendation or referral links.",
  },
};

export default function AffiliateDisclosurePage() {
  return (
    <TrustPage
      eyebrow="Draft disclosure"
      title="Affiliate Disclosure"
      intro="Affiliate links are not active in this round, but this page prepares the site for future recommendation or referral content."
      reviewNote="Draft requiring owner/legal review before affiliate links are used."
    >
      <JsonLdScript
        id="jsonld-affiliate-disclosure"
        data={buildTrustPageJsonLd({
          path: "/affiliate-disclosure",
          title: "Affiliate Disclosure",
          description: metadata.description as string,
          schemaType: "WebPage",
        })}
      />
      <TrustSection title="How affiliate links may work">
        <p>
          In the future, I Love Coloring Page may link to products, supplies, books, printing tools, or other resources. If an affiliate relationship is
          active, the site may earn a commission from qualifying purchases or referral links at no additional cost to the visitor.
        </p>
      </TrustSection>

      <TrustSection title="Where disclosures should appear">
        <p>
          This page is not a substitute for clear disclosure near affiliate content. If affiliate links are added, a simple disclosure should appear
          close to the recommendation or link so visitors can understand the relationship before clicking.
        </p>
      </TrustSection>

      <TrustSection title="Editorial independence">
        <p>
          Future affiliate content should be chosen because it is relevant to printable coloring, crafts, classrooms, or family activities. Affiliate
          compensation should not change the need for useful, honest, and clearly labeled recommendations.
        </p>
        {siteConfig.contactEmail ? (
          <p>
            Questions about affiliate content can be sent to <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> or through the{" "}
            <Link href="/contact">contact page</Link>.
          </p>
        ) : (
          <p>
            Questions about affiliate content can be sent through the <Link href="/contact">contact page</Link> once the public contact method is
            configured.
          </p>
        )}
      </TrustSection>
    </TrustPage>
  );
}
