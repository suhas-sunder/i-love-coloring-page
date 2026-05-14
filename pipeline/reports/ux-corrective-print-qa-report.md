# UX Corrective Print QA

| Check | Result |
| --- | --- |
| printQaPassed | pass |
| samplesChecked | 6 |
| printWorkflowOpens | pass |
| titleAndPreviewMeaningfulBeforePrint | pass |
| generatedPrintDocumentOnePageOriented | pass |
| noBlankPrintPagesExpected | pass |
| imageCentered | pass |
| frameAndBrandingVisible | pass |
| noAppUiControlsInPrintOutput | pass |
| svgDownloadAbsent | pass |
| noInfinitePreparingState | pass |
| noUnexplainedAboutBlank | pass |
| actualPrintDialogPageCountInspectable | fail |
| printDialogLimitation | Browser-native print headers and footers are controlled by browser settings. QA validates generated print DOM, print CSS, and headless PDF page count. |

Blockers: none
