# Predeploy Print Current Audit

| Check | Result |
| --- | --- |
| baselinePrintTriggeredByWindowPrint | pass |
| baselineOpenedAboutBlankPopup | pass |
| baselineBlankPageRisk | risk |
| currentPdfStylePrintPathPresent | pass |
| currentWindowPrintPathRemovedFromImageCard | pass |
| currentAboutBlankPopupAbsent | pass |
| pngJpgWebpDownloadsAccessible | pass |
| svgExposedAnywhereInPrintOrDownloadUi | pass |

- The baseline card print action used browser HTML printing through window.print, so the round replaced it with generated one-page PDF output.
- The current implementation has a generated PDF print path.
