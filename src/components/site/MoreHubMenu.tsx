"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { HubNavGroup, SiteNavLink } from "@/lib/navigation/siteNav";

type MoreHubMenuProps = {
  groups: HubNavGroup[];
  leadLinks?: SiteNavLink[];
  utilityLinks: SiteNavLink[];
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
};

export function MoreHubMenu({ groups, leadLinks = [], utilityLinks, variant = "desktop", onNavigate }: MoreHubMenuProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = variant === "desktop";
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

  useEffect(() => {
    if (!isDesktop || !isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (!isDesktop || !isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isDesktop, isOpen]);

  function handleNavigate() {
    setIsOpen(false);
    onNavigate?.();
  }

  const menuBody = (
    <div
      className={variant === "mobile" ? "hub-menu-panel hub-menu-panel-mobile" : "hub-menu-panel hub-menu-panel-desktop"}
      id={isDesktop ? menuId : undefined}
      ref={isDesktop ? panelRef : undefined}
    >
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
      {leadLinks.length > 0 ? (
        <div className="hub-menu-lead-links" aria-label="Primary mobile links">
          {leadLinks.map((link) => (
            <Link href={link.href} key={link.href} onClick={handleNavigate} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="hub-menu-utility" aria-label="Gallery navigation">
        {utilityLinks.map((link) => (
          <Link href={link.href} key={link.href} onClick={handleNavigate} prefetch={false}>
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
                    <Link href={link.href} onClick={handleNavigate} prefetch={false}>
                      <span className="hub-menu-link-label">{link.label}</span>
                      <strong className="hub-menu-link-count">{link.assetCount.toLocaleString()}</strong>
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
    <div className="more-hub-menu">
      <button
        className="site-nav-link more-hub-button"
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        ref={buttonRef}
        onClick={() => setIsOpen((current) => !current)}
      >
        More
      </button>
      {isOpen ? menuBody : null}
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
