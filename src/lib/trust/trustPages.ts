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
    description: "Learn about I Love Coloring Page, a static library for browsing, printing, and downloading coloring pages.",
    h1: "About I Love Coloring Page",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: false,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    path: "/contact",
    label: "Contact",
    title: "Contact I Love Coloring Page",
    description: "Contact I Love Coloring Page about site problems, accessibility, corrections, privacy, rights concerns, or partnerships.",
    h1: "Contact",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: true,
    ownerReviewRequired: false,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    path: "/privacy",
    label: "Privacy",
    title: "Privacy Policy",
    description: "How I Love Coloring Page handles current static-site requests and how future features would change its privacy practices.",
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
    description: "Terms for browsing, printing, and downloading coloring pages from I Love Coloring Page.",
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
    description: "Current affiliate-link status and disclosure practices for I Love Coloring Page.",
    h1: "Affiliate Disclosure",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: false,
    ownerReviewRequired: false,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    path: "/editorial-policy",
    label: "Editorial Policy",
    title: "Editorial Policy",
    description: "How I Love Coloring Page handles public titles, collections, corrections, and established page URLs.",
    h1: "Editorial Policy",
    footer: true,
    indexable: true,
    requiredBeforeAdsense: false,
    ownerReviewRequired: false,
    legalReviewRecommended: true,
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
