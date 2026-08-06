"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import {
  computePrintableLayout,
  PRINTABLE_COMPOSITION,
  type ArtworkScalePercent,
  type CompositionBox,
  type PrintableLayout,
  type PrintableProfileRequest,
} from "@/lib/coloring/exportComposition";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";

type PrintablePagePreviewProps = {
  item: PublicColoringItem;
  imageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  settings: Required<PrintableProfileRequest>;
  compact?: boolean;
  priority?: boolean;
};

export function PrintablePagePreview({
  item,
  imageUrl,
  sourceWidth,
  sourceHeight,
  settings,
  compact = false,
  priority = false,
}: PrintablePagePreviewProps) {
  const layout = useMemo(
    () => computePrintableLayout(sourceWidth, sourceHeight, settings),
    [settings, sourceHeight, sourceWidth],
  );
  const pageStyle = {
    aspectRatio: `${layout.page.widthPt} / ${layout.page.heightPt}`,
    maxWidth: `${layout.page.widthPt}px`,
  } satisfies CSSProperties;
  const previewLabel = `${item.title} printable page preview: ${layout.page.paperSize}, ${layout.page.orientation}, ${formatScaleLabel(layout.artworkScalePercent)}`;

  return (
    <div className="printable-preview-shell" data-compact={compact ? "true" : "false"}>
      <div
        className="printable-preview printable-page-preview"
        aria-label={previewLabel}
        data-artwork-scale={layout.artworkScalePercent}
        data-page-profile={layout.page.id}
        data-printable-page-preview="true"
        data-preview-renderer="css-geometry"
        data-requested-orientation={layout.requestedOrientation}
        data-resolved-orientation={layout.page.orientation}
        role="img"
        style={pageStyle}
      >
        <span className="printable-preview-artwork" style={toCssBox(layout.imageBox, layout)}>
          <AssetImage item={item} imageUrl={imageUrl} priority={priority} width={sourceWidth} height={sourceHeight} />
        </span>
        <svg
          className="printable-preview-composition-overlay"
          aria-hidden="true"
          viewBox={`0 0 ${layout.pageBounds.width} ${layout.pageBounds.height}`}
        >
          <rect
            fill="none"
            height={layout.outerFrame.height}
            stroke={PRINTABLE_COMPOSITION.frame.color}
            strokeWidth={PRINTABLE_COMPOSITION.frame.lineWidthPt}
            width={layout.outerFrame.width}
            x={layout.outerFrame.x}
            y={toSvgY(layout.outerFrame, layout)}
          />
          <rect
            fill={PRINTABLE_COMPOSITION.background}
            height={layout.brandKnockoutBox.height}
            width={layout.brandKnockoutBox.width}
            x={layout.brandKnockoutBox.x}
            y={toSvgY(layout.brandKnockoutBox, layout)}
          />
          <text
            dominantBaseline="hanging"
            fill={PRINTABLE_COMPOSITION.branding.color}
            fontFamily={PRINTABLE_COMPOSITION.branding.fontFamily}
            fontSize={PRINTABLE_COMPOSITION.branding.fontSizePt}
            textAnchor="middle"
            x={layout.brandBox.x + layout.brandBox.width / 2}
            y={toSvgY(layout.brandBox, layout)}
          >
            {PRINTABLE_COMPOSITION.branding.text}
          </text>
        </svg>
      </div>
      <p className="printable-preview-caption">{buildPreviewSummary(layout)}</p>
    </div>
  );
}

function toCssBox(box: CompositionBox, layout: PrintableLayout): CSSProperties {
  const { width, height } = layout.pageBounds;
  return {
    left: `${(box.x / width) * 100}%`,
    top: `${((height - box.y - box.height) / height) * 100}%`,
    width: `${(box.width / width) * 100}%`,
    height: `${(box.height / height) * 100}%`,
  };
}

function toSvgY(box: CompositionBox, layout: PrintableLayout) {
  return layout.pageBounds.height - box.y - box.height;
}

function buildPreviewSummary(layout: PrintableLayout) {
  const scale = formatScaleLabel(layout.artworkScalePercent);
  const output = `${layout.page.paperSize}, ${layout.page.orientation}, ${scale}`;
  return layout.requestedOrientation === "auto" ? `Auto selected: ${capitalize(layout.page.orientation)}. ${output}` : output;
}

function formatScaleLabel(scalePercent: ArtworkScalePercent) {
  return scalePercent === 100 ? "maximum artwork size" : `${scalePercent}% artwork size`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
