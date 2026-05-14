"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  prepareHighQualityPrintImage,
  printOnePagePdf,
  revokePreparedPrintImage,
  type PreparedPrintImageResult,
} from "@/lib/coloring/browserDownloads";
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [preparedPrintImage, setPreparedPrintImage] = useState<PreparedPrintImageResult | null>(null);
  const prepareRunId = useRef(0);
  const titleId = useId();
  const pngPreviewUrl = assetUrls.png;
  const internalSvgUrl = assetUrls.internalSvg;
  const hasPrintableAsset = Boolean(internalSvgUrl || pngPreviewUrl);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPreviewOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePrintPreview();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen]);

  useEffect(() => {
    return () => {
      revokePreparedPrintImage(preparedPrintImage);
    };
  }, [preparedPrintImage]);

  async function openPrintPreview() {
    if (!hasPrintableAsset) return;
    setIsPreviewOpen(true);
    setActionStatus("Preparing preview...");

    const runId = prepareRunId.current + 1;
    prepareRunId.current = runId;
    setIsPreparingPrint(true);
    setPreparedPrintImage((current) => {
      revokePreparedPrintImage(current);
      return null;
    });

    const result = await prepareHighQualityPrintImage({
      internalSvgUrl,
      pngPreviewUrl,
      title: item.title,
      altText: item.altText,
    });

    if (prepareRunId.current !== runId) {
      revokePreparedPrintImage(result);
      return;
    }

    setPreparedPrintImage(result);
    setIsPreparingPrint(false);
    setActionStatus(result.ok ? result.message || "Print preview ready." : result.message);
  }

  function closePrintPreview() {
    prepareRunId.current += 1;
    setIsPreviewOpen(false);
    setIsPreparingPrint(false);
    setIsPrintingPdf(false);
    setActionStatus("");
    setPreparedPrintImage((current) => {
      revokePreparedPrintImage(current);
      return null;
    });
  }

  async function printPreparedPreview() {
    if (!preparedPrintImage?.ok || isPrintingPdf) return;
    if (!internalSvgUrl) {
      setActionStatus("Print could not be prepared. Try a PNG download instead.");
      return;
    }

    setIsPrintingPdf(true);
    setActionStatus("Preparing printable PDF...");

    const result = await printOnePagePdf({
      internalSvgUrl,
      pngPreviewUrl,
      title: item.title,
      altText: item.altText,
    });

    setActionStatus(result.ok ? result.message || "Printable PDF is ready." : result.message);
    setIsPrintingPdf(false);
  }

  const previewWorkflow =
    isPreviewOpen && mounted
        ? createPortal(
          <div className="print-preview-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePrintPreview();
          }}>
            <section className="print-preview-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <div className="print-preview-header">
                <div className="print-preview-copy">
                  <h2 id={titleId}>{item.title}</h2>
                </div>
                <div className="print-preview-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={printPreparedPreview}
                    disabled={!preparedPrintImage?.ok || isPrintingPdf || !internalSvgUrl}
                  >
                    {isPrintingPdf ? "Preparing PDF" : "Print"}
                  </button>
                  <button className="button button-ghost" type="button" onClick={closePrintPreview}>
                    Close
                  </button>
                </div>
              </div>

              <div className="print-preview-media" aria-live="polite">
                {isPreparingPrint ? (
                  <div className="print-preview-state">
                    <strong>{item.title}</strong>
                    <span>Preparing print preview...</span>
                  </div>
                ) : preparedPrintImage?.ok ? (
                  <img src={preparedPrintImage.imageUrl} alt={item.altText} />
                ) : (
                  <div className="print-preview-state print-preview-state-error">
                    <strong>Print preview could not be prepared.</strong>
                    <span>Try a download instead, or reload the page and try again.</span>
                  </div>
                )}
              </div>

              <div className="print-preview-downloads">
                <span className="print-preview-download-title">Download</span>
                <DownloadMenu
                  title={item.title}
                  internalSvgUrl={internalSvgUrl}
                  pngPreviewUrl={pngPreviewUrl}
                  aria-label={`Download PNG, JPG, or WebP for ${item.title}`}
                  onStatus={setActionStatus}
                />
              </div>
              {actionStatus ? (
                <p className="print-preview-status" aria-live="polite">
                  {actionStatus}
                </p>
              ) : null}
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <article className="gallery-item" id={`asset-${item.assetId}`}>
      <button
        className="gallery-item-media-button"
        type="button"
        onClick={openPrintPreview}
        disabled={!hasPrintableAsset}
        aria-label={hasPrintableAsset ? `Preview and print ${item.title}` : `${item.title} print assets pending`}
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
            <button className="button button-primary button-small" type="button" onClick={openPrintPreview} aria-label={`Preview and print ${item.title}`}>
              Print
            </button>
          ) : (
            <span className="button button-disabled button-small">Assets pending</span>
          )}
        </div>
        {actionStatus ? (
          <p className="gallery-action-status" aria-live="polite">
            {actionStatus}
          </p>
        ) : null}
      </div>

      {previewWorkflow}
    </article>
  );
}
