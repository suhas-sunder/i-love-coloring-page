import Link from "next/link";

import type { ColoringHub } from "@/lib/coloring/types";

type HubCardProps = {
  hub: ColoringHub;
  compact?: boolean;
};

export function HubCard({ hub, compact = false }: HubCardProps) {
  return (
    <Link className={compact ? "hub-card hub-card-compact" : "hub-card"} href={hub.route}>
      <span>{hub.title.replace(/ Coloring Pages$/, "")}</span>
      <strong>{hub.assetCount.toLocaleString()} pages</strong>
    </Link>
  );
}
