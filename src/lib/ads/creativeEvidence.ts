const GOOGLE_MANAGED_HOST_SUFFIXES = [
  "doubleclick.net",
  "google.com",
  "googleadservices.com",
  "googlesyndication.com",
] as const;

type StyleReader = (element: Element) => Pick<CSSStyleDeclaration, "display" | "visibility">;

export function hasVisibleAdSenseOwnedSurface(
  unit: HTMLElement,
  readStyle: StyleReader = (element) => getComputedStyle(element),
) {
  if (!hasVisibleBox(unit, readStyle)) return false;
  return [...unit.querySelectorAll<HTMLIFrameElement>("iframe")].some((frame) => (
    isGoogleManagedFrameSource(frame.getAttribute("src")) && hasVisibleBox(frame, readStyle)
  ));
}

export function isGoogleManagedFrameSource(value: string | null | undefined) {
  if (!value) return false;
  try {
    const hostname = new URL(value, "https://www.ilovecoloringpage.com").hostname.toLowerCase();
    return GOOGLE_MANAGED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function hasVisibleBox(element: HTMLElement, readStyle: StyleReader) {
  const style = readStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
