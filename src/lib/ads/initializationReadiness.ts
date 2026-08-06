export type AdSurfaceSize = {
  width: number;
  height: number;
};

export type AdInitializationMinimumSize = AdSurfaceSize & {
  exact: boolean;
};

export function hasRequiredAdSurfaceSize(
  wrapper: AdSurfaceSize,
  unit: AdSurfaceSize,
  minimum: AdInitializationMinimumSize,
) {
  if (![wrapper.width, wrapper.height, unit.width, unit.height].every(isFinitePositive)) return false;
  return meetsMinimum(wrapper, minimum) && meetsMinimum(unit, minimum);
}

function meetsMinimum(size: AdSurfaceSize, minimum: AdInitializationMinimumSize) {
  if (minimum.exact) {
    return size.width === minimum.width && size.height === minimum.height;
  }
  return size.width >= minimum.width && size.height >= minimum.height;
}

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}
