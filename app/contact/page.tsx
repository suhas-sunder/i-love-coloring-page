import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/contact");
const title = `Contact ${siteIdentity.siteName}`;
const description = `Contact ${siteIdentity.siteName} about site problems, accessibility, corrections, privacy, rights concerns, or partnerships.`;
const contactEmail = siteIdentity.publicContactEmail;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function ContactPage() {
  return (
    <TrustPage
      eyebrow="Contact"
      title="Contact"
      intro="Use this address for factual site questions and issue reports. This page does not collect submissions through a form."
    >
      <JsonLdScript
        id="jsonld-contact"
        data={buildTrustPageJsonLd({
          path: "/contact",
          title,
          description,
          schemaType: "ContactPage",
          contactEmail,
        })}
      />

      <TrustSection title="Email">
        <p>
          Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
        <p>Please do not send passwords, financial information, health information, identity documents, or other sensitive personal information.</p>
      </TrustSection>

      <TrustSection title="Reasons to contact us">
        <ul>
          <li>Broken page or image reports</li>
          <li>Print or download problems</li>
          <li>Accessibility feedback</li>
          <li>Copyright or ownership concerns</li>
          <li>Title, description, or classification corrections</li>
          <li>Privacy questions</li>
          <li>Partnership or affiliate inquiries</li>
        </ul>
      </TrustSection>

      <TrustSection title="Correction and removal requests">
        <p>
          A person who believes that material on the site should be corrected or removed may contact{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
        <p>The request should include:</p>
        <ol>
          <li>The exact page URL.</li>
          <li>Identification of the material at issue.</li>
          <li>The requester&apos;s name and contact information.</li>
          <li>A clear explanation of the claimed right or factual concern.</li>
          <li>Supporting information sufficient to evaluate the request.</li>
          <li>The requested correction or removal.</li>
        </ol>
        <p>{siteIdentity.siteName} may review, restrict, correct, or remove material after evaluating the request.</p>
        <p>This is a contact and review process. It is not presented as a statutory notice procedure, designated-agent process, or legal determination.</p>
      </TrustSection>
    </TrustPage>
  );
}
