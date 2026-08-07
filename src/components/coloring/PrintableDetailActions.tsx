"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { loadPrintableExportRuntime } from "@/lib/coloring/browserExportLoader";
import { createAsyncOperationController } from "@/lib/coloring/asyncOperationController";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { PrintableCardActions } from "./PrintableCardActions";

const DownloadMenu = lazy(() => import("./DownloadMenu").then((module) => ({ default: module.DownloadMenu })));

type PrintableDetailActionsProps = {
  item: PublicColoringItem;
  internalSvgUrl: string | null;
  pngPreviewUrl: string | null;
};

export function PrintableDetailActions({ item, internalSvgUrl, pngPreviewUrl }: PrintableDetailActionsProps) {
  const [status, setStatus] = useState("");
  const [preparingPdf, setPreparingPdf] = useState(false);
  const pdfDownloadButtonRef = useRef<HTMLButtonElement>(null);
  const pdfDownloadOperationRef = useRef(createAsyncOperationController());
  const restorePdfFocusRef = useRef(false);

  useEffect(() => {
    if (preparingPdf || !restorePdfFocusRef.current) return;
    restorePdfFocusRef.current = false;
    pdfDownloadButtonRef.current?.focus({ preventScroll: true });
  }, [preparingPdf]);

  useEffect(() => {
    pdfDownloadOperationRef.current.cancel();
    restorePdfFocusRef.current = false;
    setPreparingPdf(false);
    setStatus("");
    return () => {
      restorePdfFocusRef.current = false;
      pdfDownloadOperationRef.current.cancel();
    };
  }, [item.canonicalPath]);

  async function downloadPdf() {
    if (!internalSvgUrl) return;
    const operation = pdfDownloadOperationRef.current.start();
    if (!operation) return;
    restorePdfFocusRef.current = document.activeElement === pdfDownloadButtonRef.current;
    setPreparingPdf(true);
    setStatus("Preparing PDF...");

    try {
      const { downloadOnePagePdf } = await loadPrintableExportRuntime();
      if (!pdfDownloadOperationRef.current.isCurrent(operation.id)) return;
      const result = await downloadOnePagePdf({
        internalSvgUrl,
        pngPreviewUrl,
        title: item.title,
        filenameBaseName: item.downloadBaseName,
        altText: item.altText,
        signal: operation.signal,
      });
      if (pdfDownloadOperationRef.current.isCurrent(operation.id)) setStatus(result.message);
    } catch {
      if (pdfDownloadOperationRef.current.isCurrent(operation.id)) {
        setStatus("The PDF download could not be prepared. Please try again.");
      }
    } finally {
      if (pdfDownloadOperationRef.current.finish(operation.id)) setPreparingPdf(false);
    }
  }

  return (
    <div className="printable-action-controls">
      <button
        ref={pdfDownloadButtonRef}
        className="button button-primary printable-pdf-download"
        type="button"
        onClick={downloadPdf}
        disabled={!internalSvgUrl || preparingPdf}
        aria-busy={preparingPdf}
      >
        {preparingPdf ? "Preparing PDF" : "Download PDF"}
      </button>
      <PrintableCardActions
        className="printable-print-action"
        buttonClassName="button button-subtle"
        item={item}
        assetUrls={{ internalSvg: internalSvgUrl, png: pngPreviewUrl }}
      />
      <div className="printable-download-group">
        <h2>Download image</h2>
        <Suspense fallback={<p className="utility-note">Loading download options...</p>}>
          <DownloadMenu title={item.title} downloadBaseName={item.downloadBaseName} internalSvgUrl={internalSvgUrl} pngPreviewUrl={pngPreviewUrl} aria-label={`Download available formats for ${item.title}`} onStatus={setStatus} />
        </Suspense>
      </div>
      <p className="print-preview-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </div>
  );
}
