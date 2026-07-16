import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/privacy");
const title = "Privacy Policy";
const description = `How ${siteIdentity.siteName} handles current static-site requests and how future features would change its privacy practices.`;
const contactEmail = siteIdentity.publicContactEmail;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function PrivacyPage() {
  return (
    <TrustPage
      eyebrow="Privacy"
      title={title}
      intro="This policy describes the website's current data practices and separates them from changes that would be required before future advertising or interactive features are enabled."
    >
      <JsonLdScript
        id="jsonld-privacy"
        data={buildTrustPageJsonLd({ path: "/privacy", title, description, schemaType: "PrivacyPolicy" })}
      />

      <TrustSection title="Last updated">
        <p>{siteIdentity.policyLastUpdatedLabel}</p>
      </TrustSection>

      <TrustSection title="Scope and current site">
        <p>
          {siteIdentity.siteName} is a static printable gallery. Visitors can browse, search, filter, print, and download files. Search and filters run
          in the browser and do not create public search routes.
        </p>
        <p>
          The site currently provides no accounts, comments, user uploads, payments, or contact form. It does not intentionally request names, birth
          dates, account details, or profile information through the website.
        </p>
      </TrustSection>

      <TrustSection title="Hosting and technical logs">
        <p>
          Hosting, content-delivery, asset-delivery, and security infrastructure may process routine request data when a page or image is requested.
          This may include an IP address, browser or device information, the requested URL, referrer, request time, and technical error or security
          information. Retention, location, and access depend on the infrastructure actually serving the request.
        </p>
      </TrustSection>

      <TrustSection title="Current cookies, analytics, and advertising">
        <p>
          Advertisement areas are inert layout placeholders. No live Google AdSense code, publisher ID, or live ad-unit ID is installed, and the
          placeholders do not request advertisements. They do not by themselves set Google advertising cookies.
        </p>
        <p>
          No site analytics tool is currently documented as active. The site does not document an active analytics or advertising cookie, but this is
          not a claim that browsers, hosting, content-delivery, asset-delivery, or security systems can never use technical storage or logs.
        </p>
      </TrustSection>

      <TrustSection title="If advertising is enabled later">
        <p>
          Before live advertising is activated, this policy will be updated to identify the vendors and choices actually in use. Third-party vendors
          may then use cookies or other identifiers, and Google or advertising partners may process data to serve, measure, personalize, or limit ads
          according to the site's configuration and applicable consent.
        </p>
        <p>
          Regional consent and age-treatment requirements must be configured before activation. Visitors will be given applicable controls when they
          are required. These are conditional future practices and are not active merely because advertisement placeholders are visible.
        </p>
      </TrustSection>

      <TrustSection title="Children and families">
        <p>
          The library includes content that may appeal to children, families, teachers, and adults. The current site has no account registration,
          comments, uploads, contact form, or age-entry mechanism, and it does not intentionally ask children to submit personal information.
        </p>
        <p>
          Parents or guardians may email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Any future interactive feature or live advertising
          implementation requires a separate children's-privacy and age-treatment review.
        </p>
      </TrustSection>

      <TrustSection title="Privacy questions and requests">
        <p>
          Visitors may email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or use the <Link href="/contact">contact page</Link> with privacy
          questions or requests concerning information they believe the site controls. A request may require reasonable verification. Applicable
          rights depend on the visitor's location and circumstances, and the site may not control records held by infrastructure providers.
        </p>
      </TrustSection>

      <TrustSection title="Policy updates">
        <p>
          This page may be updated when site features or data practices change. The displayed date records this text revision. Material feature changes
          should trigger another privacy review before they are enabled.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
