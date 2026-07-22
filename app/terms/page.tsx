import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/terms");
const title = "Terms of Use";
const description = `Current use information for browsing, printing, and downloading coloring pages from ${siteIdentity.siteName}.`;
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
          The site provides a static library for browsing printable coloring pages and using separate Print and download actions.{" "}
          {siteIdentity.publicOperatorDisplayName} is the public operator display. No personal name, business entity, mailing address, governing-law
          clause, venue rule, or dispute-resolution clause is published.
        </p>
      </TrustSection>

      <TrustSection title="Artwork use and licensing">
        <p>
          Verified record-level provenance, licensing, assignment, or public-domain evidence is not currently available to support a sitewide
          ownership or licensing conclusion. A final public-use license is under review. The presence of Print and download controls is a technical
          capability and does not itself create a general public license.
        </p>
        <p>
          No general rule for printing, downloading, redistribution, modification, commercial use, or attribution has been approved. This statement
          does not claim ownership of every artwork or third-party right, and it does not turn the absence of an approved license into an invented
          prohibition. Final permitted-use terms remain under review.
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
        <p>
          A request should identify the exact page URL and material at issue, provide the requester's name and contact information, explain the
          claimed right or factual concern, include supporting information sufficient to evaluate it, and state the requested correction or removal.
          {siteIdentity.siteName} may review, restrict, correct, or remove material after evaluating the request.
        </p>
        <p>This process is not presented as a statutory notice procedure, designated-agent process, or legal determination.</p>
      </TrustSection>

      <TrustSection title="External and affiliate links">
        <p>
          The site may link to websites it does not control and is not responsible for their availability or practices. Affiliate links are not
          currently active. If they are introduced, qualifying links will be disclosed as described in the{" "}
          <Link href="/affiliate-disclosure">Affiliate Disclosure</Link>.
        </p>
      </TrustSection>

      <TrustSection title="Changes to the site or terms">
        <p>
          The site and this page may be updated. A final permitted-use policy or governing-law clause will not be added without verified owner input
          and appropriate review.
        </p>
      </TrustSection>

      <TrustSection title="Contact">
        <p>
          Questions can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
