import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/affiliate-disclosure");
const title = "Affiliate Disclosure";
const description = `Current affiliate-link status and disclosure practices for ${siteIdentity.siteName}.`;
const contactEmail = siteIdentity.publicContactEmail;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function AffiliateDisclosurePage() {
  return (
    <TrustPage
      eyebrow="Disclosure"
      title={title}
      intro="No affiliate links are currently active on this site. This page explains what will change before affiliate monetization begins."
    >
      <JsonLdScript
        id="jsonld-affiliate-disclosure"
        data={buildTrustPageJsonLd({ path: "/affiliate-disclosure", title, description, schemaType: "WebPage" })}
      />

      <TrustSection title="Last updated">
        <p>{siteIdentity.policyLastUpdatedLabel}</p>
      </TrustSection>

      <TrustSection title="Current status">
        <p>
          The site currently has no active affiliate links or documented affiliate program relationships. It does not earn commissions from ordinary
          printable-page links, Print actions, or download actions.
        </p>
      </TrustSection>

      <TrustSection title="If affiliate links are added">
        <p>
          Qualifying links will be disclosed clearly near the relevant content so visitors can understand the relationship before clicking. This page
          will be updated before affiliate monetization begins.
        </p>
      </TrustSection>

      <TrustSection title="Advertising is separate">
        <p>
          Live advertising is currently disabled, and the site does not claim an active advertiser relationship. Advertising is not the same as an
          affiliate link. Advertising-related policies, audience treatment, consent choices, and account configuration require review before any
          advertising is enabled.
        </p>
      </TrustSection>

      <TrustSection title="Questions">
        <p>
          Questions about affiliate or partnership plans can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
