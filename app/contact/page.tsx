import type { Metadata } from "next";

import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { getSiteUrl } from "@/lib/coloring/data";

const canonical = `${getSiteUrl()}/contact`;
const contactEmail = process.env.NEXT_PUBLIC_SITE_CONTACT_EMAIL;

export const metadata: Metadata = {
  title: "Contact I Love Coloring Page",
  description: "Contact I Love Coloring Page about broken pages, image issues, copyright concerns, accessibility issues, partnerships, or affiliate inquiries.",
  alternates: { canonical },
  openGraph: {
    title: "Contact I Love Coloring Page",
    description: "Contact the site about page issues, image concerns, accessibility, copyright, or partnership questions.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Contact I Love Coloring Page",
    description: "Contact the site about page issues, image concerns, accessibility, copyright, or partnership questions.",
  },
};

export default function ContactPage() {
  return (
    <TrustPage
      eyebrow="Contact"
      title="Contact"
      intro="Use this page for site questions, issue reports, copyright concerns, accessibility notes, and future partnership or affiliate inquiries."
      reviewNote="Owner input needed: set NEXT_PUBLIC_SITE_CONTACT_EMAIL before launch and AdSense review so this page has a real contact path."
    >
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
