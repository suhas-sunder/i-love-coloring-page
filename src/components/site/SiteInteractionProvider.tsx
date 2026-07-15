"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ModalSurfaceKind = "global-search" | "mobile-navigation" | "mobile-filters" | "printable-dialog";
export type ModalSurfaceKey = { kind: ModalSurfaceKind; id: string };

type SiteInteractionContextValue = {
  activeModal: ModalSurfaceKey | null;
  openModal: (surface: ModalSurfaceKey) => void;
  closeModal: (surface: ModalSurfaceKey) => void;
  isModalOpen: (surface: ModalSurfaceKey) => boolean;
};

const SiteInteractionContext = createContext<SiteInteractionContextValue | null>(null);

export function SiteInteractionProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalSurfaceKey | null>(null);
  const openModal = useCallback((surface: ModalSurfaceKey) => setActiveModal(surface), []);
  const closeModal = useCallback((surface: ModalSurfaceKey) => {
    setActiveModal((current) => current && sameSurface(current, surface) ? null : current);
  }, []);
  const isModalOpen = useCallback(
    (surface: ModalSurfaceKey) => Boolean(activeModal && sameSurface(activeModal, surface)),
    [activeModal],
  );

  useEffect(() => {
    if (!activeModal) return;
    const shell = document.querySelector<HTMLElement>(".site-shell");
    const previousOverflow = document.body.style.overflow;
    const previousAriaHidden = shell?.getAttribute("aria-hidden") ?? null;
    const previousInert = shell?.inert ?? false;

    document.body.style.overflow = "hidden";
    if (shell) {
      shell.inert = true;
      shell.setAttribute("aria-hidden", "true");
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!shell) return;
      shell.inert = previousInert;
      if (previousAriaHidden === null) shell.removeAttribute("aria-hidden");
      else shell.setAttribute("aria-hidden", previousAriaHidden);
    };
  }, [activeModal]);

  const value = useMemo(
    () => ({ activeModal, openModal, closeModal, isModalOpen }),
    [activeModal, closeModal, isModalOpen, openModal],
  );

  return <SiteInteractionContext.Provider value={value}>{children}</SiteInteractionContext.Provider>;
}

export function useSiteInteractions() {
  const context = useContext(SiteInteractionContext);
  if (!context) throw new Error("useSiteInteractions must be used inside SiteInteractionProvider");
  return context;
}

function sameSurface(left: ModalSurfaceKey, right: ModalSurfaceKey) {
  return left.kind === right.kind && left.id === right.id;
}
