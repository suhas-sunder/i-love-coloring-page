import type { ColoringHub } from "@/lib/coloring/types";

import { HubCard } from "./HubCard";

type RelatedHubsProps = {
  title: string;
  hubs: ColoringHub[];
};

export function RelatedHubs({ title, hubs }: RelatedHubsProps) {
  if (hubs.length === 0) return null;

  return (
    <section className="content-section">
      <div className="section-heading-row">
        <h2 className="sky-heading">{title}</h2>
      </div>
      <div className="hub-card-grid compact-grid">
        {hubs.map((hub) => (
          <HubCard key={hub.hubId} hub={hub} compact />
        ))}
      </div>
    </section>
  );
}
