"use client";

import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useModalDialog } from "@/hooks/useModalDialog";
import type { PreparedPrintImageResult } from "@/lib/coloring/browserDownloads";
import type { PublicColoringItem } from "@/lib/coloring/types";

const DownloadMenu = lazy(() => import("./DownloadMenu").then((module) => ({ default: module.DownloadMenu })));

type PrintablePreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  item: PublicColoringItem;
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
};

export function PrintablePreviewDialog({ open, onClose, item, internalSvgUrl, pngPreviewUrl }: PrintablePreviewDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [prepared, setPrepared] = useState<PreparedPrintImageResult | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const runIdRef = useRef(0);
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  useModalDialog({ open, panelRef, onEscape: onClose });

  useEffect(() => {
    if (!open) {
      runIdRef.current += 1;
      setPreparing(false);
      setPrinting(false);
      setStatus("");
      setPrepared((current) => {
        revokePreparedImage(current);
        return null;
      });
      return;
    }

    const runId = ++runIdRef.current;
    setPreparing(true);
    setStatus("Preparing preview...");
    void import("@/lib/coloring/browserDownloads").then(async ({ prepareHighQualityPrintImage }) => {
      const result = await prepareHighQualityPrintImage({ internalSvgUrl, pngPreviewUrl, title: item.title, filenameBaseName: item.downloadBaseName, altText: item.altText });
      if (runIdRef.current !== runId) {
        revokePreparedImage(result);
        return;
      }
      setPrepared(result);
      setPreparing(false);
      setStatus(result.ok ? result.message || "Print preview ready." : result.message);
    });
  }, [internalSvgUrl, item.altText, item.title, open, pngPreviewUrl]);

  useEffect(() => () => revokePreparedImage(prepared), [prepared]);

  async function printPreview() {
    if (!prepared?.ok || printing || !internalSvgUrl) return;
    const runId = runIdRef.current;
    setPrinting(true);
    setStatus("Preparing printable PDF...");
    const { printOnePagePdf } = await import("@/lib/coloring/browserDownloads");
    const result = await printOnePagePdf({ internalSvgUrl, pngPreviewUrl, title: item.title, filenameBaseName: item.downloadBaseName, altText: item.altText });
    if (runIdRef.current !== runId) return;
    setStatus(result.ok ? result.message || "Printable PDF is ready." : result.message);
    setPrinting(false);
  }

  if (!mounted || !open) return null;
  return createPortal(
    <div className="print-preview-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={panelRef} className="print-preview-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="print-preview-header">
          <div className="print-preview-copy"><h2 id={titleId}>{item.title}</h2></div>
          <div className="print-preview-actions">
            <button className="button button-primary" type="button" onClick={printPreview} disabled={!prepared?.ok || printing || !internalSvgUrl}>{printing ? "Preparing PDF" : "Print"}</button>
            <button className="button button-ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="print-preview-media" aria-live="polite">
          {preparing ? <div className="print-preview-state"><strong>{item.title}</strong><span>Preparing print preview...</span></div> : prepared?.ok ? <img src={prepared.imageUrl} alt={item.altText} /> : <div className="print-preview-state print-preview-state-error"><strong>Print preview could not be prepared.</strong><span>Try a download instead, or reload the page and try again.</span></div>}
        </div>
        <div className="print-preview-downloads">
          <Suspense fallback={<span>Loading download options...</span>}><DownloadMenu title={item.title} downloadBaseName={item.downloadBaseName} internalSvgUrl={internalSvgUrl} pngPreviewUrl={pngPreviewUrl} aria-label={`Download available formats for ${item.title}`} onStatus={setStatus} /></Suspense>
        </div>
        {status ? <p className="print-preview-status" aria-live="polite">{status}</p> : null}
      </section>
    </div>,
    document.body,
  );
}

function revokePreparedImage(prepared: PreparedPrintImageResult | null | undefined) {
  if (!prepared?.ok || !prepared.revokeObjectUrl || typeof URL === "undefined") return;
  URL.revokeObjectURL(prepared.imageUrl);
}
