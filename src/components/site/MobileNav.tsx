"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { HubNavGroup, SiteNavLink } from "@/lib/navigation/siteNav";

import { MoreHubMenu } from "./MoreHubMenu";

type MobileNavProps = {
  ariaLabel?: string;
  groups: HubNavGroup[];
  primaryLinks: SiteNavLink[];
  utilityLinks: SiteNavLink[];
};

export function MobileNav({ ariaLabel = "Mobile browse navigation", groups, primaryLinks, utilityLinks }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div className="site-nav-mobile mobile-nav">
      <button
        className="mobile-nav-toggle"
        type="button"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isOpen}
        aria-controls={panelId}
        ref={buttonRef}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="mobile-nav-toggle-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {isOpen ? (
        <div className="mobile-nav-panel" id={panelId} ref={panelRef}>
          <div className="mobile-nav-panel-header">
            <div className="mobile-nav-panel-title">
              <span className="brand-mark" aria-hidden="true">IL</span>
              <span>I Love Coloring Page</span>
            </div>
            <button className="mobile-nav-close" type="button" aria-label="Close navigation menu" onClick={closeMenu}>
              <span aria-hidden="true">Close</span>
            </button>
          </div>
          <nav aria-label={ariaLabel}>
            <MoreHubMenu groups={groups} leadLinks={primaryLinks} utilityLinks={[]} variant="mobile" onNavigate={closeMenu} />
            <div className="mobile-nav-links" aria-label="Primary mobile links">
              {utilityLinks.length > 0 ? (
                <div className="mobile-nav-link-group">
                  <span className="mobile-nav-link-group-title">Library</span>
                  {utilityLinks.map((link) => (
                    <Link className="mobile-nav-link" href={link.href} key={link.href} onClick={closeMenu} prefetch={false}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
