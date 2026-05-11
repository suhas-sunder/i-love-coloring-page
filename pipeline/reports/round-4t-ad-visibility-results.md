# Round 4T Ad Visibility Results

- Why placeholders were not visible: The previous placeholder system depended on a build-time environment flag, so a normal static build exported no ad wells. Stale exported HTML could also preserve that hidden state.
- Likely cause: env flag and stale static export
- Placeholders visible by default: true
- Old env-gated off behavior removed: true
- Header banner visible: true
- Side rails visible: true
- Inline slots visible: true
- Slot count changed: false
- Slot IDs changed: false
- Live ad code added: false
