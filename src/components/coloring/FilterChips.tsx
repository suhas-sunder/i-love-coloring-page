import type { HubSection } from "@/lib/coloring/types";

type FilterChipsProps = {
  sections: HubSection[];
};

export function FilterChips({ sections }: FilterChipsProps) {
  const chips = sections.flatMap((section) =>
    section.items.slice(0, 5).map((item) => ({
      id: `${section.groupingId}-${item.term}`,
      label: item.label,
      count: item.assetCount,
    })),
  );

  if (chips.length === 0) return null;

  return (
    <div className="filter-chips" aria-label="Gallery filters and sections">
      {chips.slice(0, 16).map((chip) => (
        <a key={chip.id} className="filter-chip" href={`#gallery`}>
          {chip.label}
          <span>{chip.count.toLocaleString()}</span>
        </a>
      ))}
    </div>
  );
}
