import type { Metadata } from "next";
import Link from "next/link";

import { TrustPage, TrustSection } from "@/components/site/TrustPage";
import { getCanonicalUrl, siteConfig } from "@/lib/site/siteConfig";

const canonical = getCanonicalUrl("/about");

export const metadata: Metadata = {
  title: `About ${siteConfig.siteName}`,
  description: `Learn about ${siteConfig.siteName}, a printable coloring page library organized into useful collections with PNG print and download options.`,
  alternates: { canonical },
  openGraph: {
    title: `About ${siteConfig.siteName}`,
    description: "A printable coloring page library organized into searchable collections with PNG downloads.",
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `About ${siteConfig.siteName}`,
    description: "A printable coloring page library organized into searchable collections with PNG downloads.",
  },
};

export default function AboutPage() {
  return (
    <TrustPage
      eyebrow="About"
      title={`About ${siteConfig.siteName}`}
      intro={`${siteConfig.siteName} is a printable coloring page library built for quick browsing, clear previews, and simple PNG printing or downloads.`}
    >
      <TrustSection title="What this site is">
        <p>
          The site organizes coloring pages into practical collections, including animals, seasonal themes, fantasy subjects, detailed pages for adults,
          simpler pages for kids, and other printable topics. The goal is to help visitors find a page quickly without digging through raw file names or
          unrelated image folders.
        </p>
      </TrustSection>

      <TrustSection title="How the library is organized">
        <p>
          Pages are grouped into public collections when there is enough useful content and a clear reason for visitors to browse that topic. The main
          gallery includes search, filters, featured previews, print controls, and PNG downloads for visible items.
        </p>
      </TrustSection>

      <TrustSection title="What you can do here">
        <ul>
          <li>Browse printable coloring page collections by subject, style, or season.</li>
          <li>Preview pages before printing or downloading.</li>
          <li>Use PNG downloads for personal, home, classroom, and casual craft use, subject to the Terms of Use.</li>
          <li>Report broken pages, image problems, copyright concerns, or accessibility issues through the contact page.</li>
        </ul>
      </TrustSection>

      <TrustSection title="What is not available yet">
        <p>
          The current public site is a static printable gallery. Future online coloring tools may be explored separately, but this version focuses on
          browsing, printing, and downloading PNG coloring pages.
        </p>
        <p>
          For questions or issue reports, visit the <Link href="/contact">contact page</Link>.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
