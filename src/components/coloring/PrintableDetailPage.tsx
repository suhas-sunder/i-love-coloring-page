import Link from "next/link";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import { SupportingInformation } from "@/components/site/SupportingInformation";
import { resolveSvgAssetUrl, resolveWebpPreviewAssetUrl } from "@/lib/coloring/assets";
import { getNaturalPrintableTitle } from "@/lib/coloring/printableMetadata";
import { getPrintablePrimaryHub, getRelatedPrintableHubs, getRelatedPrintables } from "@/lib/coloring/printables";
import type { PublicColoringItem, RuntimePrintable } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";
import { GalleryGrid } from "./GalleryGrid";
import { PrintableDetailActions } from "./PrintableDetailActions";

export function PrintableDetailPage({ printable }: { printable: RuntimePrintable }) {
  const primaryHub = getPrintablePrimaryHub(printable);
  const naturalTitle = getNaturalPrintableTitle(printable.publicTitle);
  const relatedItems = getRelatedPrintables(printable, 8).map(toPublicItem);
  const relatedHubs = getRelatedPrintableHubs(printable, 6);
  const item = toPublicItem(printable);
  const webpUrl = resolveWebpPreviewAssetUrl(printable.webpPath);
  const svgUrl = resolveSvgAssetUrl(printable.svgPath);
  const orientation = printable.width && printable.height
    ? printable.width > printable.height ? "Landscape" : printable.width === printable.height ? "Square" : "Portrait"
    : null;

  return (
    <PublicPageShell pageFamily="printable" className="printable-detail-page">
      <Breadcrumbs
        className="printable-breadcrumb"
        items={[
          { label: "Home", href: "/" },
          { label: "Coloring Pages", href: "/coloring-pages" },
          { label: primaryHub.title, href: primaryHub.route },
          { label: naturalTitle },
        ]}
      />

      <header className="printable-heading">
        <h1 className="page-title page-title-wide">{naturalTitle}</h1>
        <p>Print or download the {naturalTitle} for coloring at home, in the classroom, or during a quiet activity.</p>
      </header>

      <PageAdSlot pageFamily="printable" placement="post-header-banner" />

      <section className="printable-main" aria-label={`${naturalTitle} preview and actions`} data-page-section="printable-main">
        <div className="printable-preview" style={{ aspectRatio: printable.width && printable.height ? `${printable.width} / ${printable.height}` : "3 / 4" }}>
          <AssetImage item={item} imageUrl={webpUrl} priority width={printable.width} height={printable.height} />
        </div>
        <aside className="printable-action-panel" aria-label="Print and download options">
          <PrintableDetailActions item={item} internalSvgUrl={svgUrl} pngPreviewUrl={null} />
          <dl className="printable-facts">
            <div><dt>Collection</dt><dd><Link href={primaryHub.route}>{primaryHub.title}</Link></dd></div>
            <div><dt>Formats</dt><dd>PNG, JPG, WebP</dd></div>
            {orientation ? <div><dt>Orientation</dt><dd>{orientation}</dd></div> : null}
            {printable.width && printable.height ? <div><dt>Preview</dt><dd>{printable.width} × {printable.height} px</dd></div> : null}
          </dl>
          <p className="utility-note">Print uses a branded Letter-size page. Downloads are prepared in your browser.</p>
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
            {relatedHubs.map((hub) => <Link className="related-link" href={hub.route} key={hub.hubId} prefetch={false}><span className="related-link-label">{hub.title}</span><span className="related-link-count">{hub.assetCount.toLocaleString("en-US")} pages</span></Link>)}
          </div>
        </section>
      ) : null}

      <SupportingInformation
        pageFamily="printable"
        id="printing-guidance"
        title="Printing this coloring page"
        intro="The preview remains paired with its Print and Download controls; the guidance below does not interrupt that task."
        sections={[
          { title: "Print the prepared page", body: "Use Print for the branded Letter layout. Check printer scaling and choose fit-to-page when needed." },
          { title: "Choose a download", body: "PNG and JPG use the prepared page composition, while WebP provides the artwork-oriented image." },
        ]}
      />
    </PublicPageShell>
  );
}

function toPublicItem(printable: RuntimePrintable): PublicColoringItem {
  return {
    assetId: printable.assetId,
    title: printable.publicTitle,
    altText: printable.altText,
    canonicalPath: printable.canonicalPath,
    assetSubpaths: { svg: printable.svgPath, webpPreview: printable.webpPath, pngPreview: null, thumbnail: null },
  };
}
