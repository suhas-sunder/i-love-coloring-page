# Pre-refinement visual audit

## Confirmed findings

| Surface | Reproduced finding | Cause | Resolution in this stage |
| --- | --- | --- | --- |
| Homepage and collection-card media | Portrait WebP preview was contained inside a 4:3 card frame, making meaningful line art small with large side wells. | Frame ratio did not match the verified 341 x 512 portrait preview role. | Standard collection cards use a 3:4 frame and compact cards a 4:5 frame; no artwork is cropped or altered. |
| Hub printable grid | Portrait art had overly wide surrounding space. | The 3:4 grid frame was wider than the portrait preview role. | Grid frame is 2:3 with a bounded height; `object-fit: contain` remains, so line art is never clipped. |
| Categories at compact desktop widths | The original centered fixed disclosure was vulnerable to exceeding its available viewport width and sparse group alignment made the menu look detached. | Fixed positioning and a 1080-pixel maximum panel did not suit 1024-pixel viewports. | Normal widths use trigger-relative placement; compact desktop uses a centered fixed panel bounded to the viewport. Groups align at their content start and counts use tabular figures. |
| Mobile search at 390 CSS pixels | A full-height dialog placed its only closing action at the bottom, leaving a large unexplained empty region. | The dialog forced `100dvh` and its footer used auto top margin. | The dialog is a safe-area-aware top sheet with a visible header Close control and content-height layout. |
| Trust pages | Wide text measures reduced readability. | Trust content used the wide content measure. | Trust hero/content use the normal reading measure. |

## Deliberately not changed

- Original downloadable artwork, transparent bounds, and source composition remain intact.
- Printable page information architecture, approved navigation destinations, public indexation decisions, and ad placement configuration were not expanded.
- There are no genuine landscape or square runtime printable previews; all 6,352 verified production previews are portrait. This is a data limitation, not a layout regression.

## Verification scope

Local browser checks covered the homepage, a hub, Categories at 1024 pixels, the mobile search surface at 390 x 844, and the configured printable route. The follow-up production verification must repeat these checks from the deployed revision before any release decision.
