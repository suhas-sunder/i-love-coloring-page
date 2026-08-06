export const AD_RAIL_LAYOUT = {
  minViewportWidth: 2400,
  width: 300,
  height: 600,
  contentGap: 24,
  outerPadding: 16,
  topOffset: 112,
} as const;

export type AdRailLayout = {
  eligible: boolean;
  leftGutter: number;
  rightGutter: number;
  requiredGutter: number;
};

export function measureAdRailLayout(
  viewportWidth: number,
  contentBounds: { left: number; right: number },
): AdRailLayout {
  const leftGutter = Math.max(0, contentBounds.left);
  const rightGutter = Math.max(0, viewportWidth - contentBounds.right);
  const requiredGutter = AD_RAIL_LAYOUT.width + AD_RAIL_LAYOUT.contentGap + AD_RAIL_LAYOUT.outerPadding;
  return {
    eligible:
      viewportWidth >= AD_RAIL_LAYOUT.minViewportWidth
      && leftGutter >= requiredGutter
      && rightGutter >= requiredGutter,
    leftGutter,
    rightGutter,
    requiredGutter,
  };
}
