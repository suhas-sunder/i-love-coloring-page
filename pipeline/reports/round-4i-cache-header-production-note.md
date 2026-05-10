# Round 4I Cache Header Production Note

Generated: 2026-05-10

Round 4H verified the temporary R2 public route, but those temporary test URLs did not return cache headers. That was acceptable for delivery verification.

Before production launch, configure cache headers or equivalent Cloudflare caching behavior for generated media and verify the public responses. The recommended policy for immutable generated files is:

```text
public, max-age=31536000, immutable
```

This check must pass before SEO image sitemap or Open Graph image work starts.
