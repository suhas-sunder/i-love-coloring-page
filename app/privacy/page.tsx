import type { Metadata } from "next";
import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { siteIdentity } from "@/config/siteIdentity";
import { buildTrustPageJsonLd } from "@/lib/seo/pageJsonLd";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/privacy");
const title = "Privacy Policy";
const description = `How ${siteIdentity.siteName} handles site requests, Google display advertising, analytics status, and privacy choices.`;
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
      intro="This policy describes the website's current data practices, advertising configuration, analytics status, and visitor choices."
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
          No account is required to browse, download, or print a coloring page. The site currently provides no accounts, comments, user uploads,
          payments, or contact form. It does not intentionally request names, birth dates, account details, or profile information through the website.
        </p>
      </TrustSection>

      <TrustSection title="Operator and contact">
        <p>
          {siteIdentity.publicOperatorDisplayName} is the public operator display used by this site. No personal name, business entity, or mailing
          address is published. Privacy questions may be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </TrustSection>

      <TrustSection title="Hosting and technical logs">
        <p>
          The static site is configured for Netlify hosting, and current production responses show Netlify delivery behind Cloudflare. Coloring-page
          files are requested from the site&apos;s separate public asset host. These hosting, content-delivery, asset-delivery, and security services may
          process routine request data when a page or image is requested. This may include an IP address, browser or device information, the requested
          URL, referrer, request time, and technical error or security information. Retention, location, and access depend on the infrastructure
          actually serving the request.
        </p>
      </TrustSection>

      <TrustSection title="Google display advertising">
        <p>
          The site is configured to use Google AdSense display advertising on eligible content pages. Google and approved advertising partners may
          process information such as device and browser details, IP address, requested page, ad interactions, and cookie or related-technology
          identifiers to deliver, limit, secure, and measure advertising.
        </p>
        <p>
          Google may use advertising cookies and related technologies. Personalized advertising may be used only where it is enabled and the required
          choices or consent have been obtained. Other visitors may receive non-personalized or limited ads, or no ad request, according to the
          applicable configuration.
        </p>
        <p>
          Visitors can review or change Google advertising choices through{" "}
          <a href="https://adssettings.google.com/" rel="noreferrer">Google Ads Settings</a> and can learn about additional industry opt-out choices at{" "}
          <a href="https://optout.aboutads.info/" rel="noreferrer">YourAdChoices</a>. Browser settings may also limit cookies, although doing so may
          affect site or advertising behavior.
        </p>
      </TrustSection>

      <TrustSection title="Regional advertising controls">
        <p>
          The site does not guess a visitor&apos;s region from language, locale, or time zone. Eligible production content pages use the configured
          AdSense units automatically. Advertising choices, consent messages, and any required treatment for visitors in the EEA, the UK, and
          Switzerland depend on Google&apos;s approved controls and the site&apos;s authenticated advertising-account configuration. Those external
          settings require owner and qualified review and are not inferred from repository source.
        </p>
      </TrustSection>

      <TrustSection title="Analytics status">
        <p>
          PostHog is not currently active. The site does not load a PostHog package or script and does not send PostHog events. Another analytics
          provider may be considered later only after its collection, retention, choices, and policy wording are reviewed.
        </p>
        <p>
          Cloudflare Browser Insights or Real User Monitoring is not included in repository source. A production check on August 2, 2026 still found
          a Cloudflare-injected performance beacon, so Cloudflare may continue to receive browser performance data until the account-level Web
          Analytics entry is disabled and a production network check confirms the beacon is gone.
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
        <p>
          The existence of a For Kids collection does not establish a legal or advertising classification for the entire site. The site does not ask
          for a visitor's age or birth date and does not infer a visitor's age.
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
