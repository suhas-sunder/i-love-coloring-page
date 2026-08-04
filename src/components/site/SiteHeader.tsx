"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";

import {
  categoryNavigationGroups,
  desktopPrimaryItems,
  getActivePrimaryNavigationId,
  isExactNavigationPath,
  seasonalNavigationLinks,
} from "@/lib/navigation/siteNav";
import { restoreFocusAfterModalClose } from "@/hooks/useModalDialog";

import { DisclosureChevron } from "./DisclosureChevron";
import { MobileNav } from "./MobileNav";
import { useSiteInteractions } from "./SiteInteractionProvider";

const GlobalSearchDialog = lazy(() => import("./GlobalSearchDialog").then((module) => ({ default: module.GlobalSearchDialog })));

type OpenDisclosure = "categories" | "seasonal" | null;

export function SiteHeader() {
  const pathname = usePathname();
  const [openDisclosure, setOpenDisclosure] = useState<OpenDisclosure>(null);
  const headerNavRef = useRef<HTMLElement>(null);
  const categoriesButtonRef = useRef<HTMLButtonElement>(null);
  const seasonalButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const mobileSearchButtonRef = useRef<HTMLButtonElement>(null);
  const searchOpenerRef = useRef<"desktop" | "mobile">("desktop");
  const categoriesPanelId = useId();
  const seasonalPanelId = useId();
  const searchId = useId();
  const searchSurface = { kind: "global-search" as const, id: searchId };
  const { activeModal, closeModal, isModalOpen, openModal } = useSiteInteractions();
  const searchOpen = isModalOpen(searchSurface);
  const activeId = getActivePrimaryNavigationId(pathname);

  useEffect(() => setOpenDisclosure(null), [pathname]);
  useEffect(() => {
    if (activeModal) setOpenDisclosure(null);
  }, [activeModal]);

  useEffect(() => {
    if (!openDisclosure) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !headerNavRef.current?.contains(target)) setOpenDisclosure(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = openDisclosure === "categories" ? categoriesButtonRef.current : seasonalButtonRef.current;
      setOpenDisclosure(null);
      window.requestAnimationFrame(() => trigger?.focus());
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDisclosure]);

  function openSearch(trigger: "desktop" | "mobile") {
    searchOpenerRef.current = trigger;
    setOpenDisclosure(null);
    openModal(searchSurface);
    if (trigger === "desktop") searchButtonRef.current?.blur();
    else mobileSearchButtonRef.current?.blur();
  }

  function closeSearch(restoreFocus: boolean) {
    closeModal(searchSurface);
    if (restoreFocus) {
      const trigger = searchOpenerRef.current === "mobile" ? mobileSearchButtonRef.current : searchButtonRef.current;
      restoreFocusAfterModalClose(trigger);
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" prefetch={false}>
          <span className="brand-mark" aria-hidden="true">IL</span>
          <span className="brand-name">I Love Coloring Page</span>
        </Link>

        <nav ref={headerNavRef} className="site-nav site-nav-desktop" aria-label="Main navigation">
          {desktopPrimaryItems.map((item) => {
            if (item.kind === "link") {
              return (
                <Link
                  className="site-nav-link"
                  href={item.href}
                  key={item.id}
                  data-active={activeId === item.id ? "true" : undefined}
                  aria-current={isExactNavigationPath(pathname, item.href) ? "page" : undefined}
                  prefetch={false}
                >
                  {item.label}
                </Link>
              );
            }
            if (item.kind === "search") {
              return (
                <button
                  ref={searchButtonRef}
                  className="site-nav-link site-search-button"
                  type="button"
                  key={item.id}
                  aria-haspopup="dialog"
                  onClick={() => openSearch("desktop")}
                >
                  <SearchIcon />
                  {item.label}
                </button>
              );
            }

            const isCategories = item.id === "categories";
            const isOpen = openDisclosure === item.id;
            const panelId = isCategories ? categoriesPanelId : seasonalPanelId;
            return (
              <div className={`header-disclosure header-disclosure-${item.id}`} key={item.id}>
                <button
                  ref={isCategories ? categoriesButtonRef : seasonalButtonRef}
                  className="site-nav-link header-disclosure-trigger"
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-active={activeId === item.id ? "true" : undefined}
                  onClick={() => setOpenDisclosure((current) => current === item.id ? null : item.id)}
                >
                  {item.label}
                  <DisclosureChevron />
                </button>
                {isOpen ? (
                  isCategories
                    ? <CategoryDisclosure id={panelId} pathname={pathname} onNavigate={() => setOpenDisclosure(null)} />
                    : <SeasonalDisclosure id={panelId} pathname={pathname} onNavigate={() => setOpenDisclosure(null)} />
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mobile-header-actions">
          <button
            ref={mobileSearchButtonRef}
            className="mobile-header-button mobile-search-button"
            type="button"
            aria-label="Search coloring pages"
            aria-haspopup="dialog"
            onClick={() => openSearch("mobile")}
          >
            <SearchIcon />
          </button>
          <MobileNav />
        </div>
      </div>

      {searchOpen ? (
        <Suspense fallback={null}>
          <GlobalSearchDialog open onRequestClose={() => closeSearch(true)} onNavigate={() => closeSearch(false)} />
        </Suspense>
      ) : null}
    </header>
  );
}

function CategoryDisclosure({ id, pathname, onNavigate }: { id: string; pathname: string; onNavigate: () => void }) {
  return (
    <div className="header-disclosure-panel category-browser" id={id}>
      <div className="category-browser-grid">
        {categoryNavigationGroups.map((group) => (
          <section className="category-browser-group" key={group.id} aria-labelledby={`${id}-${group.id}`}>
            <h2 id={`${id}-${group.id}`}>{group.label}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} aria-current={isExactNavigationPath(pathname, link.href) ? "page" : undefined} onClick={onNavigate} prefetch={false}>
                    <span>{link.label}</span>
                    {typeof link.assetCount === "number" ? <strong>{link.assetCount.toLocaleString()}</strong> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function SeasonalDisclosure({ id, pathname, onNavigate }: { id: string; pathname: string; onNavigate: () => void }) {
  return (
    <div className="header-disclosure-panel seasonal-browser" id={id}>
      <span className="seasonal-browser-title">Seasonal collections</span>
      <ul>
        {seasonalNavigationLinks.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={isExactNavigationPath(pathname, link.href) ? "page" : undefined} onClick={onNavigate} prefetch={false}>
              <span>{link.label}</span>
              <strong>{link.assetCount?.toLocaleString()}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
