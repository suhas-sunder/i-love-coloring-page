import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/editorial-policy");
const title = "Editorial Policy";
const description = `How ${siteIdentity.siteName} handles public titles, collections, corrections, and established page URLs.`;
const contactEmail = siteIdentity.publicContactEmail;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function EditorialPolicyPage() {
  return (
    <TrustPage
      eyebrow="Editorial"
      title={title}
      intro="This page explains how visible titles, collections, related links, and corrections are handled across the printable library."
    >
      <JsonLdScript
        id="jsonld-editorial-policy"
        data={buildTrustPageJsonLd({ path: "/editorial-policy", title, description, schemaType: "WebPage" })}
      />

      <TrustSection title="Last updated">
        <p>{siteIdentity.policyLastUpdatedLabel}</p>
      </TrustSection>

      <TrustSection title="Titles and duplicate designs">
        <p>
          Public titles start from reviewed base titles and use deterministic quality rules. High-confidence spelling or formatting corrections may be
          applied. When multiple pages have the same base title, stable Design N labels distinguish them consistently. Uncertain wording is held for
          editorial review rather than guessed.
        </p>
      </TrustSection>

      <TrustSection title="Established page URLs">
        <p>
          Correcting visible wording does not silently create a new printable-page address. Established page URLs are preserved when display titles,
          descriptions, or classifications are corrected, where practical.
        </p>
      </TrustSection>

      <TrustSection title="Collections, search, and related links">
        <p>
          Collections are based on current explicit assignments. Printable details display useful output facts and values with recorded support, such
          as an approved collection assignment, paper size, or downloadable-image dimensions. Broad parent collections are not displayed as
          independently verified facts.
          Related pages rank shared narrow subjects, styles, and seasonal assignments before broader collection signals, with a stable final tie-break.
        </p>
      </TrustSection>

      <TrustSection title="Content and review">
        <p>Created and published by I Love Coloring Page.</p>
        <p>
          Consistent title, collection, route, count, and output rules are applied across the library. Editorial review is used for decisions that
          cannot be supported safely by those rules. Uncertain metadata is withheld from public output until it is reviewed.
        </p>
        <p>
          This process does not mean that all 6,352 printables received individual manual visual inspection. It also does not claim professional
          subject-matter expertise.
        </p>
      </TrustSection>

      <TrustSection title="Brand and trademark references">
        <p>
          Brand, franchise, character, vehicle-model, product, and trademark references are handled case by case. A factual reference may be retained
          when it accurately describes the depicted subject. A reference must not imply sponsorship, approval, authorization, affiliation, or
          endorsement, and the site does not claim ownership of third-party names or marks.
        </p>
        <p>
          Uncertain references are flagged for record-specific review. A reference may be corrected or removed when it is inaccurate, unsupported,
          misleading, or unnecessary. Uncertain brand names are not automatically replaced with invented generic wording, and this policy does not
          authorize a bulk title rewrite. Qualified review of this policy remains pending.
        </p>
      </TrustSection>

      <TrustSection title="Corrections and availability">
        <p>
          Report confusing titles, classification problems, broken pages, accessibility issues, or rights concerns through the{" "}
          <Link href="/contact">contact page</Link> or email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Include the page URL and a concise
          explanation. The site may update titles, descriptions, classifications, or availability while preserving established URLs where practical.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
