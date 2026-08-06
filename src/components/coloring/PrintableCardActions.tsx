"use client";

import { lazy, Suspense, useId, useRef } from "react";

import { useSiteInteractions } from "@/components/site/SiteInteractionProvider";
import { restoreFocusAfterModalClose } from "@/hooks/useModalDialog";
import type { PublicColoringItem } from "@/lib/coloring/types";

const PrintablePreviewDialog = lazy(() => import("./PrintablePreviewDialog").then((module) => ({
  default: module.PrintablePreviewDialog,
})));

type PrintableCardActionsProps = {
  item: PublicColoringItem;
  assetUrls: {
    png: string | null;
    internalSvg?: string | null;
  };
  className?: string;
  buttonClassName?: string;
};

export function PrintableCardActions({ item, assetUrls, className, buttonClassName }: PrintableCardActionsProps) {
  const surfaceId = useId();
  const surface = { kind: "printable-dialog" as const, id: surfaceId };
  const { closeModal, isModalOpen, openModal } = useSiteInteractions();
  const open = isModalOpen(surface);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasPrintableAsset = Boolean(assetUrls.internalSvg || assetUrls.png);

  function closeDialog() {
    closeModal(surface);
    restoreFocusAfterModalClose(triggerRef.current);
  }

  return (
    <div className={className || "gallery-actions"}>
      <button
        ref={triggerRef}
        className={buttonClassName || "button button-ghost button-small gallery-print-button"}
        type="button"
        onClick={() => openModal(surface)}
        disabled={!hasPrintableAsset}
        aria-haspopup="dialog"
      >
        Print
      </button>
      {open ? (
        <Suspense fallback={null}>
          <PrintablePreviewDialog
            open
            onClose={closeDialog}
            item={item}
            internalSvgUrl={assetUrls.internalSvg}
            pngPreviewUrl={assetUrls.png}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
