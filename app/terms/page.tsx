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
      intro={`These terms explain how coloring pages from ${siteIdentity.siteName} may be downloaded, printed, and used.`}
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

      <TrustSection title="Coloring pages and permitted use">
        <p>
          Created and published by I Love Coloring Page. You may download and print the coloring pages for personal use, family and household use,
          classroom use, homeschool use, and nonprofit educational use.
        </p>
        <p>
          You may share or display your own completed colored artwork for ordinary personal, family, classroom, homeschool, or nonprofit educational
          purposes. These permissions apply to the coloring pages supplied by this site and do not grant rights in third-party names, marks, or other
          protected material that may be referenced by a title or subject.
        </p>
      </TrustSection>

      <TrustSection title="Uses that require written permission">
        <p>Without prior written permission, you may not:</p>
        <ul>
          <li>Sell, resell, redistribute, republish, re-upload, or sublicense the files.</li>
          <li>Include the files in paid products, memberships, books, courses, bundles, applications, or services.</li>
          <li>Use the files for other commercial exploitation.</li>
        </ul>
      </TrustSection>

      <TrustSection title="Print, downloads, and availability">
        <p>
          Print and download are separate actions. Download PDF saves the current one-page US Letter printable. Print prepares the same PDF and opens the device print workflow. PNG and JPG
          are printable-page images; WebP is an artwork image. SVG is not offered as a public download. Format availability may depend on browser
          capability, and pages or features may change as factual defects are corrected.
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
          The site and this page may be updated. Any governing-law clause or material change to these permissions requires verified owner input and
          appropriate review.
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
