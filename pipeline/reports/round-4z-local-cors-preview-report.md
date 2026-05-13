# Round 4Z Local CORS Preview Report

- Helper script: pipeline/scripts/round-4z-cors-media-server.mjs
- Command: node pipeline/scripts/round-4z-cors-media-server.mjs --root pipeline/r2-upload --port 4176
- Production dependency: false
- The helper serves only pipeline/r2-upload and sends CORS headers for localhost preview origins.
