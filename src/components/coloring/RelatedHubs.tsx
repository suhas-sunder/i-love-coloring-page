import type { ColoringHub } from "@/lib/coloring/types";

import { HubCard } from "./HubCard";

type RelatedHubsProps = {
  title: string;
  hubs: ColoringHub[];
  id?: string;
};

export function RelatedHubs({ title, hubs, id = "related-collections" }: RelatedHubsProps) {
  if (hubs.length === 0) return null;

  return (
    <section className="content-section" id={id}>
      <div className="section-heading-row">
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="hub-link-grid hub-link-grid-compact">
        {hubs.map((hub) => (
          <HubCard hub={hub} compact key={hub.hubId} />
        ))}
      </div>
    </section>
  );
}
