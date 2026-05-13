# Round 4T Ad Visibility Mode Change

The env-gated placeholder mode was removed because normal static exports could hide every ad well unless a build-time flag was set.

- Placeholders visible by default: true
- NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS required: false
- Old placeholder-off default removed: true
- Runtime env flag references remaining: false
- Live ad code added: false

Future live AdSense work should reuse the stable slot IDs and replace the placeholder shell in a separate, explicitly approved live-ad round.
