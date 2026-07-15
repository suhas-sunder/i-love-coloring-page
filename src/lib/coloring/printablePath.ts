type FrozenPrintablePath = {
  assetId?: string;
  canonicalPath: string;
};

const PRINTABLE_PATH_PATTERN = /^\/printables\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}$/;

export function getPrintablePath(printable: FrozenPrintablePath) {
  if (!PRINTABLE_PATH_PATTERN.test(printable.canonicalPath)) {
    const recordLabel = printable.assetId ? ` for ${printable.assetId}` : "";
    throw new Error(`Invalid frozen printable canonical path${recordLabel}`);
  }

  return printable.canonicalPath;
}
