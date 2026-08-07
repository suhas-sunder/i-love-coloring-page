"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { restoreFocusAfterModalClose, useModalDialog } from "@/hooks/useModalDialog";
import {
  mobileDirectLinks,
  mobileNavigationGroups,
} from "@/lib/navigation/siteNav";

import { DisclosureChevron } from "./DisclosureChevron";
import { useSiteInteractions } from "./SiteInteractionProvider";

export function MobileNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const surfaceId = useId();
  const surface = useMemo(() => ({ kind: "mobile-navigation" as const, id: surfaceId }), [surfaceId]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const { closeModal, isModalOpen, openModal } = useSiteInteractions();
  const isOpen = isModalOpen(surface);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isOpen) closeModal(surface);
    // Route navigation is intentionally the only dependency that closes without restoring focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const desktopNavigation = window.matchMedia("(min-width: 900px)");
    const closeForDesktopLayout = () => {
      if (!desktopNavigation.matches || !isOpen) return;
      closeModal(surface);
      restoreFocusAfterModalClose(document.querySelector<HTMLElement>(".brand"));
    };

    closeForDesktopLayout();
    desktopNavigation.addEventListener("change", closeForDesktopLayout);
    return () => desktopNavigation.removeEventListener("change", closeForDesktopLayout);
  }, [closeModal, isOpen, surface]);

  const closeAndRestore = useCallback(() => {
    closeModal(surface);
    restoreFocusAfterModalClose(buttonRef.current);
  }, [closeModal, surface]);

  useModalDialog({ open: isOpen, panelRef, initialFocusRef: closeButtonRef, onEscape: closeAndRestore });

  function navigateAndClose() {
    closeModal(surface);
  }

  return (
    <div className="site-nav-mobile mobile-nav">
      <button
        ref={buttonRef}
        className="mobile-header-button mobile-nav-toggle"
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => isOpen ? closeAndRestore() : openModal(surface)}
      >
        <span className="mobile-nav-toggle-lines" aria-hidden="true"><span /><span /><span /></span>
      </button>

      {mounted && isOpen ? createPortal(
        <div className="mobile-nav-overlay" role="presentation">
          <section ref={panelRef} className="mobile-nav-panel" id={panelId} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
            <div className="mobile-nav-panel-header">
              <div className="mobile-nav-panel-title" id={`${panelId}-title`}>
                <span className="brand-mark" aria-hidden="true">IL</span>
                <span>Browse coloring pages</span>
              </div>
              <button ref={closeButtonRef} className="mobile-nav-close" type="button" onClick={closeAndRestore}>Close</button>
            </div>

            <nav className="mobile-nav-content" aria-label="Mobile navigation">
              <div className="mobile-nav-direct-links">
                {mobileDirectLinks.map((link) => (
                  <Link href={link.href} key={link.id} aria-current={pathname === link.href ? "page" : undefined} onClick={navigateAndClose} prefetch={false}>
                    {link.label}
                  </Link>
                ))}
              </div>

              {mobileNavigationGroups.map((group) => {
                const isCurrentGroup = group.links.some((link) => pathname === link.href);
                return (
                  <details className="mobile-nav-group" key={group.id} data-active={isCurrentGroup ? "true" : undefined}>
                    <summary>
                      <span className="mobile-nav-group-label">{group.label}</span>
                      <DisclosureChevron />
                    </summary>
                    <ul>
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={navigateAndClose} prefetch={false}>
                            <span>{link.label}</span>
                            {typeof link.assetCount === "number" ? <strong>{link.assetCount.toLocaleString()}</strong> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}

            </nav>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
