import Link from "next/link";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import { resolvePrintableAssetSources } from "@/lib/coloring/assets";
import { PRINTABLE_COMPOSITION } from "@/lib/coloring/exportComposition";
import { getPrintablePrimaryHub, getRelatedPrintableHubs, getRelatedPrintables } from "@/lib/coloring/printables";
import { getPrintableSummary, getPrintableTitleModel } from "@/lib/coloring/printableTitles";
import type { PublicColoringItem, RuntimePrintable } from "@/lib/coloring/types";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";

import { AssetImage } from "./AssetImage";
import { GalleryGrid } from "./GalleryGrid";
import { PrintableDetailActions } from "./PrintableDetailActions";

export function PrintableDetailPage({ printable }: { printable: RuntimePrintable }) {
  const primaryHub = getPrintablePrimaryHub(printable);
  const titleModel = getPrintableTitleModel(printable);
  const displayTitle = titleModel.displayTitle;
  const relatedItems = getRelatedPrintables(printable, 8).map(toPublicItem);
  const relatedHubs = getRelatedPrintableHubs(printable, 6);
  const item = toPublicItem(printable);
  const assetSources = resolvePrintableAssetSources(printable);
  const summary = getPrintableSummary(printable);
  const attributes = printable.attributes;

  return (
    <PublicPageShell pageFamily="printable" className="printable-detail-page">
      <Breadcrumbs
        className="printable-breadcrumb"
        items={[
          { label: "Home", href: "/" },
          { label: "Coloring Pages", href: "/coloring-pages" },
          { label: primaryHub.title, href: primaryHub.route },
          { label: displayTitle },
        ]}
      />

      <header className="printable-heading">
        <h1 className="page-title page-title-wide">{displayTitle}</h1>
        {summary ? <p>{summary}</p> : null}
      </header>

      <PageAdSlot pageFamily="printable" placement="post-header-banner" />

      <section className="printable-main" aria-label={`${displayTitle} preview and actions`} data-page-section="printable-main">
        <div
          className="printable-preview"
          data-preview-source={assetSources.principalPreview.kind}
          style={{
            aspectRatio: `${assetSources.principalPreview.width} / ${assetSources.principalPreview.height}`,
            maxWidth: `${assetSources.principalPreview.width}px`,
          }}
        >
          <AssetImage
            item={item}
            imageUrl={assetSources.principalPreview.url}
            priority
            width={assetSources.principalPreview.width}
            height={assetSources.principalPreview.height}
          />
        </div>
        <aside className="printable-action-panel" aria-label="Print and download options">
          <PrintableDetailActions item={item} internalSvgUrl={assetSources.fullResolutionArtwork.url} pngPreviewUrl={null} />
          <h2 className="printable-details-title">Page details</h2>
          <dl className="printable-facts" data-printable-details>
            <div><dt>Collection</dt><dd><Link href={primaryHub.route}>{primaryHub.title}</Link></dd></div>
            {attributes.narrowSubjectCategory ? <div><dt>Subject</dt><dd>{attributes.narrowSubjectCategory}</dd></div> : null}
            {attributes.styles.length ? <div><dt>Style</dt><dd>{attributes.styles.join(", ")}</dd></div> : null}
            {attributes.seasonalClassifications.length ? <div><dt>Occasion</dt><dd>{attributes.seasonalClassifications.join(", ")}</dd></div> : null}
            {attributes.orientation ? <div><dt>Artwork orientation</dt><dd>{capitalize(attributes.orientation)}</dd></div> : null}
            <div><dt>Printable PDF</dt><dd>{PRINTABLE_COMPOSITION.page.paperSize}, {PRINTABLE_COMPOSITION.page.orientation}</dd></div>
            <div><dt>PDF paper size</dt><dd>{PRINTABLE_COMPOSITION.page.widthIn} × {PRINTABLE_COMPOSITION.page.heightIn} in</dd></div>
            <div><dt>PNG/JPG output</dt><dd>{PRINTABLE_COMPOSITION.page.widthPx} × {PRINTABLE_COMPOSITION.page.heightPx} px</dd></div>
            <div><dt>WebP output</dt><dd>Artwork image</dd></div>
          </dl>
          <details className="printable-help">
            <summary>Printing and downloads</summary>
            <p>Download PDF saves a printable US Letter document. Print prepares the same PDF and opens the device print workflow. PNG and JPG save printable-page images; WebP saves the artwork without the Letter page.</p>
          </details>
        </aside>
      </section>

      <section className="content-section printable-related-section" aria-labelledby="related-printables-title">
        <div className="section-heading-row">
          <div><h2 className="section-title" id="related-printables-title">Related printable pages</h2><p>Browse more coloring pages closely connected to this printable.</p></div>
          <Link className="button button-subtle" href={primaryHub.route}>View {primaryHub.title}</Link>
        </div>
        <GalleryGrid items={relatedItems} priorityCount={0} showPrintActions={false} />
      </section>

      <PageAdSlot pageFamily="printable" placement="related-banner" />

      {relatedHubs.length > 0 ? (
        <section className="content-section" aria-labelledby="related-collections-title" data-page-section="related-collections">
          <h2 className="section-title" id="related-collections-title">Related Collections</h2>
          <div className="related-list printable-related-collections">
            {relatedHubs.map((hub) => <Link className="related-link" href={hub.route} key={hub.hubId} prefetch={false}><span className="related-link-label">{hub.title}</span><span className="related-link-count">{getCollectionCount(hub).toLocaleString("en-US")} pages</span></Link>)}
          </div>
        </section>
      ) : null}

    </PublicPageShell>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toPublicItem(printable: RuntimePrintable): PublicColoringItem {
  const titleModel = getPrintableTitleModel(printable);
  return {
    assetId: printable.assetId,
    title: titleModel.displayTitle,
    altText: titleModel.shortAccessibleTitle,
    downloadBaseName: titleModel.downloadBaseName,
    canonicalPath: printable.canonicalPath,
    assetSubpaths: { svg: printable.svgPath, webpPreview: printable.webpPath, pngPreview: null, thumbnail: null },
  };
}
