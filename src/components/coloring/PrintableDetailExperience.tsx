"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  computePrintableLayout,
  DEFAULT_PRINTABLE_PROFILE,
  formatPrintablePageDimensions,
  formatPrintablePaperDimensions,
  normalizePrintableProfileRequest,
  type ArtworkScalePercent,
  type OrientationPreference,
  type PaperKind,
  type PrintableLayout,
  type PrintableProfileRequest,
} from "@/lib/coloring/exportComposition";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { PrintableDetailActions, type PrintablePaperOperationController } from "./PrintableDetailActions";
import { PrintablePagePreview } from "./PrintablePagePreview";

type PrintableDetailExperienceProps = {
  item: PublicColoringItem;
  preview: {
    kind: "webp-preview";
    url: string;
    width: number;
    height: number;
  };
  artworkWidth: number;
  artworkHeight: number;
  internalSvgUrl: string | null;
  pngPreviewUrl: string | null;
  detailItems: ReactNode;
};

const PAPER_OPTIONS: readonly PaperKind[] = ["letter", "a4"];
const ORIENTATION_OPTIONS: readonly OrientationPreference[] = ["portrait", "landscape", "auto"];
const ARTWORK_SCALE_OPTIONS: readonly ArtworkScalePercent[] = [100, 90, 75, 50];

export function PrintableDetailExperience({
  item,
  preview,
  artworkWidth,
  artworkHeight,
  internalSvgUrl,
  pngPreviewUrl,
  detailItems,
}: PrintableDetailExperienceProps) {
  const [settings, setSettings] = useState<Required<PrintableProfileRequest>>(() => ({ ...DEFAULT_PRINTABLE_PROFILE }));
  const [status, setStatus] = useState("");
  const [paperOperationBusy, setPaperOperationBusy] = useState(false);
  const paperOperationBusyRef = useRef(false);
  const defaultPaperInputRef = useRef<HTMLInputElement>(null);
  const restoreResetFocusRef = useRef(false);
  const inputPrefix = useId();
  const artworkSizeHelpId = `${inputPrefix}-artwork-size-help`;
  const layout = useMemo(
    () => computePrintableLayout(artworkWidth, artworkHeight, settings),
    [artworkHeight, artworkWidth, settings],
  );
  const paperPreview = useMemo(
    () => ({ imageUrl: preview.url, width: artworkWidth, height: artworkHeight }),
    [artworkHeight, artworkWidth, preview.url],
  );
  const isDefault = isDefaultSettings(settings);

  useEffect(() => {
    if (!isDefault || !restoreResetFocusRef.current) return;
    restoreResetFocusRef.current = false;
    defaultPaperInputRef.current?.focus();
  }, [isDefault]);

  const paperOperation: PrintablePaperOperationController = {
    busy: paperOperationBusy,
    begin() {
      if (paperOperationBusyRef.current) return false;
      paperOperationBusyRef.current = true;
      setPaperOperationBusy(true);
      return true;
    },
    end() {
      paperOperationBusyRef.current = false;
      setPaperOperationBusy(false);
    },
  };

  function applySettings(request: PrintableProfileRequest) {
    if (paperOperationBusyRef.current) return;
    try {
      const next = normalizePrintableProfileRequest(request);
      const nextLayout = computePrintableLayout(artworkWidth, artworkHeight, next);
      setSettings(next);
      setStatus(buildPreviewAnnouncement(nextLayout));
    } catch {
      setStatus("That print setting is not available.");
    }
  }

  function resetSettings() {
    restoreResetFocusRef.current = true;
    applySettings(DEFAULT_PRINTABLE_PROFILE);
  }

  return (
    <section className="printable-main" aria-label={`${item.title} preview and actions`} data-page-section="printable-main">
      <PrintablePagePreview
        item={item}
        imageUrl={preview.url}
        sourceWidth={artworkWidth}
        sourceHeight={artworkHeight}
        settings={settings}
        priority
      />
      <aside className="printable-action-panel" aria-label="Print and download options">
        <section
          className="printable-settings"
          aria-labelledby={`${inputPrefix}-title`}
          data-printable-settings-version="paper-controls-v1"
        >
          <div className="printable-settings-heading">
            <h2 id={`${inputPrefix}-title`}>Print settings</h2>
            {!isDefault ? (
              <button className="button button-ghost printable-settings-reset" type="button" onClick={resetSettings} disabled={paperOperationBusy}>
                Reset to defaults
              </button>
            ) : null}
          </div>

          <fieldset className="printable-settings-group" disabled={paperOperationBusy}>
            <legend>Paper</legend>
            <div className="printable-settings-options printable-settings-options-paper">
              {PAPER_OPTIONS.map((paperKind) => (
                <label className="printable-settings-option" htmlFor={`${inputPrefix}-paper-${paperKind}`} key={paperKind}>
                  <input
                    checked={settings.paperKind === paperKind}
                    id={`${inputPrefix}-paper-${paperKind}`}
                    name={`${inputPrefix}-paper`}
                    ref={paperKind === "letter" ? defaultPaperInputRef : undefined}
                    type="radio"
                    value={paperKind}
                    onChange={(event) => isPaperKind(event.currentTarget.value) && applySettings({ ...settings, paperKind: event.currentTarget.value })}
                  />
                  <span><strong>{paperKind === "letter" ? "US Letter" : "A4"}</strong><small>{formatPrintablePaperDimensions(paperKind)}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="printable-settings-group" disabled={paperOperationBusy}>
            <legend>Orientation</legend>
            <div className="printable-settings-options printable-settings-options-orientation">
              {ORIENTATION_OPTIONS.map((orientation) => (
                <label className="printable-settings-option" htmlFor={`${inputPrefix}-orientation-${orientation}`} key={orientation}>
                  <input
                    checked={settings.orientation === orientation}
                    id={`${inputPrefix}-orientation-${orientation}`}
                    name={`${inputPrefix}-orientation`}
                    type="radio"
                    value={orientation}
                    onChange={(event) => isOrientationPreference(event.currentTarget.value) && applySettings({ ...settings, orientation: event.currentTarget.value })}
                  />
                  <span><strong>{capitalize(orientation)}</strong>{orientation === "auto" ? <small>Chooses the orientation that gives the artwork more printable space.</small> : null}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="printable-settings-group" disabled={paperOperationBusy} aria-describedby={artworkSizeHelpId}>
            <legend>Artwork size</legend>
            <div className="printable-settings-options printable-settings-options-scale">
              {ARTWORK_SCALE_OPTIONS.map((scalePercent) => (
                <label className="printable-settings-option" htmlFor={`${inputPrefix}-scale-${scalePercent}`} key={scalePercent}>
                  <input
                    checked={settings.artworkScalePercent === scalePercent}
                    id={`${inputPrefix}-scale-${scalePercent}`}
                    name={`${inputPrefix}-scale`}
                    type="radio"
                    value={scalePercent}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      if (isArtworkScalePercent(value)) applySettings({ ...settings, artworkScalePercent: value });
                    }}
                  />
                  <span><strong>{scalePercent === 100 ? "Maximum" : `${scalePercent}%`}</strong></span>
                </label>
              ))}
            </div>
            <p className="printable-settings-help" id={artworkSizeHelpId}>Artwork size is relative to the largest safe fit inside the printable area.</p>
          </fieldset>

          <p className="printable-settings-current" data-resolved-orientation={layout.page.orientation}>
            {buildCurrentOutputSummary(layout)}
          </p>
        </section>

        <PrintableDetailActions
          item={item}
          internalSvgUrl={internalSvgUrl}
          pngPreviewUrl={pngPreviewUrl}
          composition={settings}
          paperOperation={paperOperation}
          paperPreview={paperPreview}
          status={status}
          onStatus={setStatus}
        />
        <h2 className="printable-details-title">Page details</h2>
        <dl className="printable-facts" data-printable-details>
          {detailItems}
          <div><dt>Printable PDF</dt><dd>{layout.page.paperSize}, {layout.page.orientation}</dd></div>
          <div><dt>PDF paper size</dt><dd>{formatPrintablePageDimensions(layout.page)}</dd></div>
          <div><dt>PNG/JPG output</dt><dd>{layout.page.widthPx} × {layout.page.heightPx} px</dd></div>
          <div><dt>WebP output</dt><dd>Artwork image</dd></div>
        </dl>
        <details className="printable-help">
          <summary>Printing and downloads</summary>
          <p>Download PDF saves the selected printable document. Print prepares the same PDF and opens the device print workflow. PNG and JPG save printable-page images using these settings; WebP saves the artwork without a paper page.</p>
        </details>
      </aside>
    </section>
  );
}

function buildPreviewAnnouncement(layout: PrintableLayout) {
  const scale = layout.artworkScalePercent === 100 ? "maximum" : `${layout.artworkScalePercent} percent`;
  if (layout.requestedOrientation === "auto") {
    return `Auto selected: ${layout.page.orientation}. Preview updated: ${layout.page.paperSize}, ${layout.page.orientation}, ${scale}.`;
  }
  return `Preview updated: ${layout.page.paperSize}, ${layout.page.orientation}, ${scale}.`;
}

function buildCurrentOutputSummary(layout: PrintableLayout) {
  const scale = formatScaleLabel(layout.artworkScalePercent);
  const output = `Current output: ${layout.page.paperSize}, ${layout.page.orientation}, ${scale}.`;
  return layout.requestedOrientation === "auto" ? `Auto selected: ${capitalize(layout.page.orientation)}. ${output}` : output;
}

function formatScaleLabel(scalePercent: ArtworkScalePercent) {
  return scalePercent === 100 ? "maximum artwork size" : `${scalePercent}% artwork size`;
}

function isDefaultSettings(settings: Required<PrintableProfileRequest>) {
  return settings.paperKind === DEFAULT_PRINTABLE_PROFILE.paperKind
    && settings.orientation === DEFAULT_PRINTABLE_PROFILE.orientation
    && settings.artworkScalePercent === DEFAULT_PRINTABLE_PROFILE.artworkScalePercent;
}

function isPaperKind(value: string): value is PaperKind {
  return PAPER_OPTIONS.includes(value as PaperKind);
}

function isOrientationPreference(value: string): value is OrientationPreference {
  return ORIENTATION_OPTIONS.includes(value as OrientationPreference);
}

function isArtworkScalePercent(value: number): value is ArtworkScalePercent {
  return ARTWORK_SCALE_OPTIONS.includes(value as ArtworkScalePercent);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
