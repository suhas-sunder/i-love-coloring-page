"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSiteInteractions } from "@/components/site/SiteInteractionProvider";
import { restoreFocusAfterModalClose, useModalDialog } from "@/hooks/useModalDialog";
import type { GalleryFilterTag } from "@/lib/coloring/types";

type GalleryFiltersProps = {
  tags: GalleryFilterTag[];
  activeFilterIds: string[];
  onActiveFilterIdsChange: (ids: string[]) => void;
};

const GROUP_LABELS: Record<string, string> = {
  difficulty: "Difficulty",
  style: "Style",
  subject: "Subject",
  theme: "Theme",
};

export function GalleryFilters({ tags, activeFilterIds, onActiveFilterIdsChange }: GalleryFiltersProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [draftIds, setDraftIds] = useState(activeFilterIds);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const desktopRootRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const surfaceId = useId();
  const surface = useMemo(() => ({ kind: "mobile-filters" as const, id: surfaceId }), [surfaceId]);
  const { activeModal, closeModal, isModalOpen, openModal } = useSiteInteractions();
  const mobileOpen = isModalOpen(surface);
  const groupedTags = useMemo(() => groupTags(tags), [tags]);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) setDesktopOpen(false);
    else if (mobileOpen) closeModal(surface);
  }, [closeModal, isMobile, mobileOpen, surface]);

  useEffect(() => {
    if (activeModal) setDesktopOpen(false);
  }, [activeModal]);

  useEffect(() => {
    if (!desktopOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !desktopRootRef.current?.contains(event.target)) setDesktopOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDesktopOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopOpen]);

  const closeMobileAndRestore = useCallback(() => {
    closeModal(surface);
    setDraftIds(activeFilterIds);
    restoreFocusAfterModalClose(triggerRef.current);
  }, [activeFilterIds, closeModal, surface]);

  useModalDialog({ open: mobileOpen, panelRef: mobilePanelRef, initialFocusRef: closeButtonRef, onEscape: closeMobileAndRestore });

  if (tags.length === 0) return null;

  function openFilters() {
    if (isMobile) {
      setDraftIds(activeFilterIds);
      openModal(surface);
    } else {
      setDesktopOpen((current) => !current);
    }
  }

  function toggleDesktop(id: string) {
    onActiveFilterIdsChange(toggleId(activeFilterIds, id));
  }

  function applyMobile() {
    onActiveFilterIdsChange(draftIds);
    closeModal(surface);
    restoreFocusAfterModalClose(triggerRef.current);
  }

  const trigger = (
    <button
      ref={triggerRef}
      className="button button-subtle gallery-filter-trigger"
      type="button"
      aria-expanded={isMobile ? mobileOpen : desktopOpen}
      aria-controls={panelId}
      onClick={openFilters}
    >
      Filters{activeFilterIds.length > 0 ? <span aria-label={`${activeFilterIds.length} active filters`}>{activeFilterIds.length}</span> : null}
    </button>
  );

  return (
    <div className="gallery-filter-control" ref={desktopRootRef}>
      {trigger}
      {!isMobile && desktopOpen ? (
        <div className="gallery-filter-disclosure" id={panelId}>
          <FilterGroups groups={groupedTags} selectedIds={activeFilterIds} onToggle={toggleDesktop} />
          <div className="gallery-filter-actions">
            <button className="button button-ghost button-small" type="button" disabled={activeFilterIds.length === 0} onClick={() => onActiveFilterIdsChange([])}>Clear all</button>
            <button className="button button-primary button-small" type="button" onClick={() => setDesktopOpen(false)}>Done</button>
          </div>
        </div>
      ) : null}

      {mounted && isMobile && mobileOpen ? createPortal(
        <div className="gallery-filter-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeMobileAndRestore()}>
          <section ref={mobilePanelRef} className="gallery-filter-sheet" id={panelId} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
            <div className="gallery-filter-sheet-header">
              <div>
                <h2 id={`${panelId}-title`}>Filters</h2>
                <p>{draftIds.length === 0 ? "No filters selected" : `${draftIds.length} filter${draftIds.length === 1 ? "" : "s"} selected`}</p>
              </div>
              <button ref={closeButtonRef} className="button button-ghost button-small" type="button" onClick={closeMobileAndRestore}>Close</button>
            </div>
            <FilterGroups groups={groupedTags} selectedIds={draftIds} onToggle={(id) => setDraftIds((current) => toggleId(current, id))} />
            <div className="gallery-filter-sheet-actions">
              <button className="button button-ghost" type="button" disabled={draftIds.length === 0} onClick={() => setDraftIds([])}>Clear all</button>
              <button className="button button-primary" type="button" onClick={applyMobile}>Apply filters</button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function FilterGroups({ groups, selectedIds, onToggle }: { groups: Array<{ id: string; label: string; tags: GalleryFilterTag[] }>; selectedIds: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="gallery-filter-groups">
      {groups.map((group) => (
        <fieldset className="gallery-filter-group" key={group.id}>
          <legend>{group.label}</legend>
          <div className="gallery-filter-options">
            {group.tags.map((tag) => (
              <label key={tag.id}>
                <input type="checkbox" checked={selectedIds.includes(tag.id)} onChange={() => onToggle(tag.id)} />
                <span>{tag.label}</span>
                <strong>{tag.assetCount.toLocaleString()}</strong>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function groupTags(tags: GalleryFilterTag[]) {
  const groups = new Map<string, GalleryFilterTag[]>();
  for (const tag of tags) groups.set(tag.group, [...(groups.get(tag.group) || []), tag]);
  return [...groups].map(([id, values]) => ({ id, label: GROUP_LABELS[id] || id, tags: values }));
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}
