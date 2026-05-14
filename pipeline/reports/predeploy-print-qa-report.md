# Predeploy Print QA Report

| Check | Result |
| --- | --- |
| sampleCount | 6 |
| printFlowOpens | pass |
| generatedPrintablePageCount | 1 |
| noBlankPrintPages | pass |
| artworkCentered | pass |
| artworkUsesMostOfPage | pass |
| borderFrameVisible | pass |
| brandingVisible | pass |
| brandingOverlapsArtwork | pass |
| appUiControlsInPrintableOutput | pass |
| pngDownloadWorks | pass |
| jpgDownloadWorks | pass |
| webpDownloadWorks | pass |
| svgDownloadAbsent | pass |
| noConsoleErrors | pass |

Artifacts: `pipeline/review/predeploy-local/print`

## Samples

- Animals Alligator: Animals Alligator, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\animals-alligator-modal.png`, PDF `pipeline\review\predeploy-local\print\animals-alligator.pdf`
- T-Rex item: Anime Girl Summoning Jutsu Tyrannosaurus Rex Dinosaur, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\t-rex-modal.png`, PDF `pipeline\review\predeploy-local\print\t-rex.pdf`
- Christmas item: Christmas Holiday Advent Calendar, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\christmas-modal.png`, PDF `pipeline\review\predeploy-local\print\christmas.pdf`
- Anime Girls item: Anime Girl Air Balloon, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\anime-girls-modal.png`, PDF `pipeline\review\predeploy-local\print\anime-girls.pdf`
- Geometric/Mandala item: Mandala Geometry Patterns Animal Mandala Fox, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\geometric-mandala-modal.png`, PDF `pipeline\review\predeploy-local\print\geometric-mandala.pdf`
- High-detail item: Mandala Geometry Patterns Animal Mandala Fox, PDF pages 1, screenshot `pipeline\review\predeploy-local\print\high-detail-modal.png`, PDF `pipeline\review\predeploy-local\print\high-detail.pdf`

Manual browser limitation: Browser print dialogs may still expose user printer settings, but the generated artifact is a one-page PDF rather than raw browser HTML.
