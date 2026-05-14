import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/contact");
const contactEmail = siteConfig.contactEmail;

export const metadata: Metadata = {
  title: `Contact ${siteConfig.siteName}`,
  description: `Contact ${siteConfig.siteName} about broken pages, image issues, copyright concerns, accessibility issues, partnerships, or affiliate inquiries.`,
  alternates: { canonical },
  openGraph: {
    title: `Contact ${siteConfig.siteName}`,
    description: "Contact the site about page issues, image concerns, accessibility, copyright, or partnership questions.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `Contact ${siteConfig.siteName}`,
    description: "Contact the site about page issues, image concerns, accessibility, copyright, or partnership questions.",
  },
};

export default function ContactPage() {
  return (
    <TrustPage
      eyebrow="Contact"
      title="Contact"
      intro="Use this page for site questions, issue reports, copyright concerns, accessibility notes, and future partnership or affiliate inquiries."
      reviewNote={contactEmail ? undefined : "Owner input needed: provide a real public contact email before launch and AdSense review."}
    >
      <JsonLdScript
        id="jsonld-contact"
        data={buildTrustPageJsonLd({
          path: "/contact",
          title: `Contact ${siteConfig.siteName}`,
          description: metadata.description as string,
          schemaType: "ContactPage",
          contactEmail,
        })}
      />
      <TrustSection title="Contact details">
        {contactEmail ? (
          <p>
            Email: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>
        ) : (
          <p>
            Contact details coming soon. The site owner needs to provide a public contact email before launch and before any AdSense review.
          </p>
        )}
      </TrustSection>

      <TrustSection title="Reasons to contact">
        <ul>
          <li>A page does not load or a gallery image appears broken.</li>
          <li>An image has a quality, safety, or accessibility issue.</li>
          <li>You have a copyright concern or ownership question.</li>
          <li>You found confusing text, a broken link, or a print/download problem.</li>
          <li>You have a partnership or affiliate inquiry for a future content round.</li>
        </ul>
      </TrustSection>

      <TrustSection title="Copyright and image concerns">
        <p>
          If you believe a page or image should be reviewed, include the page URL, a short explanation, and any ownership or rights information that
          helps the site owner evaluate the issue. Do not send private personal information that is not needed for the request.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
