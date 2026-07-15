"use client";

import { useEffect, useRef, useState } from "react";

import type { PublicColoringItem } from "@/lib/coloring/types";

type AssetImageProps = {
  item: PublicColoringItem;
  imageUrl: string | null;
  fallbackImageUrl?: string | null;
  priority?: boolean;
  interactive?: boolean;
  width?: number | null;
  height?: number | null;
};

export function AssetImage({ item, imageUrl, fallbackImageUrl = null, priority = false, interactive = false, width, height }: AssetImageProps) {
  const [activeImageUrl, setActiveImageUrl] = useState(imageUrl);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setActiveImageUrl(imageUrl);
    setFailed(false);
    setLoaded(false);
  }, [imageUrl, fallbackImageUrl]);

  useEffect(() => {
    if (!activeImageUrl) return;
    const image = imageRef.current;
    if (!image?.complete) return;

    if (image.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setFailed(true);
    }
  }, [activeImageUrl]);

  if (!activeImageUrl || failed) return <AssetPlaceholder title={item.title} />;

  function handleImageLoad() {
    setFailed(false);
    setLoaded(true);
  }

  function handleImageError() {
    if (fallbackImageUrl && activeImageUrl !== fallbackImageUrl) {
      setActiveImageUrl(fallbackImageUrl);
      setLoaded(false);
      setFailed(false);
      return;
    }

    setLoaded(false);
    setFailed(true);
  }

  return (
    <span
      className="asset-image-frame"
      role="img"
      aria-label={item.altText}
      data-interactive={interactive ? "true" : "false"}
      data-state={loaded ? "loaded" : "loading"}
    >
      {!loaded ? (
        <span className="asset-image-fallback" aria-hidden="true">
          <span>Loading preview</span>
        </span>
      ) : null}
      <img
        ref={imageRef}
        alt=""
        className="asset-image"
        data-priority={priority ? "true" : "false"}
        data-state={loaded ? "loaded" : "loading"}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        width={width || undefined}
        height={height || undefined}
        onError={handleImageError}
        onLoad={handleImageLoad}
        src={activeImageUrl}
      />
    </span>
  );
}

function AssetPlaceholder({ title }: { title: string }) {
  return (
    <div className="asset-placeholder" role="img" aria-label={`${title} preview unavailable`}>
      <span>Preview unavailable</span>
    </div>
  );
}
