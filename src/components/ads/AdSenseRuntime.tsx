"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { getFixedHeaderSize, hasValidAdSenseConfiguration } from "@/lib/ads/config";
import { hasVisibleAdSenseOwnedSurface } from "@/lib/ads/creativeEvidence";
import { evaluateAdSlotEligibility, isAdPageFamily } from "@/lib/ads/eligibility";
import { measureAdRailLayout } from "@/lib/ads/layout";
import {
  AD_FALLBACK_TIMEOUT_MS,
  AD_SCRIPT_AVAILABILITY_GRACE_MS,
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
const FULL_LAYOUT_SELECTOR = ".public-page-shell[data-ad-layout='full']";
const NEAR_VIEWPORT_MARGIN_PX = 400;

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
    let scriptGraceTimer: ReturnType<typeof setTimeout> | null = null;
    let layoutFrame = 0;
    let reviewFrame = 0;
    let scriptListenerCleanup: (() => void) | null = null;
    let scriptEnsuredForLifecycle = false;
    const observedUnits = new Set<HTMLElement>();
    const observedFrames = new Set<HTMLIFrameElement>();
    const coordinator = createAdPageCoordinator((snapshot) => {
      if (!active) return;
      applyPageState(snapshot.state);
      if (snapshot.state !== "pending") clearLifecycleTimers();
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) initializeUnit(entry.target as HTMLElement, true);
        }
      },
      { rootMargin: `${NEAR_VIEWPORT_MARGIN_PX}px 0px`, threshold: 0 },
    );

    const resizeObserver = new ResizeObserver(() => scheduleUnitReview());
    const structureObserver = new MutationObserver(() => {
      observeUnits();
      scheduleUnitReview();
    });
    const statusObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const unit = mutation.target as HTMLElement;
        if (!unit.matches(LIVE_UNIT_SELECTOR) || unit.dataset.adInitialized !== "true") continue;
        reportUnitState(unit);
      }
    });

    window.addEventListener("resize", scheduleLayoutSync);
    window.addEventListener("orientationchange", scheduleLayoutSync);
    structureObserver.observe(document.body, { childList: true, subtree: true });
    statusObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-ad-status"],
      subtree: true,
    });
    applyPageState("pending");
    syncResponsiveLayout();
    observeUnits();

    return () => {
      active = false;
      clearLifecycleTimers();
      scriptListenerCleanup?.();
      structureObserver.disconnect();
      statusObserver.disconnect();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      if (reviewFrame) cancelAnimationFrame(reviewFrame);
      observedUnits.clear();
      observedFrames.clear();
      coordinator.dispose();
      window.removeEventListener("resize", scheduleLayoutSync);
      window.removeEventListener("orientationchange", scheduleLayoutSync);
      document.documentElement.removeAttribute("data-ad-page-state");
      document.documentElement.removeAttribute("data-ad-rails-eligible");
      hideEveryFallback();
    };

    function observeUnits() {
      if (!active) return;
      for (const unit of observedUnits) {
        if (unit.isConnected) continue;
        intersectionObserver.unobserve(unit);
        resizeObserver.unobserve(unit);
        observedUnits.delete(unit);
      }
      for (const frame of observedFrames) {
        if (frame.isConnected) continue;
        resizeObserver.unobserve(frame);
        observedFrames.delete(frame);
      }
      for (const unit of document.querySelectorAll<HTMLElement>(LIVE_UNIT_SELECTOR)) {
        if (!observedUnits.has(unit)) {
          observedUnits.add(unit);
          intersectionObserver.observe(unit);
          resizeObserver.observe(unit);
        }
        observeCreativeFrames(unit);
        if (unit.dataset.adInitialized === "true") reportUnitState(unit);
        if (isWithinLoadRange(unit)) initializeUnit(unit, true);
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
      if (registered && coordinator.getSnapshot().state === "pending") startFallbackTimer();
      if (!scriptEnsuredForLifecycle) {
        scriptEnsuredForLifecycle = true;
        startScriptGraceTimer();
        scriptListenerCleanup = ensureScript(
          clientId,
          () => clearScriptGraceTimer(),
          () => {
            clearScriptGraceTimer();
            if (active) coordinator.reportFailure("script-failure");
          },
        );
      }

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        reportUnitState(unit);
      } catch {
        unit.dataset.adInitializationError = "true";
        coordinator.reportFailure("initialization-failure");
      }
    }

    function reportUnitState(unit: HTMLElement) {
      const slot = unit.closest<HTMLElement>(SLOT_WRAPPER_SELECTOR);
      const slotId = slot?.dataset.adSlot;
      const status = readOfficialAdSenseStatus(unit.getAttribute("data-ad-status"));
      if (!slot || !slotId || !status || unit.dataset.adInitialized !== "true") return;
      observeCreativeFrames(unit);
      const hasVisibleContent = (
        status === "filled" || status === "unfill-optimized"
      ) && hasVisibleAdSenseOwnedSurface(unit);
      slot.dataset.adVerifiedContent = hasVisibleContent ? "true" : "false";
      coordinator.reportStatus(slotId, status, hasVisibleContent);
      syncFallbackVisibility();
    }

    function observeCreativeFrames(unit: HTMLElement) {
      for (const frame of unit.querySelectorAll<HTMLIFrameElement>("iframe")) {
        if (observedFrames.has(frame)) continue;
        observedFrames.add(frame);
        resizeObserver.observe(frame);
      }
    }

    function startFallbackTimer() {
      if (fallbackTimer) return;
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (active) coordinator.reportTimeout();
      }, AD_FALLBACK_TIMEOUT_MS);
    }

    function startScriptGraceTimer() {
      if (scriptGraceTimer) return;
      scriptGraceTimer = setTimeout(() => {
        scriptGraceTimer = null;
        if (active) coordinator.reportFailure("script-failure");
      }, AD_SCRIPT_AVAILABILITY_GRACE_MS);
    }

    function clearFallbackTimer() {
      if (!fallbackTimer) return;
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    function clearScriptGraceTimer() {
      if (!scriptGraceTimer) return;
      clearTimeout(scriptGraceTimer);
      scriptGraceTimer = null;
    }

    function clearLifecycleTimers() {
      clearFallbackTimer();
      clearScriptGraceTimer();
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
        const unit = wrapper.querySelector<HTMLElement>(LIVE_UNIT_SELECTOR);
        if (!fallback || !unit) continue;
        const status = readOfficialAdSenseStatus(unit.getAttribute("data-ad-status"));
        const adSenseOwnsSlot = status === "filled" || status === "unfill-optimized";
        fallback.hidden = !(
          showFallbacks
          && isActuallyVisible(wrapper)
          && !adSenseOwnsSlot
          && wrapper.dataset.adVerifiedContent !== "true"
        );
      }
    }

    function scheduleLayoutSync() {
      if (!active || layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        syncResponsiveLayout();
        observeUnits();
      });
    }

    function scheduleUnitReview() {
      if (!active || reviewFrame) return;
      reviewFrame = requestAnimationFrame(() => {
        reviewFrame = 0;
        for (const unit of observedUnits) {
          if (unit.dataset.adInitialized === "true") reportUnitState(unit);
        }
      });
    }

    function syncResponsiveLayout() {
      syncFixedHeaderSizes();
      const shell = document.querySelector<HTMLElement>(FULL_LAYOUT_SELECTOR);
      if (!shell) {
        document.documentElement.removeAttribute("data-ad-rails-eligible");
        return;
      }
      const rect = shell.getBoundingClientRect();
      const railLayout = measureAdRailLayout(window.innerWidth, { left: rect.left, right: rect.right });
      shell.dataset.adRailLayout = railLayout.eligible ? "eligible" : "ineligible";
      shell.dataset.adRailLeftGutter = String(Math.round(railLayout.leftGutter));
      shell.dataset.adRailRightGutter = String(Math.round(railLayout.rightGutter));
      document.documentElement.dataset.adRailsEligible = railLayout.eligible ? "true" : "false";
    }

    function syncFixedHeaderSizes() {
      const size = getFixedHeaderSize(window.innerWidth);
      for (const wrapper of document.querySelectorAll<HTMLElement>("[data-ad-size-policy='fixed-header-v1']")) {
        const unit = wrapper.querySelector<HTMLElement>(LIVE_UNIT_SELECTOR);
        wrapper.dataset.adFixedWidth = String(size.width);
        wrapper.dataset.adFixedHeight = String(size.height);
        wrapper.style.width = `${size.width}px`;
        wrapper.style.height = `${size.height}px`;
        wrapper.style.minHeight = `${size.height}px`;
        wrapper.style.maxHeight = `${size.height}px`;
        if (unit) {
          unit.style.width = `${size.width}px`;
          unit.style.height = `${size.height}px`;
        }
      }
    }

    function isWithinLoadRange(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= -NEAR_VIEWPORT_MARGIN_PX && rect.top <= window.innerHeight + NEAR_VIEWPORT_MARGIN_PX;
    }
  }, [clientId, pathname]);

  return null;
}

function ensureScript(clientId: string, onLoaded: () => void, onFailure: () => void) {
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (script?.dataset.adLoadState === "failed") {
    onFailure();
    return () => undefined;
  }
  if (script?.dataset.adLoadState === "loaded") {
    onLoaded();
    return () => undefined;
  }

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
    onLoaded();
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
