import type { ReactNode } from "react";

import { AdRail } from "@/components/ads/AdRail";
import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { getAdPageLayout } from "@/lib/ads/config";
import type { AdPageFamily } from "@/lib/ads/types";

type PublicPageShellProps = {
  pageFamily: AdPageFamily;
  className?: string;
  children: ReactNode;
};

export function PublicPageShell({ pageFamily, className, children }: PublicPageShellProps) {
  const layout = getAdPageLayout(pageFamily);
  const classes = ["page-shell", "public-page-shell", className].filter(Boolean).join(" ");

  return (
    <main
      className={classes}
      data-ad-layout={layout.mode}
      data-ad-layout-version={layout.mode === "full" ? "manual-six-v2" : undefined}
      data-runtime-optimization-version="client-split-v1"
      data-link-graph-version="static-crawl-v1"
      data-page-family={pageFamily}
    >
      <PageAdSlot pageFamily={pageFamily} placement="top-banner" />
      {layout.sideRailsAllowed ? (
        <>
          <AdRail side="left" pageFamily={pageFamily} />
          <AdRail side="right" pageFamily={pageFamily} />
        </>
      ) : null}
      {children}
    </main>
  );
}
