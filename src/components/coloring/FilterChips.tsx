import type { HubSection } from "@/lib/coloring/types";

type FilterChipsProps = {
  sections: HubSection[];
};

export function FilterChips({ sections }: FilterChipsProps) {
  const seenTerms = new Set<string>();
  const chips = sections.flatMap((section) =>
    section.items.slice(0, 5).flatMap((item) => {
      if (seenTerms.has(item.term)) return [];
      seenTerms.add(item.term);
      return [{
        id: `${section.groupingId}-${item.term}`,
        label: item.label,
        count: item.assetCount,
      }];
    }),
  );

  if (chips.length === 0) return null;

  return (
    <div className="filter-chips" aria-label="Gallery sections">
      {chips.slice(0, 10).map((chip) => (
        <a key={chip.id} className="filter-chip" href={`#gallery`}>
          {chip.label}
          <span>{chip.count.toLocaleString()}</span>
        </a>
      ))}
    </div>
  );
}
