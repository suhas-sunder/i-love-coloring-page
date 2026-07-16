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

      <TrustSection title="Copyright and ownership concerns">
        <p>
          Include the page URL, a concise explanation of the concern, and relevant information showing your connection to the work or rights involved.
          The information will be reviewed, but contacting the site does not guarantee a particular outcome or removal.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
