import type { ColoringHub } from "@/lib/coloring/types";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/site/Breadcrumbs";

type CollectionPageHeaderProps = {
  hub: ColoringHub;
  intro: string;
  title?: string;
  page?: number;
  showFacts?: boolean;
};

export function CollectionPageHeader({ hub, intro, title = hub.h1, page = 1, showFacts = true }: CollectionPageHeaderProps) {
  const heading = page > 1 ? `${title}, Page ${page}` : title;
  const breadcrumbs = getBreadcrumbs(hub, page);

  return (
    <header className="collection-page-header" data-page-section="page-header">
      <Breadcrumbs items={breadcrumbs} />
      <h1 className="page-title page-title-wide">{heading}</h1>
      <p className="page-intro">{intro}</p>
      {showFacts ? (
        <ul className="hero-facts" aria-label="Collection summary">
          <li><strong>{hub.assetCount.toLocaleString()}</strong> printable pages</li>
          <li>Images and titles open printable pages</li>
          <li>Print and download actions stay separate</li>
        </ul>
      ) : null}
    </header>
  );
}

function getBreadcrumbs(hub: ColoringHub, page: number): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  for (const [index, crumb] of hub.breadcrumbPath.entries()) {
    const isCollectionCrumb = index === hub.breadcrumbPath.length - 1;
    const href = crumb.route || (isCollectionCrumb ? hub.route : undefined);
    if (crumbs.some((entry) => entry.href === href && entry.label === crumb.label)) continue;
    crumbs.push({ label: crumb.label, href });
  }

  if (crumbs.length === 1 || crumbs.at(-1)?.label !== hub.title.replace(/ Coloring Pages$/, "")) {
    crumbs.push({ label: hub.title.replace(/ Coloring Pages$/, ""), href: hub.route });
  }

  if (page > 1) crumbs.push({ label: `Page ${page}` });
  else crumbs[crumbs.length - 1] = { label: crumbs.at(-1)!.label };
  return crumbs;
}
