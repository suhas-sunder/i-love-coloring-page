import Link from "next/link";

import type { ColoringHub } from "@/lib/coloring/types";

type HubCardProps = {
  hub: ColoringHub;
  compact?: boolean;
};

export function HubCard({ hub, compact = false }: HubCardProps) {
  return (
    <Link className={compact ? "hub-link hub-link-compact" : "hub-link"} href={hub.route} prefetch={false}>
      <span className="hub-link-title">{hub.title.replace(/ Coloring Pages$/, "")}</span>
      <strong className="hub-link-count">{hub.assetCount.toLocaleString()} pages</strong>
    </Link>
  );
}
