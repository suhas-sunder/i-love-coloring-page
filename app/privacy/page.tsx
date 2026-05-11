import type { Metadata } from "next";
import Link from "next/link";

import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/privacy");
const updatedAt = "May 11, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read the draft privacy policy for I Love Coloring Page, including current static-site behavior and future advertising disclosures.",
  alternates: { canonical },
  openGraph: {
    title: "Privacy Policy",
    description: "Draft privacy policy for the printable coloring page library and future advertising disclosures.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy",
    description: "Draft privacy policy for the printable coloring page library and future advertising disclosures.",
  },
};

export default function PrivacyPage() {
  return (
    <TrustPage
      eyebrow="Draft policy"
      title="Privacy Policy"
      intro="This draft privacy policy describes the current static coloring page site and the disclosures that will need owner and legal review before launch or live advertising."
      reviewNote="Draft requiring owner/legal review before launch. This page is practical website policy copy, not final legal advice."
    >
      <TrustSection title="Last updated">
        <p>{updatedAt}</p>
      </TrustSection>

      <TrustSection title="What this site is">
        <p>
          {siteConfig.siteName} is currently a static printable coloring page gallery. Visitors can browse collections, preview images, print visible
          pages, and download PNG files. The current site does not provide accounts, user uploads, comments, saved galleries, payments, or a backend
          contact form.
        </p>
      </TrustSection>

      <TrustSection title="Information currently collected">
        <p>
          The static site does not currently ask visitors to create an account or submit personal information through the website. Standard hosting,
          CDN, and browser-request logs may still include technical information such as IP address, browser type, requested URL, referrer, and timing
          data when pages and media load.
        </p>
      </TrustSection>

      <TrustSection title="Analytics, advertising, and cookies">
        <p>
          Live Google AdSense code is not installed yet. The current ad wells are visible layout placeholders labeled Advertisement and do not request
          live ads. Analytics tooling is not documented as active in this round.
        </p>
        <p>
          If Google AdSense or other advertising is added later, third-party vendors including Google may use cookies or similar identifiers to serve
          ads based on a visitor&apos;s prior visits to this site or other sites. Google&apos;s use of advertising cookies enables Google and its
          partners to serve personalized or non-personalized ads, depending on settings, consent requirements, and configuration.
        </p>
        <p>
          Visitors may learn about personalized advertising choices through{" "}
          <a href="https://www.google.com/settings/ads" rel="noreferrer" target="_blank">
            Google Ads Settings
          </a>{" "}
          and about some third-party advertising opt-outs through{" "}
          <a href="https://www.aboutads.info/" rel="noreferrer" target="_blank">
            aboutads.info
          </a>
          . A future live-ad round should review cookie consent, regional privacy requirements, and AdSense settings before ad code is added.
        </p>
      </TrustSection>

      <TrustSection title="Affiliate links">
        <p>
          Affiliate links are not active in this round. If affiliate links are added later, the site may earn a commission from qualifying purchases or
          referral links. Affiliate disclosures should appear near affiliate content and on the <Link href="/affiliate-disclosure">Affiliate Disclosure</Link> page.
        </p>
      </TrustSection>

      <TrustSection title="Children's privacy">
        <p>
          Coloring pages may be useful for families, classrooms, and children, but the site is intended as a general-audience printable gallery. The
          current site does not knowingly collect account information from children. Future interactive features should be reviewed separately before
          launch.
        </p>
      </TrustSection>

      <TrustSection title="Contact and updates">
        {siteConfig.contactEmail ? (
          <p>
            Privacy questions can be sent to <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> or through the{" "}
            <Link href="/contact">contact page</Link>. This policy may be updated as analytics, advertising, affiliate links, or interactive features
            are added.
          </p>
        ) : (
          <p>
            Privacy questions should be directed through the <Link href="/contact">contact page</Link>. The owner should provide a real contact method
            before launch. This policy may be updated as analytics, advertising, affiliate links, or interactive features are added.
          </p>
        )}
      </TrustSection>
    </TrustPage>
  );
}
