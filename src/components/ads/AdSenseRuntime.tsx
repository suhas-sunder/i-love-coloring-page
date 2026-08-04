"use client";

import { useEffect } from "react";

import { hasValidAdSenseConfiguration } from "@/lib/ads/config";
import { evaluateAdSlotEligibility, isAdPageFamily } from "@/lib/ads/eligibility";
import type { AdSlotId } from "@/lib/ads/types";

type AdSenseRuntimeProps = {
  clientId: string;
  regionalRequirementsSatisfied: boolean;
};

const SCRIPT_ID = "adsense-runtime";
const LIVE_UNIT_SELECTOR = ".ad-slot-live-unit";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, never>>;
  }
}

export function AdSenseRuntime({ clientId, regionalRequirementsSatisfied }: AdSenseRuntimeProps) {
  useEffect(() => {
    const observed = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) initializeUnit(entry.target as HTMLElement, true);
        }
      },
      { rootMargin: "400px 0px", threshold: 0 },
    );

    const observeUnits = () => {
      for (const unit of observed) {
        if (unit.isConnected) continue;
        observer.unobserve(unit);
        observed.delete(unit);
      }
      for (const unit of document.querySelectorAll<HTMLElement>(LIVE_UNIT_SELECTOR)) {
        if (observed.has(unit)) continue;
        observed.add(unit);
        observer.observe(unit);
      }
    };

    const mutations = new MutationObserver(observeUnits);
    mutations.observe(document.body, { childList: true, subtree: true });
    observeUnits();

    return () => {
      mutations.disconnect();
      observer.disconnect();
      observed.clear();
    };

    function initializeUnit(unit: HTMLElement, nearViewport: boolean) {
      const slot = unit.closest<HTMLElement>(".ad-slot");
      const pageFamily = slot?.dataset.adPageFamily;
      const slotId = slot?.dataset.adSlot as AdSlotId | undefined;
      if (!slot || !slotId || !isAdPageFamily(pageFamily)) return;

      const decision = evaluateAdSlotEligibility({
        slotId,
        pageFamily,
        viewportWidth: window.innerWidth,
        liveAdvertisingEnabled: true,
        configurationValid: hasValidAdSenseConfiguration(),
        regionalRequirementsSatisfied,
        actuallyVisible: isActuallyVisible(slot) && isActuallyVisible(unit),
        nearViewport,
        alreadyInitialized: unit.dataset.adInitialized === "true",
      });
      unit.dataset.adEligibility = decision.reason;
      if (!decision.eligible) return;

      unit.dataset.adInitialized = "true";
      ensureScript(clientId);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        unit.dataset.adInitializationError = "true";
      }
    }
  }, [clientId, regionalRequirementsSatisfied]);

  return null;
}

function ensureScript(clientId: string) {
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  document.head.append(script);
}

function isActuallyVisible(element: HTMLElement) {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
