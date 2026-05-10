export type AssetSubpaths = {
  svg: string | null;
  pngPreview: string | null;
  thumbnail: string | null;
};

export type ColoringItem = {
  assetId: string;
  title: string;
  altText: string;
  categorySlug: string;
  filenameSlug: string;
  assetSubpaths: AssetSubpaths;
  dimensions: {
    source: { width: number; height: number } | null;
    svg: { width: number; height: number; viewBox?: string } | null;
    pngPreview: { width: number; height: number } | null;
    thumbnail: { width: number; height: number } | null;
  };
  downloadAvailable: boolean;
  printAvailable: boolean;
  indexablePerImageRoute: false;
  warningFlags: string[];
  warningMetadataPolicy: "internal_metadata_only";
};

export type PublicColoringItem = Pick<ColoringItem, "assetId" | "title" | "altText" | "assetSubpaths">;

export type GallerySearchEntry = {
  assetId: string;
  title: string;
  categorySlug: string;
  filenameSlug: string;
  hubIds: string[];
  tags: string[];
  searchText: string;
};

export type GalleryFilterTag = {
  id: string;
  label: string;
  group: string;
  assetCount: number;
};

export type HubGalleryUx = {
  hubId: string;
  slug: string;
  title: string;
  assetCount: number;
  tags: GalleryFilterTag[];
  tabs: Array<Pick<GalleryFilterTag, "id" | "label" | "assetCount">>;
};

export type HubSectionItem = {
  label: string;
  term: string;
  assetCount: number;
};

export type HubSection = {
  groupingId: string;
  label: string;
  items: HubSectionItem[];
};

export type ColoringHub = {
  hubId: string;
  slug: string;
  normalizedSlug: string;
  route: string;
  title: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  assetCount: number;
  assetIds: string[];
  featuredAssetIds: string[];
  previewAssetIds: string[];
  galleryPageSize: number;
  sectionGroupings: HubSection[];
  relatedHubIds: string[];
  parentHubId: string | null;
  childHubIds: string[];
  breadcrumbPath: Array<{ label: string; route: string }>;
  internalLinkingTargets: string[];
  indexable: boolean;
  sitemap: boolean;
  noPerImageIndexableRoute: true;
};

export type ColoringRoute = {
  hubId: string;
  slug: string;
  path: string;
  title: string;
  indexable: boolean;
  sitemap: boolean;
  assetCount: number;
};

export type SiteMapEntry = {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
};

export type PagedGallery = {
  items: PublicColoringItem[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};
