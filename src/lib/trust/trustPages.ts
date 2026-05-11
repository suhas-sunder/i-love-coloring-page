export type TrustPageRoute = {
  path: string;
  label: string;
  title: string;
  description: string;
  h1: string;
  footer: boolean;
  indexable: boolean;
  requiredBeforeAdsense: boolean;
  ownerReviewRequired: boolean;
  legalReviewRecommended: boolean;
  mentionsAdsCookiesAffiliate: boolean;
};

export const trustPages: TrustPageRoute[] = [
  {
    path: "/about",
    label: "About",
    title: "About I Love Coloring Page",
    description: "Learn about I Love Coloring Page, a printable coloring page library organized into useful collections with PNG print and download options.",
    h1: "About I Love Coloring Page",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    path: "/contact",
    label: "Contact",
    title: "Contact I Love Coloring Page",
    description: "Contact I Love Coloring Page about broken pages, image issues, copyright concerns, accessibility issues, partnerships, or affiliate inquiries.",
    h1: "Contact",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    path: "/privacy",
    label: "Privacy",
    title: "Privacy Policy",
    description: "Read the draft privacy policy for I Love Coloring Page, including current static-site behavior and future advertising disclosures.",
    h1: "Privacy Policy",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    path: "/terms",
    label: "Terms",
    title: "Terms of Use",
    description: "Read the draft terms for using I Love Coloring Page printable pages, PNG downloads, and site content.",
    h1: "Terms of Use",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    path: "/affiliate-disclosure",
    label: "Affiliate Disclosure",
    title: "Affiliate Disclosure",
    description: "Read the draft affiliate disclosure for future recommendation or referral links on I Love Coloring Page.",
    h1: "Affiliate Disclosure",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: false,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    path: "/editorial-policy",
    label: "Editorial Policy",
    title: "Editorial Policy",
    description: "Learn how I Love Coloring Page organizes collections, reviews printable page usefulness, and handles issue reports.",
    h1: "Editorial Policy",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: false,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
];

export const footerTrustLinks = trustPages
  .filter((page) => page.footer)
  .map((page) => ({
    label: page.label,
    href: page.path,
  }));

export function getTrustPage(path: string) {
  return trustPages.find((page) => page.path === path) || null;
}
