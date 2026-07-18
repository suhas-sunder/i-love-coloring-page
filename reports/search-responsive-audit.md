# Responsive search audit

The dialog already uses native dialog semantics, focus trapping/restoration, Escape handling, portal ownership, body-scroll locking, and a separate mobile-header Search action.

Verified CSS causes of the poor mobile rendering were a full-height grid without explicit start alignment, an unconstrained footer row, no safe-area padding, and missing horizontal overflow containment. The foundation now uses start-aligned grid content, a footer pushed to available space, 100dvh containment, overscroll containment, and safe-area padding.

The prior 320, 375, 390, and 430 CSS-pixel and landscape acceptance remains valid; this stage rechecked the final hydrated search and menu behavior at 390 pixels with full-viewport dialogs, focus, body locking, zero ad output, and zero horizontal overflow. The next task owns pixel-level visual polish, not semantic repair.
