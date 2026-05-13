"use client";

import { useState } from "react";

import { printFromHighQualitySource } from "@/lib/coloring/browserDownloads";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";
import { DownloadMenu } from "./DownloadMenu";

type ImageCardProps = {
  item: PublicColoringItem;
  assetUrls: {
    preview: string | null;
    fallbackPreview?: string | null;
    thumbnail?: string | null;
    png: string | null;
    internalSvg?: string | null;
  };
  itemHref?: string;
  priority?: boolean;
};

export function ImageCard({ item, assetUrls, priority = false }: ImageCardProps) {
  const [actionStatus, setActionStatus] = useState("");
  const pngPreviewUrl = assetUrls.png;
  const internalSvgUrl = assetUrls.internalSvg;
  const hasPrintableAsset = Boolean(internalSvgUrl || pngPreviewUrl);
  // Old gallery-item-media-link href={itemHref} anchors were replaced so the preview opens print prep.

  async function printImage() {
    if (!hasPrintableAsset) return;
    setActionStatus("Preparing print file...");
    const result = await printFromHighQualitySource({
      internalSvgUrl,
      pngPreviewUrl,
      title: item.title,
      altText: item.altText,
    });
    setActionStatus(result.ok ? result.message || "Print window opened." : result.message);
  }

  return (
    <article className="gallery-item" id={`asset-${item.assetId}`}>
      <button
        className="gallery-item-media-button"
        type="button"
        onClick={printImage}
        disabled={!hasPrintableAsset}
        aria-label={hasPrintableAsset ? `Prepare ${item.title} for printing` : `${item.title} print assets pending`}
      >
        <span className="gallery-item-media">
          <AssetImage
            item={item}
            imageUrl={assetUrls.preview}
            fallbackImageUrl={assetUrls.fallbackPreview}
            priority={priority}
            interactive={hasPrintableAsset}
          />
        </span>
      </button>
      <div className="gallery-item-body">
        <h3 className="item-title">{item.title}</h3>
        <div className="gallery-actions" aria-label={`${item.title} actions`}>
          {hasPrintableAsset ? (
            <button className="button button-primary button-small" type="button" onClick={printImage} aria-label={`Print ${item.title}`}>
              Print
            </button>
          ) : (
            <span className="button button-disabled button-small">Assets pending</span>
          )}
          {hasPrintableAsset ? (
            <DownloadMenu
              title={item.title}
              internalSvgUrl={internalSvgUrl}
              pngPreviewUrl={pngPreviewUrl}
              aria-label={`Download PNG, JPG, or WebP for ${item.title}`}
              onStatus={setActionStatus}
            />
          ) : null}
        </div>
        {actionStatus ? (
          <p className="gallery-action-status" aria-live="polite">
            {actionStatus}
          </p>
        ) : null}
      </div>
    </article>
  );
}
