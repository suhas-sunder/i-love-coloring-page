"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  prepareHighQualityPrintImage,
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
    function handleAfterPrint() {
      document.body.classList.remove("printing-coloring-page");
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("printing-coloring-page");
    };
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
    document.body.classList.remove("printing-coloring-page");
    setIsPreviewOpen(false);
    setIsPreparingPrint(false);
    setActionStatus("");
    setPreparedPrintImage((current) => {
      revokePreparedPrintImage(current);
      return null;
    });
  }

  function printPreparedPreview() {
    if (!preparedPrintImage?.ok) return;
    document.body.classList.add("printing-coloring-page");
    window.setTimeout(() => {
      window.print();
    }, 50);
  }

  const previewWorkflow =
    isPreviewOpen && mounted
      ? createPortal(
          <div className="print-preview-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePrintPreview();
          }}>
            <section className="print-preview-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <div className="print-preview-copy">
                <p className="print-preview-kicker">I Love Coloring Page</p>
                <h2 id={titleId}>{item.title}</h2>
                <p>Preview the printable page, then print or download a copy.</p>
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

              <div className="print-preview-actions">
                <button className="button button-primary" type="button" onClick={printPreparedPreview} disabled={!preparedPrintImage?.ok}>
                  Print
                </button>
                <button className="button button-ghost" type="button" onClick={closePrintPreview}>
                  Close
                </button>
              </div>

              <DownloadMenu
                title={item.title}
                internalSvgUrl={internalSvgUrl}
                pngPreviewUrl={pngPreviewUrl}
                aria-label={`Download PNG, JPG, or WebP for ${item.title}`}
                onStatus={setActionStatus}
              />
              {actionStatus ? (
                <p className="print-preview-status" aria-live="polite">
                  {actionStatus}
                </p>
              ) : null}
            </section>

            {preparedPrintImage?.ok ? (
              <section className="print-document" aria-label={`${item.title} printable page`}>
                <div className="print-document-artwork">
                  <div className="print-document-frame">
                    <img src={preparedPrintImage.imageUrl} alt={item.altText} />
                  </div>
                </div>
                <p className="print-document-brand">I Love Coloring Page</p>
              </section>
            ) : null}
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
