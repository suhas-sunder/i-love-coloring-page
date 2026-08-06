import type { ReactNode } from "react";

import type { ColoringHub } from "@/lib/coloring/types";

import { HubCard } from "./HubCard";

type RelatedHubsProps = {
  title: string;
  hubs: ColoringHub[];
  id?: string;
  interstitial?: ReactNode;
};

export function RelatedHubs({ title, hubs, id = "related-collections", interstitial }: RelatedHubsProps) {
  if (hubs.length === 0) return null;
  const splitIndex = interstitial ? Math.ceil(hubs.length / 2) : hubs.length;
  const firstGroup = hubs.slice(0, splitIndex);
  const secondGroup = hubs.slice(splitIndex);

  return (
    <section className="content-section" id={id}>
      <div className="section-heading-row">
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="hub-link-grid hub-link-grid-compact">
        {firstGroup.map((hub) => (
          <HubCard hub={hub} compact key={hub.hubId} />
        ))}
      </div>
      {interstitial}
      {secondGroup.length > 0 ? (
        <div className="hub-link-grid hub-link-grid-compact">
          {secondGroup.map((hub) => (
            <HubCard hub={hub} compact key={hub.hubId} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
