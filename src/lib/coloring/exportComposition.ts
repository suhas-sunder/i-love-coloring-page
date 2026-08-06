export type CompositionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrintableCompositionUnit = "pdf" | "raster";
export type PaperKind = "letter" | "a4";
export type PageOrientation = "portrait" | "landscape";
export type OrientationPreference = "auto" | PageOrientation;
export type ArtworkScalePercent = 100 | 90 | 75 | 50;

export type PrintablePageProfile = {
  id: `${PaperKind}-${PageOrientation}`;
  paperKind: PaperKind;
  paperSize: "US Letter" | "A4";
  orientation: PageOrientation;
  widthIn: number;
  heightIn: number;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  rasterDpi: 300;
};

export type PrintableProfileRequest = {
  paperKind?: PaperKind;
  orientation?: OrientationPreference;
  artworkScalePercent?: ArtworkScalePercent;
};

export type PrintableLayoutRequest = PrintableProfileRequest & {
  unit?: PrintableCompositionUnit;
};

export type ResolvedPrintableProfile = {
  page: PrintablePageProfile;
  requestedOrientation: OrientationPreference;
  artworkScalePercent: ArtworkScalePercent;
};

export type PrintableLayout = {
  unit: PrintableCompositionUnit;
  page: PrintablePageProfile;
  requestedOrientation: OrientationPreference;
  artworkScalePercent: ArtworkScalePercent;
  scaleFromPdfPoints: number;
  scaleFromPdfPointsX: number;
  scaleFromPdfPointsY: number;
  pageBounds: CompositionBox;
  outerFrame: CompositionBox;
  safeContentBounds: CompositionBox;
  artworkBox: CompositionBox;
  maximumImageBox: CompositionBox;
  imageBox: CompositionBox;
  brandBox: CompositionBox;
  brandKnockoutBox: CompositionBox;
  brandPlacement: "bottom-frame-label";
  printableBorderCount: 1;
};

type PortraitPaperDefinition = {
  paperKind: PaperKind;
  paperSize: PrintablePageProfile["paperSize"];
  widthIn: number;
  heightIn: number;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  rasterDpi: 300;
};

export const PRINTABLE_PAPER_PROFILES = Object.freeze({
  letter: Object.freeze({
    paperKind: "letter",
    paperSize: "US Letter",
    widthIn: 8.5,
    heightIn: 11,
    widthPt: 612,
    heightPt: 792,
    widthPx: 2550,
    heightPx: 3300,
    rasterDpi: 300,
  } satisfies PortraitPaperDefinition),
  a4: Object.freeze({
    paperKind: "a4",
    paperSize: "A4",
    widthIn: 210 / 25.4,
    heightIn: 297 / 25.4,
    widthPt: 595.28,
    heightPt: 841.89,
    widthPx: 2480,
    heightPx: 3508,
    rasterDpi: 300,
  } satisfies PortraitPaperDefinition),
});

export const DEFAULT_PRINTABLE_PROFILE = Object.freeze({
  paperKind: "letter",
  orientation: "portrait",
  artworkScalePercent: 100,
} satisfies Required<PrintableProfileRequest>);

const page = createPageProfile(DEFAULT_PRINTABLE_PROFILE.paperKind, DEFAULT_PRINTABLE_PROFILE.orientation);
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
  paperProfiles: PRINTABLE_PAPER_PROFILES,
  defaultProfile: DEFAULT_PRINTABLE_PROFILE,
  supportedOrientations: Object.freeze(["portrait", "landscape", "auto"] as const),
  supportedArtworkScales: Object.freeze([100, 90, 75, 50] as const),
  background: "#ffffff",
  frame,
  safePaddingPt: 5,
  branding,
  artworkFit: "contain-centered" as const,
  jpegQuality: 0.94,
});

export function computePrintableLayout(
  sourceWidth: number,
  sourceHeight: number,
  unitOrRequest: PrintableCompositionUnit | PrintableLayoutRequest = "pdf",
): PrintableLayout {
  assertArtworkDimensions(sourceWidth, sourceHeight);

  const request = normalizeLayoutRequest(unitOrRequest);
  const resolved = resolvePrintableProfile(sourceWidth, sourceHeight, request);
  const pdfLayout = computePdfLayout(sourceWidth, sourceHeight, resolved);

  if (request.unit === "pdf") return pdfLayout;
  return convertPdfLayoutToRaster(pdfLayout, sourceWidth, sourceHeight);
}

export function resolvePrintableProfile(
  sourceWidth: number,
  sourceHeight: number,
  request: PrintableProfileRequest = DEFAULT_PRINTABLE_PROFILE,
): ResolvedPrintableProfile {
  assertArtworkDimensions(sourceWidth, sourceHeight);

  const normalized = normalizePrintableProfileRequest(request);
  const paperKind = normalized.paperKind;
  const requestedOrientation = normalized.orientation;
  const artworkScalePercent = normalized.artworkScalePercent;

  const orientation = requestedOrientation === "auto"
    ? selectAutomaticOrientation(sourceWidth, sourceHeight, paperKind)
    : requestedOrientation;

  return {
    page: createPageProfile(paperKind, orientation),
    requestedOrientation,
    artworkScalePercent,
  };
}

export function normalizePrintableProfileRequest(
  request: PrintableProfileRequest = DEFAULT_PRINTABLE_PROFILE,
): Required<PrintableProfileRequest> {
  const paperKind = request.paperKind ?? DEFAULT_PRINTABLE_PROFILE.paperKind;
  const orientation = request.orientation ?? DEFAULT_PRINTABLE_PROFILE.orientation;
  const artworkScalePercent = request.artworkScalePercent ?? DEFAULT_PRINTABLE_PROFILE.artworkScalePercent;
  assertProfileRequest(paperKind, orientation, artworkScalePercent);
  return { paperKind, orientation, artworkScalePercent };
}

export function formatPrintablePaperDimensions(paperKind: PaperKind) {
  const definition = PRINTABLE_PAPER_PROFILES[paperKind];
  if (paperKind === "a4") {
    return `${Math.round(definition.widthIn * 25.4)} × ${Math.round(definition.heightIn * 25.4)} mm`;
  }
  return `${definition.widthIn} × ${definition.heightIn} in`;
}

export function formatPrintablePageDimensions(profile: PrintablePageProfile) {
  if (profile.paperKind === "a4") {
    return `${Math.round(profile.widthIn * 25.4)} × ${Math.round(profile.heightIn * 25.4)} mm`;
  }
  return `${profile.widthIn} × ${profile.heightIn} in`;
}

export function selectAutomaticOrientation(
  sourceWidth: number,
  sourceHeight: number,
  paperKind: PaperKind = DEFAULT_PRINTABLE_PROFILE.paperKind,
): PageOrientation {
  assertArtworkDimensions(sourceWidth, sourceHeight);
  if (!(paperKind in PRINTABLE_PAPER_PROFILES)) throw new Error(`Unsupported printable paper kind: ${paperKind}`);

  const portrait = computePdfLayout(sourceWidth, sourceHeight, {
    page: createPageProfile(paperKind, "portrait"),
    requestedOrientation: "auto",
    artworkScalePercent: 100,
  });
  const landscape = computePdfLayout(sourceWidth, sourceHeight, {
    page: createPageProfile(paperKind, "landscape"),
    requestedOrientation: "auto",
    artworkScalePercent: 100,
  });
  const portraitArea = portrait.maximumImageBox.width * portrait.maximumImageBox.height;
  const landscapeArea = landscape.maximumImageBox.width * landscape.maximumImageBox.height;

  return landscapeArea > portraitArea + 0.0001 ? "landscape" : "portrait";
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

export function pointToRasterScales(profile: PrintablePageProfile = page) {
  return Object.freeze({
    x: profile.widthPx / profile.widthPt,
    y: profile.heightPx / profile.heightPt,
  });
}

export function pointToRasterScale(profile: PrintablePageProfile = page) {
  const scales = pointToRasterScales(profile);
  if (Math.abs(scales.x - scales.y) > 1e-9) {
    throw new Error("This paper profile requires axis-specific point-to-raster scaling.");
  }
  return scales.x;
}

export function pdfPointToRasterPixels(
  value: number,
  axis: "x" | "y" = "x",
  profile: PrintablePageProfile = page,
) {
  return roundLayout(value * pointToRasterScales(profile)[axis]);
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

function createPageProfile(paperKind: PaperKind, orientation: PageOrientation): PrintablePageProfile {
  const definition = PRINTABLE_PAPER_PROFILES[paperKind];
  const landscape = orientation === "landscape";
  return Object.freeze({
    id: `${paperKind}-${orientation}`,
    paperKind,
    paperSize: definition.paperSize,
    orientation,
    widthIn: landscape ? definition.heightIn : definition.widthIn,
    heightIn: landscape ? definition.widthIn : definition.heightIn,
    widthPt: landscape ? definition.heightPt : definition.widthPt,
    heightPt: landscape ? definition.widthPt : definition.heightPt,
    widthPx: landscape ? definition.heightPx : definition.widthPx,
    heightPx: landscape ? definition.widthPx : definition.heightPx,
    rasterDpi: definition.rasterDpi,
  });
}

function computePdfLayout(
  sourceWidth: number,
  sourceHeight: number,
  profile: ResolvedPrintableProfile,
): PrintableLayout {
  const { page: resolvedPage, artworkScalePercent, requestedOrientation } = profile;
  const outerFrame = {
    x: PRINTABLE_COMPOSITION.frame.insetPt,
    y: PRINTABLE_COMPOSITION.frame.insetPt,
    width: resolvedPage.widthPt - PRINTABLE_COMPOSITION.frame.insetPt * 2,
    height: resolvedPage.heightPt - PRINTABLE_COMPOSITION.frame.insetPt * 2,
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
  const maximumImageBox = aspectFitBounds(sourceWidth, sourceHeight, safeContentBounds);
  const imageBox = scaleCenteredBox(maximumImageBox, artworkScalePercent / 100);
  const brandBox = {
    x: roundLayout(outerFrame.x + (outerFrame.width - brandTextWidth) / 2),
    y: roundLayout(outerFrame.y - PRINTABLE_COMPOSITION.branding.fontSizePt * 0.34),
    width: roundLayout(brandTextWidth),
    height: PRINTABLE_COMPOSITION.branding.fontSizePt,
  };

  return {
    unit: "pdf",
    page: resolvedPage,
    requestedOrientation,
    artworkScalePercent,
    scaleFromPdfPoints: 1,
    scaleFromPdfPointsX: 1,
    scaleFromPdfPointsY: 1,
    pageBounds: { x: 0, y: 0, width: resolvedPage.widthPt, height: resolvedPage.heightPt },
    outerFrame,
    safeContentBounds,
    artworkBox: safeContentBounds,
    maximumImageBox,
    imageBox,
    brandBox,
    brandKnockoutBox,
    brandPlacement: "bottom-frame-label",
    printableBorderCount: 1,
  };
}

function convertPdfLayoutToRaster(
  pdfLayout: PrintableLayout,
  sourceWidth: number,
  sourceHeight: number,
): PrintableLayout {
  const scales = pointToRasterScales(pdfLayout.page);
  const safeContentBounds = scaleBox(pdfLayout.safeContentBounds, scales.x, scales.y);
  const maximumImageBox = aspectFitBounds(sourceWidth, sourceHeight, safeContentBounds);
  const imageBox = scaleCenteredBox(maximumImageBox, pdfLayout.artworkScalePercent / 100);

  return {
    ...pdfLayout,
    unit: "raster",
    scaleFromPdfPoints: scales.x,
    scaleFromPdfPointsX: scales.x,
    scaleFromPdfPointsY: scales.y,
    pageBounds: { x: 0, y: 0, width: pdfLayout.page.widthPx, height: pdfLayout.page.heightPx },
    outerFrame: scaleBox(pdfLayout.outerFrame, scales.x, scales.y),
    safeContentBounds,
    artworkBox: safeContentBounds,
    maximumImageBox,
    imageBox,
    brandBox: scaleBox(pdfLayout.brandBox, scales.x, scales.y),
    brandKnockoutBox: scaleBox(pdfLayout.brandKnockoutBox, scales.x, scales.y),
  };
}

function normalizeLayoutRequest(
  unitOrRequest: PrintableCompositionUnit | PrintableLayoutRequest,
): Required<PrintableLayoutRequest> {
  if (typeof unitOrRequest === "string") {
    return { ...DEFAULT_PRINTABLE_PROFILE, unit: unitOrRequest };
  }
  const profile = normalizePrintableProfileRequest(unitOrRequest);
  return {
    ...profile,
    unit: unitOrRequest.unit ?? "pdf",
  };
}

function assertArtworkDimensions(sourceWidth: number, sourceHeight: number) {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Printable artwork dimensions must be positive finite numbers.");
  }
}

function assertProfileRequest(
  paperKind: PaperKind,
  orientation: OrientationPreference,
  artworkScalePercent: ArtworkScalePercent,
) {
  if (!(paperKind in PRINTABLE_PAPER_PROFILES)) throw new Error(`Unsupported printable paper kind: ${paperKind}`);
  if (!["portrait", "landscape", "auto"].includes(orientation)) {
    throw new Error(`Unsupported printable orientation: ${orientation}`);
  }
  if (![100, 90, 75, 50].includes(artworkScalePercent)) {
    throw new Error(`Unsupported printable artwork scale: ${artworkScalePercent}`);
  }
}

function scaleCenteredBox(box: CompositionBox, scale: number): CompositionBox {
  const width = box.width * scale;
  const height = box.height * scale;
  return {
    x: roundLayout(box.x + (box.width - width) / 2),
    y: roundLayout(box.y + (box.height - height) / 2),
    width: roundLayout(width),
    height: roundLayout(height),
  };
}

function scaleBox(box: CompositionBox, scaleX: number, scaleY: number): CompositionBox {
  return {
    x: roundLayout(box.x * scaleX),
    y: roundLayout(box.y * scaleY),
    width: roundLayout(box.width * scaleX),
    height: roundLayout(box.height * scaleY),
  };
}

function roundLayout(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
