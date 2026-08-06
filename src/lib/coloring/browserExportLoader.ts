type PrintableExportRuntime = typeof import("./browserDownloads");
type ArtworkDownloadRuntime = typeof import("./browserArtworkDownloads");

export function createCachedModuleLoader<T>(importModule: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    pending = importModule().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export const loadPrintableExportRuntime = createCachedModuleLoader<PrintableExportRuntime>(
  () => import("./browserDownloads"),
);

export const loadArtworkDownloadRuntime = createCachedModuleLoader<ArtworkDownloadRuntime>(
  () => import("./browserArtworkDownloads"),
);
