"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { hasValidAdSenseConfiguration } from "@/lib/ads/config";
import { evaluateAdSlotEligibility, isAdPageFamily } from "@/lib/ads/eligibility";
import {
  AD_FALLBACK_TIMEOUT_MS,
  createAdPageCoordinator,
  readOfficialAdSenseStatus,
  type AdPageState,
} from "@/lib/ads/pageCoordinator";
import type { AdSlotId } from "@/lib/ads/types";

type AdSenseRuntimeProps = {
  clientId: string;
};

const SCRIPT_ID = "adsense-runtime";
const LIVE_UNIT_SELECTOR = ".ad-slot-live-unit";
const SLOT_WRAPPER_SELECTOR = "[data-ad-fallback-policy='page-all-or-none-v1']";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, never>>;
  }
}

export function AdSenseRuntime({ clientId }: AdSenseRuntimeProps) {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let scriptListenerCleanup: (() => void) | null = null;
    let scriptEnsuredForLifecycle = false;
    const observed = new Set<HTMLElement>();
    const coordinator = createAdPageCoordinator((snapshot) => {
      if (!active) return;
      applyPageState(snapshot.state);
      if (snapshot.state !== "pending") clearFallbackTimer();
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) initializeUnit(entry.target as HTMLElement, true);
        }
      },
      { rootMargin: "400px 0px", threshold: 0 },
    );

    const structureObserver = new MutationObserver(observeUnits);
    const statusObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const unit = mutation.target as HTMLElement;
        if (!unit.matches(LIVE_UNIT_SELECTOR) || unit.dataset.adInitialized !== "true") continue;
        const slotId = unit.closest<HTMLElement>(SLOT_WRAPPER_SELECTOR)?.dataset.adSlot;
        const status = readOfficialAdSenseStatus(unit.getAttribute("data-ad-status"));
        if (slotId && status) coordinator.reportStatus(slotId, status);
      }
    });

    window.addEventListener("resize", syncFallbackVisibility);
    structureObserver.observe(document.body, { childList: true, subtree: true });
    statusObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-ad-status"],
      subtree: true,
    });
    applyPageState("pending");
    observeUnits();

    return () => {
      active = false;
      clearFallbackTimer();
      scriptListenerCleanup?.();
      structureObserver.disconnect();
      statusObserver.disconnect();
      intersectionObserver.disconnect();
      observed.clear();
      coordinator.dispose();
      window.removeEventListener("resize", syncFallbackVisibility);
      document.documentElement.removeAttribute("data-ad-page-state");
      hideEveryFallback();
    };

    function observeUnits() {
      if (!active) return;
      for (const unit of observed) {
        if (unit.isConnected) continue;
        intersectionObserver.unobserve(unit);
        observed.delete(unit);
      }
      for (const unit of document.querySelectorAll<HTMLElement>(LIVE_UNIT_SELECTOR)) {
        if (observed.has(unit)) continue;
        observed.add(unit);
        intersectionObserver.observe(unit);
      }
      syncFallbackVisibility();
    }

    function initializeUnit(unit: HTMLElement, nearViewport: boolean) {
      if (!active) return;
      const slot = unit.closest<HTMLElement>(SLOT_WRAPPER_SELECTOR);
      const pageFamily = slot?.dataset.adPageFamily;
      const slotId = slot?.dataset.adSlot as AdSlotId | undefined;
      if (!slot || !slotId || !isAdPageFamily(pageFamily)) return;

      const decision = evaluateAdSlotEligibility({
        slotId,
        pageFamily,
        viewportWidth: window.innerWidth,
        configurationValid: hasValidAdSenseConfiguration(),
        actuallyVisible: isActuallyVisible(slot) && isActuallyVisible(unit),
        nearViewport,
        alreadyInitialized: unit.dataset.adInitialized === "true",
      });
      unit.dataset.adEligibility = decision.reason;
      if (!decision.eligible) return;

      unit.dataset.adInitialized = "true";
      const registered = coordinator.registerUnit(slotId);
      if (registered) startFallbackTimer();
      if (!scriptEnsuredForLifecycle) {
        scriptEnsuredForLifecycle = true;
        scriptListenerCleanup = ensureScript(clientId, () => {
          if (active) coordinator.reportFailure("script-failure");
        });
      }

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        const initialStatus = readOfficialAdSenseStatus(unit.getAttribute("data-ad-status"));
        if (initialStatus) coordinator.reportStatus(slotId, initialStatus);
      } catch {
        unit.dataset.adInitializationError = "true";
        coordinator.reportFailure("initialization-failure");
      }
    }

    function startFallbackTimer() {
      if (fallbackTimer) return;
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (active) coordinator.reportTimeout();
      }, AD_FALLBACK_TIMEOUT_MS);
    }

    function clearFallbackTimer() {
      if (!fallbackTimer) return;
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    function applyPageState(state: AdPageState) {
      document.documentElement.dataset.adPageState = state;
      syncFallbackVisibility();
    }

    function syncFallbackVisibility() {
      if (!active) return;
      const showFallbacks = document.documentElement.dataset.adPageState === "fallback";
      for (const wrapper of document.querySelectorAll<HTMLElement>(SLOT_WRAPPER_SELECTOR)) {
        const fallback = wrapper.querySelector<HTMLElement>("[data-ad-fallback]");
        if (!fallback) continue;
        fallback.hidden = !(showFallbacks && isActuallyVisible(wrapper));
      }
    }
  }, [clientId, pathname]);

  return null;
}

function ensureScript(clientId: string, onFailure: () => void) {
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (script?.dataset.adLoadState === "failed") {
    onFailure();
    return () => undefined;
  }
  if (script?.dataset.adLoadState === "loaded") return () => undefined;

  const created = !script;
  if (!script) {
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  }

  const markLoaded = () => {
    if (script) script.dataset.adLoadState = "loaded";
    script?.removeEventListener("error", markFailed);
  };
  const markFailed = () => {
    if (script) script.dataset.adLoadState = "failed";
    script?.removeEventListener("load", markLoaded);
    onFailure();
  };
  script.addEventListener("load", markLoaded, { once: true });
  script.addEventListener("error", markFailed, { once: true });
  if (created) document.head.append(script);

  return () => {
    script?.removeEventListener("load", markLoaded);
    script?.removeEventListener("error", markFailed);
  };
}

function hideEveryFallback() {
  for (const fallback of document.querySelectorAll<HTMLElement>("[data-ad-fallback]")) fallback.hidden = true;
}

function isActuallyVisible(element: HTMLElement) {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
