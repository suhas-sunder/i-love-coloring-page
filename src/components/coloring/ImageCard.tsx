"use client";

import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";

type ImageCardProps = {
  item: PublicColoringItem;
  assetUrls: {
    preview: string | null;
    thumbnail?: string | null;
    png: string | null;
  };
  itemHref?: string;
  priority?: boolean;
};

export function ImageCard({ item, assetUrls, itemHref = `#asset-${item.assetId}`, priority = false }: ImageCardProps) {
  const pngUrl = assetUrls.png;
  const printUrl = pngUrl;
  const downloadUrl = pngUrl;

  function printImage() {
    if (!printUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`
      <html>
        <head><title>${escapeHtml(item.title)}</title></head>
        <body style="margin:0;display:grid;place-items:center;min-height:100vh;">
          <img src="${escapeHtml(printUrl)}" alt="${escapeHtml(item.altText)}" style="max-width:100%;max-height:100vh;" onload="window.print();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <article className="gallery-item" id={`asset-${item.assetId}`}>
      <a className="gallery-item-media-link" href={itemHref} aria-label={`View ${item.title}`}>
        <span className="gallery-item-media">
          <AssetImage item={item} imageUrl={assetUrls.preview} priority={priority} />
        </span>
      </a>
      <div className="gallery-item-body">
        <h3 className="item-title">{item.title}</h3>
        <div className="gallery-actions" aria-label={`${item.title} actions`}>
          {printUrl ? (
            <button className="button button-primary button-small" type="button" onClick={printImage} aria-label={`Print ${item.title}`}>
              Print
            </button>
          ) : (
            <span className="button button-disabled button-small">Assets pending</span>
          )}
          {downloadUrl ? (
            <a className="gallery-download-link" href={downloadUrl} download aria-label={`Download PNG for ${item.title}`}>
              Download PNG
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
