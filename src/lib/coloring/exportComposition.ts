export type CompositionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrintableCompositionUnit = "pdf" | "raster";

export type PrintableLayout = {
  unit: PrintableCompositionUnit;
  scaleFromPdfPoints: number;
  pageBounds: CompositionBox;
  outerFrame: CompositionBox;
  safeContentBounds: CompositionBox;
  artworkBox: CompositionBox;
  imageBox: CompositionBox;
  brandBox: CompositionBox;
  brandKnockoutBox: CompositionBox;
  brandPlacement: "bottom-frame-label";
  printableBorderCount: 1;
};

const page = Object.freeze({ widthPt: 612, heightPt: 792, widthPx: 2550, heightPx: 3300, rasterDpi: 300 });
const frame = Object.freeze({ insetPt: 10, lineWidthPt: 0.55, color: "#c2bad1" });
const branding = Object.freeze({
  text: "iLoveColoringPage.com",
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSizePt: 7,
  color: "#6b4a80",
  knockoutPaddingXPt: 4,
  knockoutPaddingYPt: 1,
});

export const PRINTABLE_COMPOSITION = Object.freeze({
  page,
  background: "#ffffff",
  frame,
  safePaddingPt: 5,
  branding,
  artworkFit: "contain-centered" as const,
  jpegQuality: 0.94,
});

export function computePrintableLayout(sourceWidth: number, sourceHeight: number, unit: PrintableCompositionUnit = "pdf"): PrintableLayout {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Printable artwork dimensions must be positive finite numbers.");
  }

  const outerFrame = {
    x: PRINTABLE_COMPOSITION.frame.insetPt,
    y: PRINTABLE_COMPOSITION.frame.insetPt,
    width: PRINTABLE_COMPOSITION.page.widthPt - PRINTABLE_COMPOSITION.frame.insetPt * 2,
    height: PRINTABLE_COMPOSITION.page.heightPt - PRINTABLE_COMPOSITION.frame.insetPt * 2,
  };
  const brandTextWidth = estimateBrandTextWidthPt();
  const brandKnockoutBox = {
    x: roundLayout(outerFrame.x + (outerFrame.width - brandTextWidth) / 2 - PRINTABLE_COMPOSITION.branding.knockoutPaddingXPt),
    y: roundLayout(
      outerFrame.y
        - PRINTABLE_COMPOSITION.branding.fontSizePt * 0.55
        - PRINTABLE_COMPOSITION.branding.knockoutPaddingYPt,
    ),
    width: roundLayout(brandTextWidth + PRINTABLE_COMPOSITION.branding.knockoutPaddingXPt * 2),
    height: roundLayout(
      PRINTABLE_COMPOSITION.branding.fontSizePt + PRINTABLE_COMPOSITION.branding.knockoutPaddingYPt * 2,
    ),
  };
  const safeContentBounds = {
    x: outerFrame.x + PRINTABLE_COMPOSITION.safePaddingPt,
    y: roundLayout(
      Math.max(
        outerFrame.y + PRINTABLE_COMPOSITION.safePaddingPt,
        brandKnockoutBox.y + brandKnockoutBox.height + 0.5,
      ),
    ),
    width: outerFrame.width - PRINTABLE_COMPOSITION.safePaddingPt * 2,
    height: 0,
  };
  safeContentBounds.height = roundLayout(
    outerFrame.y + outerFrame.height - PRINTABLE_COMPOSITION.safePaddingPt - safeContentBounds.y,
  );
  const imageBox = aspectFitBounds(sourceWidth, sourceHeight, safeContentBounds);
  const brandBox = {
    x: roundLayout(outerFrame.x + (outerFrame.width - brandTextWidth) / 2),
    y: roundLayout(outerFrame.y - PRINTABLE_COMPOSITION.branding.fontSizePt * 0.34),
    width: roundLayout(brandTextWidth),
    height: PRINTABLE_COMPOSITION.branding.fontSizePt,
  };
  const pdfLayout: PrintableLayout = {
    unit: "pdf",
    scaleFromPdfPoints: 1,
    pageBounds: { x: 0, y: 0, width: PRINTABLE_COMPOSITION.page.widthPt, height: PRINTABLE_COMPOSITION.page.heightPt },
    outerFrame,
    safeContentBounds,
    artworkBox: safeContentBounds,
    imageBox,
    brandBox,
    brandKnockoutBox,
    brandPlacement: "bottom-frame-label",
    printableBorderCount: 1,
  };

  if (unit === "pdf") return pdfLayout;
  const scale = pointToRasterScale();
  return {
    ...pdfLayout,
    unit: "raster",
    scaleFromPdfPoints: scale,
    pageBounds: scaleBox(pdfLayout.pageBounds, scale),
    outerFrame: scaleBox(pdfLayout.outerFrame, scale),
    safeContentBounds: scaleBox(pdfLayout.safeContentBounds, scale),
    artworkBox: scaleBox(pdfLayout.artworkBox, scale),
    imageBox: scaleBox(pdfLayout.imageBox, scale),
    brandBox: scaleBox(pdfLayout.brandBox, scale),
    brandKnockoutBox: scaleBox(pdfLayout.brandKnockoutBox, scale),
  };
}

export function aspectFitBounds(sourceWidth: number, sourceHeight: number, bounds: CompositionBox): CompositionBox {
  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: roundLayout(bounds.x + (bounds.width - width) / 2),
    y: roundLayout(bounds.y + (bounds.height - height) / 2),
    width: roundLayout(width),
    height: roundLayout(height),
  };
}

export function pointToRasterScale() {
  const widthScale = PRINTABLE_COMPOSITION.page.widthPx / PRINTABLE_COMPOSITION.page.widthPt;
  const heightScale = PRINTABLE_COMPOSITION.page.heightPx / PRINTABLE_COMPOSITION.page.heightPt;
  if (Math.abs(widthScale - heightScale) > 1e-9) throw new Error("Raster and PDF page proportions do not match.");
  return widthScale;
}

export function pdfPointToRasterPixels(value: number) {
  return roundLayout(value * pointToRasterScale());
}

export function canvasTopFromBottomOrigin(box: CompositionBox, pageHeight: number) {
  return roundLayout(pageHeight - box.y - box.height);
}

export function boxesOverlap(left: CompositionBox, right: CompositionBox) {
  return !(
    left.x + left.width <= right.x
    || right.x + right.width <= left.x
    || left.y + left.height <= right.y
    || right.y + right.height <= left.y
  );
}

export function estimateBrandTextWidthPt() {
  return roundLayout(PRINTABLE_COMPOSITION.branding.text.length * PRINTABLE_COMPOSITION.branding.fontSizePt * 0.52);
}

function scaleBox(box: CompositionBox, scale: number): CompositionBox {
  return {
    x: roundLayout(box.x * scale),
    y: roundLayout(box.y * scale),
    width: roundLayout(box.width * scale),
    height: roundLayout(box.height * scale),
  };
}

function roundLayout(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
