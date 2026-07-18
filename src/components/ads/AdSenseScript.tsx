import Script from "next/script";

import { resolveAdMode } from "@/lib/ads/mode";

export function AdSenseScript() {
  const configuration = resolveAdMode();
  if (configuration.mode !== "live" || !configuration.publisherId) return null;

  const scriptHost = ["https://pagead2", "googlesyndication.com"].join(".");
  const scriptFile = `${["adsby", "google"].join("")}.js`;
  const source = `${scriptHost}/pagead/js/${scriptFile}?client=${encodeURIComponent(configuration.publisherId)}`;
  const queueName = ["adsby", "google"].join("");
  const initializer = `(()=>{const k=${JSON.stringify(queueName)},s=()=>document.querySelectorAll(".ad-slot-live-unit:not([data-initialized])").forEach(e=>{e.dataset.initialized="true";(window[k]=window[k]||[]).push({})});s();new MutationObserver(s).observe(document.body,{childList:true,subtree:true})})()`;
  return (
    <>
      <Script async crossOrigin="anonymous" id="adsense-runtime" src={source} strategy="afterInteractive" />
      <Script id="adsense-slot-initializer" strategy="afterInteractive">{initializer}</Script>
    </>
  );
}
