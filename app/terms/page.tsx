import type { Metadata } from "next";
import Link from "next/link";

import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/terms");
const updatedAt = "May 11, 2026";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Read the draft terms for using I Love Coloring Page printable pages, PNG downloads, and site content.",
  alternates: { canonical },
  openGraph: {
    title: "Terms of Use",
    description: "Draft terms for using printable coloring pages, PNG downloads, and site content.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Terms of Use",
    description: "Draft terms for using printable coloring pages, PNG downloads, and site content.",
  },
};

export default function TermsPage() {
  return (
    <TrustPage
      eyebrow="Draft terms"
      title="Terms of Use"
      intro="These draft terms outline practical use rules for browsing, printing, and downloading pages from I Love Coloring Page."
      reviewNote="Draft requiring owner/legal review before launch. This page is practical website policy copy, not final legal advice."
    >
      <TrustSection title="Last updated">
        <p>{updatedAt}</p>
      </TrustSection>

      <TrustSection title="Permitted personal and classroom use">
        <p>
          Visitors may browse the site and use PNG downloads or print controls for personal, home, classroom, library, therapy, and casual craft use.
          Teachers and caregivers may print reasonable quantities for their own groups or activities.
        </p>
      </TrustSection>

      <TrustSection title="Restrictions">
        <ul>
          <li>Do not use the site&apos;s files for resale, redistribution, repackaging, or a product you present as your own.</li>
          <li>Do not claim ownership of the site&apos;s assets, collections, text, or interface.</li>
          <li>Do not scrape or bulk-copy the site to create a competing library.</li>
          <li>Do not remove site notices or use the site in a way that misleads others about the source of the content.</li>
        </ul>
      </TrustSection>

      <TrustSection title="Downloads and availability">
        <p>
          Printable pages, previews, and downloads are provided as-is. The site may change, remove, reorganize, or update pages over time, and access
          is not guaranteed to be uninterrupted.
        </p>
      </TrustSection>

      <TrustSection title="Future tools">
        <p>
          The current public site is a static printable gallery. If future online coloring or account features are added, those features may need
          additional terms before launch.
        </p>
      </TrustSection>

      <TrustSection title="Copyright, external links, and affiliate links">
        <p>
          Copyright or intellectual property concerns should be sent through the <Link href="/contact">contact page</Link>
          {siteConfig.contactEmail ? (
            <>
              {" "}
              or by email at <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
            </>
          ) : null}
          . The site may link to external websites in future content. Affiliate links are not active in this round, but if they are added later, the{" "}
          <Link href="/affiliate-disclosure">Affiliate Disclosure</Link> will describe the relationship.
        </p>
      </TrustSection>

      <TrustSection title="Draft limitation language">
        <p>
          To the extent allowed by applicable law, the site is provided without warranties and the owner is not responsible for losses arising from
          unavailable pages, printing issues, download problems, or reliance on draft policy text. This language needs owner and legal review before
          launch.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
