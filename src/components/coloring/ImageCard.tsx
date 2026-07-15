import Link from "next/link";

import type { PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";
import { PrintableCardActions } from "./PrintableCardActions";

type ImageCardProps = {
  item: PublicColoringItem;
  assetUrls: {
    preview: string | null;
    fallbackPreview?: string | null;
    thumbnail?: string | null;
    png: string | null;
    internalSvg?: string | null;
  };
  itemHref: string;
  priority?: boolean;
  showPrintAction?: boolean;
};

export function ImageCard({ item, assetUrls, itemHref, priority = false, showPrintAction = true }: ImageCardProps) {
  return (
    <article className="gallery-item">
      <Link className="gallery-item-media-link" href={itemHref} aria-label={`View ${item.title} printable page`} prefetch={false}>
        <span className="gallery-item-media">
          <AssetImage
            item={item}
            imageUrl={assetUrls.preview}
            fallbackImageUrl={assetUrls.fallbackPreview}
            priority={priority}
            interactive
          />
        </span>
      </Link>
      <div className="gallery-item-body">
        <h3 className="item-title">
          <Link className="item-title-link" href={itemHref} prefetch={false}>{item.title}</Link>
        </h3>
        {showPrintAction ? <PrintableCardActions item={item} assetUrls={assetUrls} /> : null}
      </div>
    </article>
  );
}
