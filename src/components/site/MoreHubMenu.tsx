"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { HubNavGroup, SiteNavLink } from "@/lib/navigation/siteNav";

type MoreHubMenuProps = {
  groups: HubNavGroup[];
  utilityLinks: SiteNavLink[];
  variant?: "desktop" | "mobile";
};

export function MoreHubMenu({ groups, utilityLinks, variant = "desktop" }: MoreHubMenuProps) {
  const [query, setQuery] = useState("");
  const searchLabel = variant === "mobile" ? "Search mobile hub pages" : "Search hub pages";
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groups;

    return groups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => link.searchText.includes(normalizedQuery)),
      }))
      .filter((group) => group.links.length > 0);
  }, [groups, query]);

  const menuBody = (
    <div className={variant === "mobile" ? "hub-menu-panel hub-menu-panel-mobile" : "hub-menu-panel"}>
      <div className="hub-menu-search-row">
        <label htmlFor={`hub-menu-search-${variant}`}>{searchLabel}</label>
        <input
          id={`hub-menu-search-${variant}`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Find animals, mandalas, cars..."
          autoComplete="off"
        />
      </div>
      <div className="hub-menu-utility" aria-label="Gallery navigation">
        {utilityLinks.map((link) => (
          <Link href={link.href} key={link.href} prefetch={false}>
            {link.label}
          </Link>
        ))}
      </div>
      {filteredGroups.length > 0 ? (
        <div className="hub-menu-grid">
          {filteredGroups.map((group) => (
            <section className="hub-menu-group" key={group.label} aria-labelledby={`hub-menu-${variant}-${slugify(group.label)}`}>
              <h2 id={`hub-menu-${variant}-${slugify(group.label)}`}>{group.label}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} prefetch={false}>
                      <span>{link.label}</span>
                      <strong>{link.assetCount.toLocaleString()}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="hub-menu-empty" aria-live="polite">No matching collections.</p>
      )}
    </div>
  );

  if (variant === "mobile") {
    return <div className="mobile-hub-menu">{menuBody}</div>;
  }

  return (
    <details className="more-hub-menu">
      <summary className="site-nav-link more-hub-summary">More</summary>
      {menuBody}
    </details>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
