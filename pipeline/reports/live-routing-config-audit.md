# Live Routing Config Audit

- Static export configured: true
- trailingSlash: false
- Netlify build command: npm run build
- Netlify publish directory: out
- Package build command: next build
- Exported no-slash HTML exists: true
- Exported slash index HTML exists: false
- Exported sitemap exists: true
- Exported robots exists: true
- Generated _redirects exists: false
- Generated _headers exists: false
- Netlify redirect rule count: 0
- Self-redirect rule present: false
- Pretty URLs work locally: true
- Slash URLs work locally: true
- Sitemap paths use no trailing slash: true
- Sitemap paths match exported paths: true
- Netlify publishes out: true
- Netlify build command correct: true

The local export uses extensionless pretty URL serving against `.html` files because `trailingSlash: false` exports routes such as `out/coloring-pages/animals.html`.
