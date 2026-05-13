# Round 4S Horizontal Overflow Audit

- Reproduced before fix: true
- Source of horizontal overflow: section-band used calc(50% - 50vw); mobile nav and menu geometry were also audited as possible overflow contributors.
- Fix: Replaced 100vw section-band expansion with page-gutter expansion, widened and centered the More menu, and converted mobile nav to a full-screen panel.
- No horizontal overflow after fix: true
- No body overflow after fix: true
- Global overflow-x hidden used as mask: false
- Widths tested: 390, 430, 768, 1024, 1440, 1920, 2560
- Widths with horizontal scrollbar: none
