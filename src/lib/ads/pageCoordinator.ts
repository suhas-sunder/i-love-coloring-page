export const AD_FALLBACK_TIMEOUT_MS = 13_000;
export const AD_SCRIPT_AVAILABILITY_GRACE_MS = 4_000;

export type AdPageState = "pending" | "fallback" | "adsense-present";

export type OfficialAdSenseStatus = "filled" | "unfilled" | "unfill-optimized";

export type AdPageTransitionReason =
  | "all-initialized-unfilled"
  | "filled"
  | "unfill-optimized"
  | "script-failure"
  | "initialization-failure"
  | "timeout";

export type AdPageSnapshot = {
  state: AdPageState;
  registeredUnitCount: number;
  statuses: Readonly<Record<string, OfficialAdSenseStatus | null>>;
  visibleAdSenseContent: Readonly<Record<string, boolean>>;
  lastTransitionReason: AdPageTransitionReason | null;
};

type AdPageCoordinator = {
  dispose: () => void;
  getSnapshot: () => AdPageSnapshot;
  registerUnit: (logicalSlotId: string) => boolean;
  reportFailure: (reason: Extract<AdPageTransitionReason, "script-failure" | "initialization-failure">) => void;
  reportStatus: (logicalSlotId: string, status: OfficialAdSenseStatus, hasVisibleContent?: boolean) => void;
  reportTimeout: () => void;
};

export function createAdPageCoordinator(
  onStateChange: (snapshot: AdPageSnapshot) => void,
): AdPageCoordinator {
  const statuses = new Map<string, OfficialAdSenseStatus | null>();
  const visibleAdSenseContent = new Map<string, boolean>();
  let state: AdPageState = "pending";
  let lastTransitionReason: AdPageTransitionReason | null = null;
  let disposed = false;

  return {
    dispose() {
      disposed = true;
      statuses.clear();
      visibleAdSenseContent.clear();
    },
    getSnapshot,
    registerUnit(logicalSlotId) {
      if (disposed || statuses.has(logicalSlotId)) return false;
      statuses.set(logicalSlotId, null);
      visibleAdSenseContent.set(logicalSlotId, false);
      return true;
    },
    reportFailure(reason) {
      transitionToFallback(reason);
    },
    reportStatus(logicalSlotId, status, hasVisibleContent = false) {
      if (disposed || !statuses.has(logicalSlotId)) return;

      statuses.set(logicalSlotId, status);
      if (hasVisibleContent) visibleAdSenseContent.set(logicalSlotId, true);
      if ((status === "filled" || status === "unfill-optimized") && hasVisibleContent) {
        transition("adsense-present", status);
        return;
      }

      if (
        state === "pending"
        && statuses.size > 0
        && [...statuses.values()].every((value) => value === "unfilled")
      ) {
        transition("fallback", "all-initialized-unfilled");
      }
    },
    reportTimeout() {
      transitionToFallback("timeout");
    },
  };

  function transitionToFallback(reason: Extract<AdPageTransitionReason, "script-failure" | "initialization-failure" | "timeout">) {
    if (state !== "adsense-present") transition("fallback", reason);
  }

  function transition(nextState: AdPageState, reason: AdPageTransitionReason) {
    if (disposed || state === "adsense-present" || state === nextState) return;
    state = nextState;
    lastTransitionReason = reason;
    onStateChange(getSnapshot());
  }

  function getSnapshot(): AdPageSnapshot {
    return {
      state,
      registeredUnitCount: statuses.size,
      statuses: Object.freeze(Object.fromEntries([...statuses.entries()].sort(([left], [right]) => left.localeCompare(right)))),
      visibleAdSenseContent: Object.freeze(Object.fromEntries([...visibleAdSenseContent.entries()].sort(([left], [right]) => left.localeCompare(right)))),
      lastTransitionReason,
    };
  }
}

export function readOfficialAdSenseStatus(value: string | null | undefined): OfficialAdSenseStatus | null {
  return value === "filled" || value === "unfilled" || value === "unfill-optimized" ? value : null;
}
