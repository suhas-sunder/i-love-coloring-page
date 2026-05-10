"use client";

import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";

type ImageCardProps = {
  item: PublicColoringItem;
  assetUrls: {
    preview: string | null;
    thumbnail?: string | null;
    png: string | null;
    svg: string | null;
  };
  priority?: boolean;
};

export function ImageCard({ item, assetUrls, priority = false }: ImageCardProps) {
  const pngUrl = assetUrls.png;
  const svgUrl = assetUrls.svg;
  const printUrl = pngUrl || svgUrl;

  function printImage() {
    if (!printUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
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
    <article className="gallery-item">
      <div className="gallery-item-media">
        <AssetImage item={item} imageUrl={assetUrls.preview} priority={priority} />
      </div>
      <div className="gallery-item-body">
        <h3 className="item-title">{item.title}</h3>
        <div className="gallery-actions" aria-label={`${item.title} actions`}>
          {pngUrl ? (
            <a className="button button-subtle button-small" href={pngUrl} download aria-label={`Download PNG for ${item.title}`}>
              PNG
            </a>
          ) : null}
          {svgUrl ? (
            <a className="button button-subtle button-small" href={svgUrl} download aria-label={`Download SVG for ${item.title}`}>
              SVG
            </a>
          ) : null}
          {printUrl ? (
            <button className="button button-ghost button-small" type="button" onClick={printImage} aria-label={`Print ${item.title}`}>
              Print
            </button>
          ) : (
            <span className="button button-disabled button-small">Assets pending</span>
          )}
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
