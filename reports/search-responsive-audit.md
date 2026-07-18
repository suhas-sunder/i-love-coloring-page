# Responsive search audit

The dialog already uses native dialog semantics, focus trapping/restoration, Escape handling, portal ownership, body-scroll locking, and a separate mobile-header Search action.

Verified CSS causes of the poor mobile rendering were a full-height grid without explicit start alignment, an unconstrained footer row, no safe-area padding, and missing horizontal overflow containment. The foundation now uses start-aligned grid content, a footer pushed to available space, 100dvh containment, overscroll containment, and safe-area padding.

Browser acceptance remains required at 320, 375, 390, and 430 CSS pixels plus landscape with the on-screen keyboard approximated. This task avoids a fragile pixel-diff baseline; the next visual pass should check chip wrapping, close/browse controls, input visibility, and zero document overflow.
