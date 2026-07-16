import type { RuntimePrintable } from "./types";

export type PrintableTitleModel = {
  baseTitle: string;
  displayTitle: string;
  metadataTitle: string;
  shortAccessibleTitle: string;
  downloadBaseName: string;
};

/**
 * The runtime generator is the sole owner of duplicate grouping, Design N
 * assignment, mechanical corrections, metadata length handling, and alt text.
 * This server-safe adapter gives every public consumer the same generated model.
 */
export function getPrintableTitleModel(printable: RuntimePrintable): PrintableTitleModel {
  if (!printable.publicTitle || !printable.displayTitle || !printable.metadataTitle || !printable.altText) {
    throw new Error(`Incomplete printable title model: ${printable.assetId}`);
  }
  return {
    baseTitle: printable.publicTitle,
    displayTitle: printable.displayTitle,
    metadataTitle: printable.metadataTitle,
    shortAccessibleTitle: printable.altText,
    downloadBaseName: printable.designNumber == null ? printable.publicTitle : printable.displayTitle,
  };
}

export function buildPrintableDescription(printable: RuntimePrintable) {
  const { displayTitle } = getPrintableTitleModel(printable);
  return `Print ${displayTitle} or download this coloring page as PNG, JPG, or WebP.`;
}
