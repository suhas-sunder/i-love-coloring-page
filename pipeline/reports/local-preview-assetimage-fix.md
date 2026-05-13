# Local Preview AssetImage Fix

- Root cause: The preview resolver honored a localhost .env.local public asset override during static preview instead of falling back to the custom asset-domain default.
- Valid WebP previews render: true
- Preview unavailable labels: 0
- Animals Alligator preview renders: true
- No broken image icons: true
- app/api added: false
