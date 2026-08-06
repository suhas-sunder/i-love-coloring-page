"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import type { PrintableProfileRequest } from "@/lib/coloring/exportComposition";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { PrintableCardActions } from "./PrintableCardActions";

const DownloadMenu = lazy(() => import("./DownloadMenu").then((module) => ({ default: module.DownloadMenu })));

type PrintableDetailActionsProps = {
  item: PublicColoringItem;
  internalSvgUrl: string | null;
  pngPreviewUrl: string | null;
  composition: Required<PrintableProfileRequest>;
  paperOperation: PrintablePaperOperationController;
  paperPreview: {
    imageUrl: string;
    width: number;
    height: number;
  };
  status: string;
  onStatus: (message: string) => void;
};

export type PrintablePaperOperationController = {
  busy: boolean;
  begin: () => boolean;
  end: () => void;
};

export function PrintableDetailActions({
  item,
  internalSvgUrl,
  pngPreviewUrl,
  composition,
  paperOperation,
  paperPreview,
  status,
  onStatus,
}: PrintableDetailActionsProps) {
  const [preparingPdf, setPreparingPdf] = useState(false);
  const pdfDownloadButtonRef = useRef<HTMLButtonElement>(null);
  const pdfDownloadInProgressRef = useRef(false);
  const restorePdfFocusRef = useRef(false);

  useEffect(() => {
    if (preparingPdf || !restorePdfFocusRef.current) return;
    restorePdfFocusRef.current = false;
    pdfDownloadButtonRef.current?.focus({ preventScroll: true });
  }, [preparingPdf]);

  async function downloadPdf() {
    if (!internalSvgUrl || pdfDownloadInProgressRef.current || !paperOperation.begin()) return;
    const compositionSnapshot = { ...composition };
    restorePdfFocusRef.current = document.activeElement === pdfDownloadButtonRef.current;
    pdfDownloadInProgressRef.current = true;
    setPreparingPdf(true);
    onStatus("Preparing PDF...");

    try {
      const { downloadOnePagePdf } = await import("@/lib/coloring/browserDownloads");
      const result = await downloadOnePagePdf({
        internalSvgUrl,
        pngPreviewUrl,
        title: item.title,
        filenameBaseName: item.downloadBaseName,
        altText: item.altText,
        composition: compositionSnapshot,
      });
      onStatus(result.message);
    } catch {
      onStatus("The printable PDF could not be prepared. Please try again.");
    } finally {
      pdfDownloadInProgressRef.current = false;
      setPreparingPdf(false);
      paperOperation.end();
    }
  }

  return (
    <div className="printable-action-controls">
      <button
        ref={pdfDownloadButtonRef}
        className="button button-primary printable-pdf-download"
        type="button"
        onClick={downloadPdf}
        disabled={!internalSvgUrl || preparingPdf || paperOperation.busy}
        aria-busy={preparingPdf}
      >
        {preparingPdf ? "Preparing PDF" : "Download PDF"}
      </button>
      <PrintableCardActions
        className="printable-print-action"
        buttonClassName="button button-subtle"
        item={item}
        assetUrls={{ internalSvg: internalSvgUrl, png: pngPreviewUrl }}
        composition={composition}
        paperOperation={paperOperation}
        paperPreview={paperPreview}
      />
      <div className="printable-download-group">
        <h2>Download image</h2>
        <Suspense fallback={<p className="utility-note">Loading download options...</p>}>
          <DownloadMenu title={item.title} downloadBaseName={item.downloadBaseName} internalSvgUrl={internalSvgUrl} pngPreviewUrl={pngPreviewUrl} aria-label={`Download available formats for ${item.title}`} onStatus={onStatus} composition={composition} paperOperation={paperOperation} sourceWidth={paperPreview.width} sourceHeight={paperPreview.height} />
        </Suspense>
      </div>
      <p className="print-preview-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </div>
  );
}
