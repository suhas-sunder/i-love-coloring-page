import Link from "next/link";

import type { ColoringHub } from "@/lib/coloring/types";

type RelatedHubsProps = {
  title: string;
  hubs: ColoringHub[];
};

export function RelatedHubs({ title, hubs }: RelatedHubsProps) {
  if (hubs.length === 0) return null;

  return (
    <section className="content-section">
      <div className="section-heading-row">
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="related-list">
        {hubs.map((hub) => (
          <Link className="related-link" href={hub.route} key={hub.hubId}>
            <span>{hub.title.replace(/ Coloring Pages$/, "")}</span>
            <strong>{hub.assetCount.toLocaleString()} pages</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
