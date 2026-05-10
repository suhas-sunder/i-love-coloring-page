"use client";

import { resolveColoringAssetUrl } from "@/lib/coloring/assets";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";

type ImageCardProps = {
  item: PublicColoringItem;
  priority?: boolean;
};

export function ImageCard({ item, priority = false }: ImageCardProps) {
  const pngUrl = resolveColoringAssetUrl(item.assetSubpaths.pngPreview);
  const svgUrl = resolveColoringAssetUrl(item.assetSubpaths.svg);
  const printUrl = pngUrl || svgUrl;

  function printImage() {
    if (!printUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>${escapeHtml(item.title)}</title></head>
        <body style="margin:0;display:grid;place-items:center;min-height:100vh;">
          <img src="${printUrl}" alt="${escapeHtml(item.altText)}" style="max-width:100%;max-height:100vh;" onload="window.print();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <article className="image-card">
      <div className="image-card-media">
        <AssetImage item={item} priority={priority} />
      </div>
      <div className="image-card-body">
        <h3>{item.title}</h3>
        <div className="image-card-actions" aria-label={`${item.title} actions`}>
          {pngUrl ? (
            <a className="mini-button" href={pngUrl} download aria-label={`Download PNG for ${item.title}`}>
              Download PNG
            </a>
          ) : null}
          {svgUrl ? (
            <a className="mini-button" href={svgUrl} download aria-label={`Download SVG for ${item.title}`}>
              Download SVG
            </a>
          ) : null}
          {printUrl ? (
            <button className="mini-button" type="button" onClick={printImage} aria-label={`Print ${item.title}`}>
              Print
            </button>
          ) : (
            <span className="mini-button mini-button-disabled">Assets pending</span>
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
